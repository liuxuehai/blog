---
title: 面试专题
description: MyBatis 高频面试题、高难追问、缓存与结果映射故障场景的源码级回答。
category: Backend
tags: [Source Reading, MyBatis, Interview]
order: 19
updatedDate: 2026-08-15
difficulty: advanced
status: stable
lastReviewed: 2026-08-15
draft: false
sidebar:
  order: 19
---

MyBatis 面试的分水岭不是能否说出“半自动 ORM”，而是能否把一次 Mapper 调用追到 `MappedStatement`、`Executor` 和 `ResultSetHandler`，并说明缓存与事务边界。

<!-- more -->

## 高频题

### Mapper 接口为什么不需要实现类？

**30 秒版**：启动时 `MapperRegistry` 为接口创建 `MapperProxyFactory`，调用时返回 JDK 动态代理。代理收到方法后由 `MapperMethod` 根据接口名和方法名找到 statement id，再调用 `SqlSession`。

**展开**：`MapperRegistry#getMapper` 创建代理，`MapperProxy#invoke` 区分 default method 与 SQL method，`MapperMethod#execute` 再按 `SqlCommandType` 选择 API（`mybatis-3/src/main/java/org/apache/ibatis/binding/MapperRegistry.java:44-51`；`MapperProxy.java:59-67`）。

**加分项**：`MapperProxy` 会缓存 `MapperMethodInvoker`，避免每次反射重建元数据。

**常见错答**：说成 Spring 生成了实现类。核心代理由 MyBatis 自己完成。

### 一级缓存和二级缓存有什么区别？

**30 秒版**：一级缓存属于 `Executor`，通常跟 `SqlSession` 一致；二级缓存属于 mapper namespace，多个 session 可以共享。二级缓存通过 `TransactionalCache` 延迟到事务提交后写入。

**展开**：`BaseExecutor#query` 先查 `localCache`，`CachingExecutor#query` 再处理 namespace cache（`mybatis-3/src/main/java/org/apache/ibatis/executor/BaseExecutor.java:143-181`；`CachingExecutor.java:86-137`）。

**加分项**：二级缓存不是跨服务一致性缓存，多数据源写入仍需要明确失效策略。

**常见错答**：说一级缓存是全局缓存。

### 三种 Executor 如何选择？

**30 秒版**：`SimpleExecutor` 每次新建 statement，默认最可预测；`ReuseExecutor` 复用 statement；`BatchExecutor` 累积更新后批量 flush。普通 CRUD 用默认，批量写入才考虑 batch。

**展开**：三者都继承 `BaseExecutor`，共享缓存、事务和生命周期，只替换 `doUpdate` / `doQuery`（`mybatis-3/src/main/java/org/apache/ibatis/executor/BaseExecutor.java:284-294`）。

**加分项**：Batch 查询前可能先 flush，不能把它当成所有操作都延迟到 commit。

**常见错答**：认为 ReuseExecutor 复用的是查询结果。

### MyBatis 插件怎么实现？

**30 秒版**：插件实现 `Interceptor`，用 `@Intercepts` 声明目标接口和方法。`InterceptorChain#pluginAll` 逐个调用 `Plugin.wrap`，匹配签名才创建 JDK 代理。

**展开**：插件只在创建 `Executor`、`StatementHandler`、`ParameterHandler`、`ResultSetHandler` 时插入（`mybatis-3/src/main/java/org/apache/ibatis/session/Configuration.java:690-752`；`Plugin.java:31-61`）。

**加分项**：多个插件是嵌套代理，注册顺序会影响前后置逻辑。

**常见错答**：说插件可以拦截任意业务方法。

### MyBatis 如何映射一对多？

**30 秒版**：`DefaultResultSetHandler` 为每行生成父 row key 和子 row key，用 `nestedResultObjects` 复用已创建对象。父对象只创建一次，后续行把子对象加入集合。

**展开**：`createRowKey` 和 `applyNestedResultMappings` 负责身份、创建和关联（`mybatis-3/src/main/java/org/apache/ibatis/executor/resultset/DefaultResultSetHandler.java:1150-1338`；`1490-1525`）。

**加分项**：`<id>` 映射直接决定嵌套结果合并的 key 质量。

**常见错答**：认为每行都会完整 new 一个父对象再去重。

## 高难追问

### 为什么同一 SqlSession 先查后改再查可能读旧数据？

因为一级缓存按 `CacheKey` 保存结果，后续相同查询可能直接命中。排查时确认是否同一 executor、是否同一 key、statement 是否配置 `flushCache`，再看事务是否已提交。不要只盯 SQL 日志，缓存命中时根本不会发 JDBC 查询。

### `${}` 和 `#{}` 有什么区别？

`#{}` 生成 `ParameterMapping` 并通过 PreparedStatement 绑定；`${}` 是文本替换，可能改变 SQL 结构并引入注入风险。动态 SQL 节点由 `XMLScriptBuilder` 构建，运行时生成 `BoundSql`，但参数绑定和文本替换仍是两条不同路径。

## 场景题

### 线上出现大量 N+1 查询，怎么定位？

检查 `ResultMap` 是否使用 nested select，再通过插件拦截 `StatementHandler#prepare` 记录 statement id、参数和耗时。确认重复 SQL 后，考虑 join、批量 IN、一次性加载或拆分读模型。

### 二级缓存读到旧数据，怎么排查？

确认写操作是否在同一 namespace，是否配置 `cache-ref`，是否存在绕过 MyBatis 的外部写入，以及事务是否真的 commit。重点看 `CachingExecutor#update`、`TransactionalCacheManager#clear` 和 mapper 的 `flushCache`。

## 反向问面试官

- 复杂查询使用 XML、注解还是生成式 SQL？结果映射如何测试？
- 线上是否开启二级缓存？多数据源一致性怎么处理？
- 批量写入使用 `BatchExecutor`，还是数据库 bulk API？

## Related

- [整体架构](/notes/source/java/storage/mybatis-3/architecture/)
- [配置解析与 Mapper 代理](/notes/source/java/storage/mybatis-3/config-and-mapper/)
- [SqlSession 与 Executor](/notes/source/java/storage/mybatis-3/session-executor/)
- [缓存与插件链](/notes/source/java/storage/mybatis-3/cache-and-plugin/)
- [结果集映射](/notes/source/java/storage/mybatis-3/result-mapping/)
