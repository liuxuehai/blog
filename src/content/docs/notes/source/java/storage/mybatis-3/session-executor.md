---
title: SqlSession 与 Executor
description: DefaultSqlSession、Simple/Reuse/BatchExecutor、事务边界和一级缓存的源码链路。
category: Backend
tags: [Source Reading, MyBatis, JDBC, Transaction]
order: 13
updatedDate: 2026-08-15
difficulty: advanced
status: stable
lastReviewed: 2026-08-15
draft: false
sidebar:
  order: 13
---

`SqlSession` 是面向业务的门面，`Executor` 才是 MyBatis 的执行内核。前者把 statement id 变成调用，后者负责缓存、事务和 JDBC 策略。

<!-- more -->

## 调用链

```text
SqlSession.selectList(id, param)
  -> Configuration#getMappedStatement
       -> Executor.query
            |- BaseExecutor: local cache / CacheKey
            `- doQuery -> StatementHandler -> JDBC
```

## 实现拆解

- `DefaultSqlSession#selectList` 取出 `MappedStatement`，检查 session 状态并交给 executor（`mybatis-3/src/main/java/org/apache/ibatis/session/defaults/DefaultSqlSession.java:149-157`）。
- `DefaultSqlSession#update` 执行更新并返回影响行数（`mybatis-3/src/main/java/org/apache/ibatis/session/defaults/DefaultSqlSession.java:192-201`）。
- `BaseExecutor#update` 先清一级缓存，再调用子类 `doUpdate`（`mybatis-3/src/main/java/org/apache/ibatis/executor/BaseExecutor.java:112-119`）。
- `BaseExecutor#createCacheKey` 把 statement id、分页、最终 SQL、环境 id 和参数值组合成 key（`mybatis-3/src/main/java/org/apache/ibatis/executor/BaseExecutor.java:204-242`）。
- `BaseExecutor#query` 命中 `localCache` 直接返回，未命中才进入数据库（`mybatis-3/src/main/java/org/apache/ibatis/executor/BaseExecutor.java:143-181`）。
- `BaseExecutor#commit` 在提交 transaction 前清理本地缓存（`mybatis-3/src/main/java/org/apache/ibatis/executor/BaseExecutor.java:251-263`）。

| Executor | 语句生命周期 | 适用场景 | 代价 |
| --- | --- | --- | --- |
| `SimpleExecutor` | 每次执行新建并关闭 | 默认、行为直接 | 不能复用 statement |
| `ReuseExecutor` | 按 SQL 复用 statement | 重复 SQL 多 | 占用 statement 资源 |
| `BatchExecutor` | 累积更新后 flush | 批量写入 | 错误定位复杂 |

- `SimpleExecutor#doQuery` 走 prepare、parameterize、query（`mybatis-3/src/main/java/org/apache/ibatis/executor/SimpleExecutor.java:56-68`）。
- `ReuseExecutor#doUpdate` 按 `BoundSql#getSql` 查找复用 statement（`mybatis-3/src/main/java/org/apache/ibatis/executor/ReuseExecutor.java:47-53`）。
- `BatchExecutor#doUpdate` 把相同 statement 的参数加入批次（`mybatis-3/src/main/java/org/apache/ibatis/executor/BatchExecutor.java:54-80`）。

## 关键取舍

### 为什么一级缓存绑定在 `SqlSession`

**替代方案**：把查询结果放入全局并发缓存。
**为什么不行**：不同事务和连接的可见性不能简单共享，全局缓存还会放大失效和内存管理问题。
**证据**：`BaseExecutor` 持有 `localCache`，更新、提交、回滚和关闭路径都会清理它（`BaseExecutor.java:51-72`；`BaseExecutor.java:277-282`）。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| 先查后改再查 | 读到旧值 | 一级缓存仍持有结果 | 更新后清缓存或缩短 session 生命周期 |
| Batch 中途查库 | 查询前批量被 flush | 查询必须看到此前更新 | 显式控制 flush 与事务边界 |
| session 已 close | 后续调用失败 | executor 和 transaction 已释放 | 让框架管理生命周期 |

## 可迁移知识

“模板方法 + 策略子类”适合把稳定的正确性边界和可变的性能策略分开。公共层统一缓存、事务和异常，子类只实现一次 SQL 如何执行。

> **面试锚点**
> - 三种 Executor 有什么区别？
> - 一级缓存的 key 包含哪些内容？
> - 为什么更新操作会清理本地缓存？

## Related

- [整体架构](/notes/source/java/storage/mybatis-3/architecture/)
- [缓存与插件链](/notes/source/java/storage/mybatis-3/cache-and-plugin/)
- [结果集映射](/notes/source/java/storage/mybatis-3/result-mapping/)
