---
title: Tokio 整体架构
description: Tokio 从 Future 到 Runtime、Task、Scheduler、IO/Time driver 和同步原语的模块边界。
category: Backend
tags: [Source Reading, Tokio, Rust, Architecture]
order: 10
updatedDate: 2026-08-17
difficulty: advanced
status: stable
lastReviewed: 2026-08-17
draft: false
sidebar:
  order: 10
---

Rust 标准库定义了 `Future`、`Poll`、`Context` 和 `Waker`，却不提供执行器、事件驱动和异步 IO。Tokio 的核心价值是把这些协议组合成生产级运行时，而不是重新定义 async 语法。

<!-- more -->

## 模块地图

```text
application Future
      |
      v
tokio::spawn -> runtime::task
      |             |
      |          state + harness + waker
      v             |
scheduler <---------+
  |       |
  |       +-> current_thread / multi_thread
  |
  +-> runtime::driver
          +-> io::Driver -> mio::Poll
          +-> time::Driver -> Wheel
          +-> signal/process drivers
```

`Runtime` 位于 `tokio/src/runtime/runtime.rs:97-120`，内部保存 `Scheduler`、driver handle 和 blocking pool；调度器枚举位于 `runtime.rs:122-133`。组合驱动定义在 `tokio/src/runtime/driver.rs:16-45`，按 feature 把 IO、时间、信号和进程驱动逐层包起来。

## 核心边界

| 模块 | 负责 | 不负责 |
| --- | --- | --- |
| `runtime` | 生命周期、上下文、驱动与调度器组装 | 业务 Future 逻辑 |
| `task` | Future 存储、状态转换、Waker、Join 结果 | 决定在哪个 worker 执行 |
| `scheduler` | 入队、取任务、poll、公平性和 park | 判断 socket 是否就绪 |
| `runtime::io` | 注册资源、接收 readiness、唤醒 waiter | 执行 read/write 系统调用循环 |
| `runtime::time` | deadline、时间轮、到期唤醒 | 保证 Future 主动让出执行权 |
| `sync` | 异步等待队列与通知 | 替代所有短临界区的标准锁 |

## 一次异步等待

```text
poll Future
  -> Poll::Pending，并把 Waker 注册到资源
  -> worker 继续执行其他 task 或 park
  -> mio event / timer expiration
  -> ScheduledIo / TimerEntry 调用 Waker
  -> task 进入 scheduler 队列
  -> 再次 poll，尝试取得真实结果
```

关键点是 Waker 只表达“值得再 poll 一次”，不携带 IO 数据，也不保证 Future 下一次一定完成。

## 关键取舍

**替代方案**：每个异步操作占用一个线程并阻塞等待。

**问题**：线程栈、调度切换和大量空闲等待会限制连接规模；任务取消与资源组合也难统一。

**设计**：Future 保存暂停状态，驱动只记录事件并唤醒任务，少量 worker 在就绪任务之间协作调度。

## 边界与踩坑

| 场景 | 风险 | 处理 |
| --- | --- | --- |
| 把 async 等同于并行 | 单 worker 上仍是交替 poll | CPU 并行要明确使用多线程或专用池 |
| Future 长时间不返回 | worker 无法调度其他任务 | 拆分计算、主动 yield 或移出 async worker |
| 忽略 feature | Runtime 可能没有 IO/time driver | Builder 显式启用或使用 `enable_all` |
| 把 wake 当完成通知 | 可能产生空 poll 或竞争 | poll 时重新检查真实状态 |

## 可迁移知识

事件驱动系统的通用分层是：状态对象保存等待条件，驱动把外部事件转换成通知，调度器只管理可运行单元。三者分开后，IO、定时器和用户态同步原语都能复用同一套任务唤醒协议。

> **面试锚点**
> - Rust 标准库有 Future，为什么还需要 Tokio？
> - Waker、调度器和 IO driver 分别解决什么问题？
> - `Poll::Pending` 之前为什么必须安排后续唤醒？

## Related

- [Runtime 构建与进入](/notes/source/rust/tokio/runtime/)
- [Task、RawTask 与 Waker](/notes/source/rust/tokio/task-waker/)
- [Netty 整体架构](/notes/source/java/base/netty/architecture/)

