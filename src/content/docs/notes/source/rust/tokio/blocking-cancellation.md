---
title: 阻塞、取消与关闭
description: Tokio spawn_blocking 线程池、异步任务 abort、JoinSet 结构化收口与 Runtime shutdown 语义。
category: Backend
tags: [Source Reading, Tokio, Rust, Blocking, Cancellation]
order: 80
updatedDate: 2026-08-24
difficulty: advanced
status: stable
lastReviewed: 2026-08-24
draft: false
sidebar:
  order: 80
---

Tokio 必须隔离两类完全不同的工作：能频繁返回 Pending 的 async task，以及会长时间占住线程的 blocking closure。取消语义也因此分裂：Future 可以在 poll 边界被 drop，已经开始执行的普通闭包却无法被运行时安全抢停。

<!-- more -->

## 先给答案：Tokio 必须隔离两类完全不同的工作：能频繁返回 Pending 的 async task，以及会长时间…

Tokio 必须隔离两类完全不同的工作：能频繁返回 Pending 的 async task，以及会长时间占住线程的 blocking closure。取消语义也因此分裂：Future 可以在 poll 边界被 drop，已经开始执行的普通闭包却无法被运行时安全抢停。 正文沿“spawnblocking 路径 -> async abort 是协作式清理 -> blocking task 为什么通常不能 abort”展开：先确认入口和状态归属，再跟踪控制流或数据流的推进，最后落到对外可观察的结果。

主要失效边界集中在“用 spawnblocking 跑无限循环、abort 后立即假设资源已释放、大量 CPU 任务直接 spawnblocking”这些场景。它们破坏的是容量、顺序、并发或生命周期前提；排查时应先确认状态是否仍由正确对象持有，再核对推进条件和清理路径。

## spawn_blocking 路径

```text
tokio::task::spawn_blocking           task/blocking.rs:220
  -> runtime Handle::spawn_blocking
  -> blocking::Spawner                runtime/blocking/pool.rs:26
  -> spawn_task                       pool.rs:447
       +-> 有空闲 blocking worker：通知
       +-> 未达线程上限：创建 worker
       +-> 否则：任务留在共享队列
  -> worker run                       pool.rs:744
```

`BlockingPool` 位于 `tokio/src/runtime/blocking/pool.rs:20-24`，内部 `spawn_blocking` 在 `pool.rs:237-276`，worker 主循环位于 `pool.rs:553-638` 与 `pool.rs:744-769`。

blocking pool 会按需扩张并在空闲超时后回收线程，但它不是 CPU 任务的无限并行许可证。默认上限较高是为了容纳文件 IO、DNS 或同步库调用；大量 CPU 闭包仍应由 semaphore 限制，或交给 Rayon 等专用计算池。

## async abort 是协作式清理

`JoinHandle::abort` 位于 `tokio/src/runtime/task/join.rs:227-229`，进入 `Harness::remote_abort`（`runtime/task/harness.rs:111-123`）：状态机设置取消标记，并在需要时把任务置为 notified。

```text
abort()
  -> mark CANCELLED + schedule
  -> worker 取得任务
  -> Harness 检查取消状态
  -> drop Future
  -> JoinHandle 得到 cancelled JoinError
```

如果任务正在 poll，运行时不会从另一个线程强制打断 Rust 代码；它会在 poll 返回后完成取消。因此一个永不让出的 Future 同样会拖延 abort。

## blocking task 为什么通常不能 abort

`spawn_blocking` 闭包一旦在线程上开始运行，运行时没有安全通用手段终止它。`JoinHandle` 文档在 `join.rs:185-193` 明确说明：abort 只可能阻止尚未开始的 blocking task，不能停止已经运行的闭包。

需要可取消阻塞工作时，闭包本身必须检查取消令牌、原子标志或 channel，并在合适边界主动返回。

## JoinSet 的作用

`JoinSet::abort_all` 位于 `tokio/src/task/join_set.rs:463-465`，drop 实现在 `join_set.rs:590-595`，会 abort 仍被集合拥有的任务。

```text
spawn many -> JoinSet 持有全部 JoinHandle
  -> join_next 收集完成结果
  -> abort_all 发起取消
  -> 继续 join_next 直到 empty，确认清理完成
```

`abort_all` 只是发起动作；若要确认 Future 已 drop、资源已释放，应继续 drain JoinSet。

## Runtime shutdown

Runtime drop 会等待 blocking pool 停止。`shutdown_timeout` 位于 `tokio/src/runtime/runtime.rs:457-468`，只限制调用方等待时间，并不终止仍在运行的 blocking thread；`shutdown_background` 在 `runtime.rs:494-496`，等价于零超时并把清理留在后台。

```text
shutdown
  -> 停止 async scheduler / 取消任务
  -> 关闭 drivers
  -> 等待 blocking workers
       +-> 全部退出：完成
       +-> timeout：方法返回，但闭包仍可能继续运行
```

## 边界与踩坑

| 场景 | 风险 | 处理 |
| --- | --- | --- |
| 用 spawn_blocking 跑无限循环 | runtime 无法正常收口 | 设计取消标志和退出边界 |
| abort 后立即假设资源已释放 | 任务可能尚未再次调度 | await JoinHandle 或 drain JoinSet |
| 大量 CPU 任务直接 spawn_blocking | 创建过多线程、争抢 CPU | 限流或使用专用计算池 |
| async task 持同步锁后阻塞 | 取消也无法及时释放锁 | 不在 worker 上执行长阻塞段 |

## 可迁移知识

取消不是单一 API，而是“发出请求、执行单元到达安全点、释放资源、观察完成”的协议。线程、Future 和外部进程的安全点不同，必须分别设计。

> **面试锚点**
> - Tokio 的 abort 为什么不是抢占式线程中断？
> - `spawn_blocking` 已开始后为什么不能取消？
> - `shutdown_timeout` 返回后，blocking task 是否已经停止？

## Related

- [Runtime 构建与进入](/notes/source/rust/tokio/runtime/)
- [Task、RawTask 与 Waker](/notes/source/rust/tokio/task-waker/)
- [同步原语与背压](/notes/source/rust/tokio/sync-primitives/)

