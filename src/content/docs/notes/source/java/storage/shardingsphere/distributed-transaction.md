---
title: 分布式事务
description: 本地事务、XA 与 Seata AT 的 SPI 选择、物理连接协调和提交回滚边界。
category: Backend
tags: [Source Reading, ShardingSphere, Transaction, XA]
order: 26
updatedDate: 2026-08-16
difficulty: advanced
status: stable
lastReviewed: 2026-08-16
draft: false
sidebar:
  order: 26
---

ShardingSphere 把 JDBC 事务状态和分布式事务管理器分开：连接管理器负责物理连接集合，事务引擎负责 XA/AT 等全局协议。这样 `Connection#commit` 仍保持 JDBC 语义，同时可以替换事务实现。

<!-- more -->

## 事务链路

```text
Connection.setAutoCommit(false)
  -> DriverDatabaseConnectionManager.begin
  -> TransactionConnectionContext
  -> local: physical connections
  -> XA/AT: distributed transaction manager

commit/rollback
  -> physical connections
  -> distributed manager
  -> clear transaction context
```

## 实现拆解

- `ShardingSphereConnection` 在需要时调用数据库连接管理器开始事务：`jdbc/src/main/java/org/apache/shardingsphere/driver/jdbc/core/connection/ShardingSphereConnection.java:95`、`:99`。
- `DriverDatabaseConnectionManager#begin` 先更新事务上下文，再执行本地或分布式 begin：`jdbc/src/main/java/org/apache/shardingsphere/driver/jdbc/core/connection/DriverDatabaseConnectionManager.java:130`、`:132`、`:136`。
- `commit` 对缓存的物理连接执行 commit，并在分布式场景调用 `connectionTransaction.commit()`：`DriverDatabaseConnectionManager.java:152`、`:159`、`:163`。
- `rollback` 对物理连接回滚，再交给事务对象完成协议级回滚：`DriverDatabaseConnectionManager.java:175`、`:182`、`:184`。
- 事务引擎按 `TransactionType` 通过 SPI 获取分布式管理器，LOCAL 不创建管理器：`kernel/transaction/core/src/main/java/org/apache/shardingsphere/transaction/ShardingSphereTransactionManagerEngine.java:39`、`:41`。
- XA 实现通过 provider 初始化数据源，并把 begin/commit/rollback 委托给 JTA：`kernel/transaction/type/xa/core/src/main/java/org/apache/shardingsphere/transaction/xa/XAShardingSphereTransactionManager.java:61`、`:108`、`:123`、`:133`。
- `commit(rollbackOnly)` 会在回滚标记存在时改走 rollback：`XAShardingSphereTransactionManager.java:123`、`:125`、`:127`。

## 为什么不只依赖 JDBC 的自动提交

**替代方案**：每个物理连接独立 auto-commit，路由到几个库就提交几个库。
**为什么不行**：跨库写入会产生部分成功，JDBC 的单连接语义无法自动提供原子性；即使连接同时 commit，也没有 prepare/恢复协议。
**证据**：源码把物理连接提交与 `ConnectionTransaction`/`ShardingSphereDistributedTransactionManager` 分开，并通过 XA provider 扩展：`jdbc/src/main/java/org/apache/shardingsphere/driver/jdbc/core/connection/DriverDatabaseConnectionManager.java:159`、`kernel/transaction/api/src/main/java/org/apache/shardingsphere/transaction/spi/ShardingSphereDistributedTransactionManager.java:71`。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| 本地事务跨多个数据源 | 不能保证原子提交 | LOCAL 只协调连接，不提供两阶段提交 | 需要原子性时使用 XA/AT |
| XA provider 缺失 | 初始化或 begin 失败 | SPI 找不到事务管理器 | 检查 provider 类型和依赖 |
| rollbackOnly | 调用 commit 实际回滚 | 全局事务被标记回滚 | 记录事务状态转移并避免继续写入 |
| 自动提交切换 | 隐式 begin/commit | Connection 代理要同步 JDBC 语义 | 明确 setAutoCommit 的业务边界 |

## 可迁移知识

事务适配器应把“资源操作”和“协议协调”分离。资源层只负责连接、Statement 和本地回滚，协议层负责 prepare、提交、恢复和补偿，这一边界也适合消息事务和跨服务工作流。

> **面试锚点**
> - 本地事务和 XA 事务在 ShardingSphere 哪一层分叉？
> - `rollbackOnly` 为什么会改变 commit 行为？
> - 跨分片事务为什么不能靠多个 JDBC connection.commit 保证原子性？

## Related

- [执行引擎](/notes/source/java/storage/shardingsphere/execution-engine/)
- [治理与 Mode](/notes/source/java/storage/shardingsphere/governance/)
- [Seata 源码解析](/notes/source/java/rpc/seata/)