---
title: 定时器与时间轮
description: Tokio Sleep、TimerEntry、分层时间轮、到期处理与 driver park deadline 的实现。
category: Backend
tags: [Source Reading, Tokio, Rust, Timer]
order: 60
updatedDate: 2026-08-17
difficulty: advanced
status: stable
lastReviewed: 2026-08-17
draft: false
sidebar:
  order: 60
---

定时器的难点不只是“到时间 wake”，而是大量 deadline 的插入、重置、取消，以及如何让 runtime 既不忙轮询，也不会睡过最近到期时间。Tokio 用分层时间轮管理条目，并让 time driver 包裹底层 park。

<!-- more -->

## Sleep 调用链

```text
sleep(duration)
  -> sleep_until(deadline)             sleep.rs:62 / 123
  -> Sleep { inner: TimerEntry }        sleep.rs:225
  -> Future::poll                       sleep.rs:452
       -> TimerEntry::poll_elapsed
       -> 注册 Waker / 提交 deadline
       -> Pending

time driver 到期
  -> Wheel::poll
  -> process_expiration
  -> TimerEntry::fire
  -> wake task
```

`Sleep::reset` 位于 `tokio/src/time/sleep.rs:344-366`，允许复用同一 Future 改变 deadline；这要求旧位置从时间轮逻辑上失效，不能让旧到期事件错误完成新 deadline。

## 分层时间轮

`Wheel` 定义于 `tokio/src/runtime/time/wheel/mod.rs:22-39`，`poll_at`、`poll` 和 `process_expiration` 分别位于 `wheel/mod.rs:137-235`。

```text
near deadline  -> 低层槽：粒度细，旋转快
far deadline   -> 高层槽：覆盖范围大，粒度粗

时间推进
  -> 找到下一到期层和槽
  -> 取出该槽条目
  -> 已到期：fire
  -> 尚未到期：按剩余时间重新分层
```

相较最小堆，时间轮让批量插入和删除更接近 O(1)，代价是时间离散化、层级计算和边界处理更复杂。

## time driver 如何控制 park

time `Driver` 定义于 `tokio/src/runtime/time/mod.rs:90-118`。`park_internal` 位于 `time/mod.rs:213-275`：

```text
wheel.next_expiration_time()
  -> 计算最近 deadline 与 now 的差
  -> min(调用方 park limit, timer duration)
  -> 底层 IO driver.park_timeout(duration)
  -> 唤醒后 process(now)
```

没有 timer 时可以无限 park；有 timer 时最多睡到最近 deadline。这样 IO 事件、新任务和定时器共同决定 worker 的唤醒时刻，而不是各占一个轮询线程。

## 到期处理

`Handle::process` 位于 `time/mod.rs:290-345`。它按当前 tick 推进 wheel，把到期条目的 Waker 收集进 `WakeList`，释放时间轮锁后再唤醒，避免任务回入时与 driver 锁形成死锁。

时间倒退时会钳制到 wheel 已经过的时间；测试 feature 还支持暂停和自动推进虚拟时钟，使定时测试不依赖真实等待。

## 关键取舍

| 方案 | 优点 | 代价 |
| --- | --- | --- |
| 每定时器一个线程 | 实现直观 | 线程和唤醒成本不可接受 |
| 最小堆 | 最近 deadline 精确 | 大量取消/重置维护堆位置 |
| 分层时间轮 | 批量计时器吞吐高 | 粒度、跨度和层级逻辑复杂 |

## 边界与踩坑

| 场景 | 风险 | 处理 |
| --- | --- | --- |
| 未启用 time driver 就创建 Sleep | 运行时 panic | Builder 启用 time 或 `enable_all` |
| 把 sleep 当精确定时 | OS 调度和 worker 忙碌会延迟 | 把 deadline 视为最早唤醒时间 |
| interval 任务处理过慢 | tick 可能积压或跳过 | 明确 missed tick 策略 |
| Future 长时间占用 worker | timer 已到期但无法被 poll | 保持协作调度或移出 CPU 工作 |

## 可迁移知识

计时器应与执行器的 park deadline 合并：事件循环只需要一次阻塞等待，由最近定时任务给出上限。到期只负责唤醒，业务回调仍回到普通调度器执行。

> **面试锚点**
> - Tokio 为什么使用分层时间轮而不是每次扫描所有 timer？
> - time driver 与 IO driver 如何共享线程等待？
> - timer 到期为什么不等于 Future 立即继续执行？

## Related

- [IO Driver 与 Readiness](/notes/source/rust/tokio/io-driver/)
- [调度器与工作窃取](/notes/source/rust/tokio/scheduler/)
- [Netty 时间轮与空闲检测](/notes/source/java/base/netty/timer-idle/)

