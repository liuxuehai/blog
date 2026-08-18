---
title: Task、RawTask 与 Waker
description: Tokio 如何把 Future 封装为 Task，通过状态机、虚表和 Waker 完成 poll、唤醒、取消与 Join。
category: Backend
tags: [Source Reading, Tokio, Rust, Future, Waker]
order: 30
updatedDate: 2026-08-17
difficulty: advanced
status: stable
lastReviewed: 2026-08-17
draft: false
sidebar:
  order: 30
---

Future 只是一个可被 poll 的状态机。Tokio 必须额外保存任务状态、调度器引用、Join 结果和引用计数，并把类型擦除后的任务交给统一队列，这就是 `Task` / `RawTask` 层存在的原因。

<!-- more -->

## 对象关系

```text
spawn(Future)
  -> task::new_task
       -> Cell { header, scheduler, core, trailer }
       -> Task<S>       调度器持有
       -> Notified<S>   已取得调度许可
       -> JoinHandle<T> 调用方持有

RawTask = NonNull<Header>
  +-> Vtable { poll, schedule, dealloc, try_read_output, ... }
```

公开 `tokio::spawn` 位于 `tokio/src/task/spawn.rs:174-185`。类型擦除入口 `RawTask` 位于 `tokio/src/runtime/task/raw.rs:20-24`，其虚表让不同 `Future<Output = T>` 能进入同一种调度队列；实际 poll 分派位于 `raw.rs:271-281`。

## poll 与 wake

```text
worker poll task
  -> Harness::poll
  -> Future::poll(Context { waker })
       +-> Ready(output)  -> 保存结果，通知 JoinHandle，完成
       +-> Pending        -> 清除 running；若期间被通知则重新 schedule

resource event
  -> RawWaker::wake / wake_by_ref
  -> Harness::wake_by_val / wake_by_ref
  -> state.transition_to_notified
  -> scheduler.schedule(Notified)
```

`wake_by_val` 与 `wake_by_ref` 在 `tokio/src/runtime/task/waker.rs:93-114`，分别进入 `harness.rs:68-108`。状态转换先判断任务是否已经 notified/running，避免每次 wake 都重复入队。

## 丢失唤醒如何避免

任务 poll 与外部 wake 可以并发。Tokio 不依赖“先 poll 后 wake”的时间顺序，而是把 `RUNNING`、`NOTIFIED`、`COMPLETE`、`CANCELLED` 等状态压入原子状态机：

```text
poll 返回 Pending 前发现 NOTIFIED
  -> 不能休眠
  -> 重新交还调度器

wake 发现任务已 NOTIFIED
  -> 不重复排队
  -> 保留已有调度许可
```

因此，Waker 的正确性核心不是回调本身，而是 wake 与 poll 退出之间的原子握手。

## JoinHandle 与任务所有权

`JoinHandle` 定义于 `tokio/src/runtime/task/join.rs:163-177`。丢弃 JoinHandle 只放弃观察结果，不会自动取消任务；`abort` 在 `join.rs:227-229`，通过 `RawTask::remote_abort` 设置取消并安排任务再次执行清理。

## 关键取舍

**替代方案**：让调度队列保存泛型 Future 或为每类 Future 建独立队列。

**问题**：运行时无法用统一容器管理异构任务，调度器泛型会向整个实现扩散。

**设计**：固定布局的 Header + 类型专属 Vtable 完成类型擦除，同时保留静态生成的 poll/drop 函数。

## 边界与踩坑

| 场景 | 风险 | 处理 |
| --- | --- | --- |
| 自定义 Future 返回 Pending 却未存 Waker | 任务永久沉睡 | Pending 前注册或确认已有唤醒来源 |
| 重复 wake 被理解为计数信号 | 多次 wake 可能合并 | 状态数据应单独保存，poll 时读取 |
| drop JoinHandle 期待取消 | 任务会 detach 继续运行 | 显式 abort 或使用结构化任务容器 |
| poll 内执行很久 | Waker 再快也无法抢占 | 保持单次 poll 有界 |

## 可迁移知识

无锁任务系统常把“是否需要调度”建模为状态位，而不是消息次数。通知可以合并，真实业务状态必须放在可重复检查的数据结构中。

> **面试锚点**
> - Waker 为什么只保证重新 poll，不保证完成？
> - RawTask 如何在不保存泛型参数的情况下 poll Future？
> - wake 与 poll 并发时如何避免丢失唤醒和重复入队？

## Related

- [调度器与工作窃取](/notes/source/rust/tokio/scheduler/)
- [IO Driver 与 Readiness](/notes/source/rust/tokio/io-driver/)
- [阻塞、取消与关闭](/notes/source/rust/tokio/blocking-cancellation/)

