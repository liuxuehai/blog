---
title: SQLx Executor、Query 与连接池
description: Query 如何通过 Executor 执行，以及 Pool 的信号量、连接回收和并发边界。
category: Backend
tags: [Source Reading, SQLx, Rust, Async, Pool]
order: 72
updatedDate: 2026-08-18
difficulty: advanced
status: stable
lastReviewed: 2026-08-18
draft: false
sidebar:
  order: 72
---

SQLx 把“要执行什么”与“在哪里执行”拆开：`Query` 保存 SQL 和 arguments，`Executor` 提供执行/fetch 能力，`Pool` 通过可复用连接把异步任务接入具体 driver。

<!-- more -->

## 执行链

```text
query::<DB>(sql)
  -> Query<'q, DB, Arguments>
  -> Query::execute / fetch
  -> Executor<'c>::execute / fetch_many
  -> Pool acquire
  -> Connection::execute
  -> driver protocol
```

坐标：`Query` 在 `sqlx-core/src/query.rs:18`；构造函数 `query()` 在 `:653`；`Query::execute()` 在 `:185`；`Executor` trait 在 `executor.rs:53`；`Pool` 在 `pool/mod.rs:260`；`Pool::connect()` 在 `:284`；`Pool::begin()` 在 `:371`；`PoolOptions::connect()` 在 `pool/options.rs:528`。

## Pool 的并发模型

```text
PoolInner
├─ semaphore          限制同时持有的连接数
├─ idle connections   可立即复用
├─ live connection count
├─ waiters            异步等待 permit / connection
└─ options            acquire timeout、idle/max lifetime、hooks
```

连接池不是简单 `Mutex<Vec<Connection>>`：任务先受 semaphore 限制，再从 idle 队列取连接；连接归还时需要检查关闭、生命周期、健康状态，失效连接不能重新进入池。`PoolConnection` 作为 RAII guard，在 drop/close 时归还或关闭底层连接。

## `Executor` 的抽象价值

| 调用对象 | 语义 |
| --- | --- |
| `&Pool<DB>` | 自动 acquire、执行后归还 |
| `&mut Connection` | 当前连接直接执行 |
| `&mut Transaction` | 在事务连接上执行 |
| `PoolConnection<DB>` | 持有连接期间多次执行 |

`Executor` 约束 `DB` 的 `Database` 关联类型，使同一个 `Query` API 可被不同 driver 的连接、pool、transaction 使用。异步生命周期参数 `'c` 则表达执行期间必须保持 executor 有效。

## 为什么 acquire 使用异步等待

**替代方案**：池满时阻塞线程等待可用连接。

**为什么不行**：异步 runtime 的 worker 被阻塞后，持有连接的任务可能无法继续运行并归还连接，形成调度层面的饥饿甚至死锁。

**证据**：池内部使用 async semaphore；`sqlx-core/src/sync.rs:82` 的 `AsyncSemaphoreReleaser::acquire()` 是异步 permit 获取路径，pool options 还提供 acquire timeout。

## 生命周期策略

连接可能因为 max lifetime、idle timeout、数据库主动断开或健康检查失败而淘汰。池的目标不是保证每个连接永远存在，而是把连接创建成本摊平，并将坏连接隔离在归还边界。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| 在事务内再用 pool 执行 | 查询不在当前事务 | pool 会 acquire 另一条连接 | 把 `&mut Transaction` 传给 query |
| pool size 太小 | acquire timeout | 长事务占满连接 | 缩短事务、设置合理 timeout/size |
| 持有 `PoolConnection` 跨大量 await | 其他任务饥饿 | guard 生命周期过长 | 尽量缩小连接持有范围 |
| drop future 取消查询 | 服务端可能已收到部分请求 | 取消不等于数据库回滚 | 对关键写操作使用 transaction 和幂等设计 |

> **面试锚点**
> - `Query`、`Executor`、`Pool` 的职责如何分离？
> - 为什么池满时必须异步等待？
> - pool 与 transaction 执行为何不能混用？

## Related

- [SQLx 整体架构](/notes/source/rust/sqlx/architecture/)
- [Transaction 与 Migration](/notes/source/rust/sqlx/transaction-migration/)
- [Tokio 同步原语](/notes/source/rust/tokio/sync-primitives/)
