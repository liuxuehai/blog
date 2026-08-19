---
title: 缓存与插件链
description: MyBatis 一级缓存、二级缓存事务包装和 InterceptorChain 的代理机制。
category: Backend
tags: [Source Reading, MyBatis, Cache, Plugin]
order: 14
updatedDate: 2026-08-19
difficulty: advanced
status: stable
lastReviewed: 2026-08-19
draft: false
sidebar:
  order: 14
---

MyBatis 的缓存不是一个全局 Map：一级缓存属于执行器，二级缓存属于 mapper namespace，并通过事务包装延迟真正提交。插件也不是事件总线，而是对四类核心对象套 JDK 代理。

<!-- more -->

## 先给答案：缓存和插件都在改写执行链，但一个保存结果，一个改变过程

一级/二级缓存的核心问题是“相同查询能否复用结果，以及结果应该跟多大的作用域绑定”；插件的核心问题是“在不修改主流程的情况下，能否观察或改写某个阶段”。两者都包裹 Executor，却不能混为同一种扩展：缓存关心 key、生命周期和失效，插件关心拦截点、责任链顺序和参数变形。

因此缓存命中时，后面的 JDBC、结果集映射甚至部分插件逻辑可能根本不会执行；插件如果修改了 SQL 或分页参数，又可能改变缓存 key 的正确性。排查“缓存读到旧数据”时，必须同时看更新语句的清理范围和插件是否改变了实际执行对象。


## 两级缓存

```text
查询 -> CachingExecutor -> namespace cache
                         `-> BaseExecutor -> localCache
更新 / commit / rollback -> 清理 localCache
                           `-> TransactionalCache commit/rollback
```

## 实现拆解

- `BaseExecutor` 创建 `PerpetualCache` 作为 `localCache`（`mybatis-3/src/main/java/org/apache/ibatis/executor/BaseExecutor.java:51-72`）。
- `BaseExecutor#query` 查询本地 cache，未命中才进入数据库（`mybatis-3/src/main/java/org/apache/ibatis/executor/BaseExecutor.java:143-181`）。
- `CachingExecutor#query` 先构造 key，再查询 `TransactionalCacheManager`（`mybatis-3/src/main/java/org/apache/ibatis/executor/CachingExecutor.java:86-110`）。
- `TransactionalCache` 把结果放入待提交集合，不立即写入最终 cache（`mybatis-3/src/main/java/org/apache/ibatis/cache/decorators/TransactionalCache.java:35-77`）。
- `CachingExecutor#commit` 在 delegate 提交成功后提交二级缓存（`mybatis-3/src/main/java/org/apache/ibatis/executor/CachingExecutor.java:119-123`）。
- rollback 路径清理 pending entries，避免回滚数据泄露（`mybatis-3/src/main/java/org/apache/ibatis/cache/TransactionalCacheManager.java:42-58`）。
- `Configuration` 创建 Executor、StatementHandler、ParameterHandler、ResultSetHandler 时调用 `pluginAll`（`mybatis-3/src/main/java/org/apache/ibatis/session/Configuration.java:690-752`）。
- `InterceptorChain#pluginAll` 按注册顺序逐层包装目标（`mybatis-3/src/main/java/org/apache/ibatis/plugin/InterceptorChain.java:28-38`）。
- `Plugin#wrap` 仅在 `@Intercepts` 签名匹配时创建代理（`mybatis-3/src/main/java/org/apache/ibatis/plugin/Plugin.java:31-54`）。
- 命中方法后，`Plugin#invoke` 把调用包装成 `Invocation` 交给 interceptor（`mybatis-3/src/main/java/org/apache/ibatis/plugin/Plugin.java:56-61`）。

## 关键取舍

### 为什么二级缓存要做事务包装

**替代方案**：查询完成后立即写 namespace cache。
**为什么不行**：当前事务随后回滚时，其他 session 会看到未提交数据。
**证据**：`CachingExecutor#commit` 在 delegate 提交成功后调用 `tcm.commit()`，rollback 路径则调用 `tcm.rollback()`（`CachingExecutor.java:119-137`）。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| 二级缓存对象不可序列化 | 写缓存时报错 | 默认装饰器可能包含序列化缓存 | DTO 实现序列化或换实现 |
| 跨 namespace 更新 | 读到旧数据 | cache 失效以 namespace 为边界 | 配置 `cache-ref` 或刷新 |
| 插件签名错误 | 插件不生效 | `@Intercepts` 不匹配方法 | 检查接口、方法和参数类型 |
| 插件顺序改变 | SQL 结果不同 | 代理按注册顺序嵌套 | 固化配置并测试 |

## 可迁移知识

事务性缓存写入适合任何读缓存与业务提交必须一致的系统；按声明签名过滤代理，则能避免对所有对象调用都付出拦截成本。

> **面试锚点**
> - 一级缓存和二级缓存分别属于谁？
> - 二级缓存为什么不能立即写入？
> - MyBatis 插件为什么只能拦截四类对象？

## Related

- [SqlSession 与 Executor](/notes/source/java/storage/mybatis-3/session-executor/)
- [配置解析与 Mapper 代理](/notes/source/java/storage/mybatis-3/config-and-mapper/)
- [结果集映射](/notes/source/java/storage/mybatis-3/result-mapping/)
