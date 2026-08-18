---
title: Tokio 面试专题
description: Tokio Future/Waker、调度器、IO readiness、时间轮、同步背压、阻塞与取消的源码级高频题。
category: Backend
tags: [Source Reading, Tokio, Rust, Interview]
order: 90
updatedDate: 2026-08-17
difficulty: advanced
status: stable
lastReviewed: 2026-08-17
draft: false
sidebar:
  order: 90
---

Tokio 面试题常从“async 怎么用”迅速深入到 poll/wake 竞态、调度公平性、readiness 消费和关闭边界。回答时要把语言协议、运行时实现和业务约束分开。

<!-- more -->

## 1. Future 为什么是惰性的

`Future::poll` 才推进状态机；只创建 Future 不会自动执行。Tokio spawn 时把 Future 封装为 Task 并置入 scheduler，worker 取得任务后才发生第一次 poll。

```text
create Future != execute
await/spawn -> runtime poll -> state advances
```

源码锚点：`tokio/src/task/spawn.rs:174`、`runtime/task/raw.rs:271`。

## 2. Pending 前为什么必须保存 Waker

返回 Pending 表示当前不能完成。若没有任何对象保存 Waker 或保证未来 wake，scheduler 没有理由再次 poll，Future 会永久停住。注册后还要重查状态，处理“检查未就绪”和“保存 Waker”之间发生的事件。

源码锚点：`runtime/io/scheduled_io.rs:303-356`。

## 3. wake 是否等于任务立即执行

不是。wake 通常只把 Task 从未通知状态变成 notified，并提交到队列；何时执行取决于 worker、队列位置、预算和其他任务。多次 wake 还可能合并为一次调度许可。

源码锚点：`runtime/task/waker.rs:93-114`、`runtime/task/harness.rs:68-123`。

## 4. Tokio 如何减少全局队列争用

每个 worker 有 local run queue 和 LIFO slot，远程任务进入 inject queue。本地耗尽后才进入 searching 并随机窃取其他 worker；周期性检查全局队列维持公平性。

源码锚点：`runtime/scheduler/multi_thread/worker.rs:575-627`、`worker.rs:1088-1203`。

## 5. cooperative budget 解决什么问题

一个不断得到 Ready 的任务可能持续占用 worker。Tokio 的部分异步资源操作会消耗预算，耗尽后先让出调度权。但它不能抢占任意用户 CPU 循环，所以长计算仍要主动切分或移出 worker。

源码锚点：`tokio/src/task/coop/mod.rs:371-394`。

## 6. readiness 为什么不是 IO 完成

mio 事件只表示操作可能不阻塞。到 Future 真正执行时，状态可能已被其他任务消费，因此仍要尝试系统调用并处理 `WouldBlock`。Tokio 用 readiness tick 防止旧观察清除新事件。

源码锚点：`runtime/io/driver.rs:179-238`、`runtime/io/scheduled_io.rs:207-229`。

## 7. 时间轮如何与 IO 等待组合

time driver 先查询最近 timer deadline，再把它作为底层 IO park 的最长等待时间。线程可能被 IO、新任务或 timeout 任一来源唤醒，醒来后统一处理到期 timer。

源码锚点：`runtime/time/mod.rs:213-290`、`runtime/time/wheel/mod.rs:137-235`。

## 8. bounded mpsc 如何产生背压

buffer 容量被建模为 semaphore permits。发送前必须 reserve permit；队列满时 Sender Future 进入公平等待队列；Receiver 消费消息后归还 permit 并唤醒发送方。

源码锚点：`sync/mpsc/bounded.rs:159-177`、`bounded.rs:1287-1305`、`sync/mpsc/chan.rs:304`。

## 9. Notify、watch、broadcast、mpsc 怎么选

| 需求 | 选择 |
| --- | --- |
| 只提示“条件可能变化” | `Notify` |
| 多接收者只关心最新状态 | `watch` |
| 多接收者都要看每条消息，可接受 lag | `broadcast` |
| 一条消息交给一个消费者并需要背压 | bounded `mpsc` |

回答重点不是 API 数量，而是信息是否累计、是否保留历史、由几个消费者接收。

## 10. abort 后任务发生了什么

abort 设置取消状态并安排任务被再次处理；运行时在安全边界 drop Future，JoinHandle 最终返回 cancelled。若任务正在执行不会被硬中断；已经开始的 `spawn_blocking` 闭包通常完全不能 abort。

源码锚点：`runtime/task/join.rs:185-229`、`runtime/task/harness.rs:111-123`。

## 11. 线上 worker 线程 CPU 100% 怎么查

```text
先分型
  -> 单个 Future poll 很慢？
  -> readiness 未清导致空转？
  -> 任务互相 wake 形成调度风暴？
  -> channel 无背压导致队列堆积？
  -> 同步阻塞误跑在 async worker？
```

结合 tracing、runtime metrics、任务 dump/栈和系统 profiler，重点看单次 poll 时长、队列深度、park 比例、wake 数与有效 IO 数是否匹配。

## 12. 一句话总结 Tokio

Tokio 用类型擦除 Task 承载 Future，用原子状态机协调 poll 与 wake，用本地队列和工作窃取调度任务，再把 mio readiness、时间轮和异步等待队列统一转换为 Waker 通知。

## Related

- [Tokio 整体架构](/notes/source/rust/tokio/architecture/)
- [调度器与工作窃取](/notes/source/rust/tokio/scheduler/)
- [阻塞、取消与关闭](/notes/source/rust/tokio/blocking-cancellation/)

