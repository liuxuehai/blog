---
title: SQLx Transaction 与 Migration
description: Transaction 的生命周期、savepoint 语义，以及 migration 宏与运行时迁移器的分工。
category: Backend
tags: [Source Reading, SQLx, Rust, Transaction]
order: 75
updatedDate: 2026-08-24
difficulty: advanced
status: stable
lastReviewed: 2026-08-24
draft: false
sidebar:
  order: 75
---

SQLx 把事务建模为持有连接的 RAII 对象：成功时显式 commit，未提交或发生取消时通过 drop/rollback 释放数据库状态；migration 则把版本化文件组织成可重复执行的 schema 变更。

<!-- more -->

## 先给答案：SQLx 把事务建模为持有连接的 RAII 对象：成功时显式 commit，未提交或发生取消时通过 dro…

SQLx 把事务建模为持有连接的 RAII 对象：成功时显式 commit，未提交或发生取消时通过 drop/rollback 释放数据库状态；migration 则把版本化文件组织成可重复执行的 schema 变更。 正文沿“Transaction 链路 -> 为什么 transaction 持有 executor 能力 -> 取消与回滚”展开：先确认入口和状态归属，再跟踪控制流或数据流的推进，最后落到对外可观察的结果。

主要失效边界集中在“transaction 中途 return、迁移文件已执行后改内容、DDL 不支持事务”这些场景。它们破坏的是容量、顺序、并发或生命周期前提；排查时应先确认状态是否仍由正确对象持有，再核对推进条件和清理路径。

## Transaction 链路

```text
Pool::begin()
  -> acquire PoolConnection
  -> Transaction<'static, DB>
  -> begin / savepoint
  -> queries execute on &mut Transaction
  -> commit OR rollback on drop
```

坐标：`Transaction` 在 `sqlx-core/src/transaction.rs:86`；pool 入口 `sqlx-core/src/pool/mod.rs:371`；`Acquire` trait 在 `acquire.rs:70`；事务 manager 由 `Database::TransactionManager` 关联；migration 公共模块位于 `sqlx-core/src/migrate/mod.rs`，宏入口在 `sqlx-macros/src/lib.rs:67-72`，文件展开在 `sqlx-macros-core/src/migrate.rs:102`。

## 为什么 transaction 持有 executor 能力

事务必须保证同一连接上执行 begin、query、commit；如果每条 query 都重新从 pool acquire，事务边界会失效。`Executor` 对 transaction 的实现把连接的生命周期约束编码到借用参数中，避免调用者误把同一事务分散到多个连接。

## 取消与回滚

异步 future 可能在任意 await 点被取消。SQLx 不能假设业务代码一定抵达 commit，因此事务对象需要在未提交时走 rollback 或关闭路径。数据库网络异常也会使 transaction 进入不可继续状态，应用应将错误传播而不是复用不确定连接。

## Migration

```text
migration files
  -> migrate! proc macro / sqlx-cli discovery
  -> ordered Migration list + checksum
  -> migration table read
  -> pending migrations in transaction
  -> execute up/down policy
```

migration 记录版本、描述、checksum 和执行时间；checksum 能发现已执行文件被修改。`sqlx-macros-core/src/migrate.rs:102` 负责把路径内容嵌入生成代码，运行时 `migrate` 模块负责读取并应用。

## 为什么 migration 与 query macro 分离

**替代方案**：每次 `query!` 编译时自动创建/更新数据库 schema。

**为什么不行**：编译不应改变外部系统状态，且 schema 变更需要审计、顺序、回滚和部署策略。

**证据**：query macro 只读取 describe；migration 有独立 feature、文件发现和版本记录链路。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| transaction 中途 return | 数据未提交 | commit 是显式操作 | 用辅助函数统一 commit/rollback |
| 迁移文件已执行后改内容 | checksum 错误 | 迁移历史不可变 | 新增 migration，不修改已执行文件 |
| DDL 不支持事务 | 部分变更残留 | 数据库方言限制 | 查 driver 文档，拆分幂等步骤 |
| 长迁移占满 pool | 业务请求等待 | migration 持有连接/锁 | 独立部署窗口或专用连接池 |

> **面试锚点**
> - SQLx 如何保证 transaction 使用同一连接？
> - 异步取消时为什么必须考虑 rollback？
> - migration checksum 解决什么问题？

## Related

- [Executor、Query 与连接池](/notes/source/rust/sqlx/executor-pool/)
- [SQLx 整体架构](/notes/source/rust/sqlx/architecture/)
- [Seata 事务会话](/notes/source/java/rpc/seata/)
