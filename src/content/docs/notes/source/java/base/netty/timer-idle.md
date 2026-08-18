---
title: 时间轮与 IdleStateHandler
description: HashedWheelTimer 的槽位与 remainingRounds，以及 IdleStateHandler 的空闲检测。
category: Backend
tags: [Source Reading, Netty, Timer, Timeout]
order: 26
updatedDate: 2026-08-15
difficulty: advanced
status: stable
lastReviewed: 2026-08-15
draft: false
sidebar:
  order: 26
---

Netty 的时间轮适合海量、精度要求不是纳秒级的超时任务；`IdleStateHandler` 则把连接读写活动转换为定时事件。两者结合后，心跳、连接保活和空闲断开都能复用 EventLoop 的调度能力。

<!-- more -->

## 时间轮结构

```text
tick=10
       0  1  2  3  4  5  6  7
                ▲
             current

timeout(deadline=42)
  calculated=42 / tickDuration
  stopIndex = calculated & mask
  remainingRounds = (calculated - tick) / wheel.length
```

`HashedWheelTimer#start` 使用 CAS 把 worker 从 INIT 置为 STARTED，并等待 worker 初始化起始时间，坐标为 `common/src/main/java/io/netty/util/HashedWheelTimer.java:352-376`。新增 timeout 不直接修改时间轮，而是进入 MPSC 队列；worker 每 tick 最多搬运 100000 个任务，计算槽位和轮数，坐标为 `HashedWheelTimer.java:522-544`。

每个槽位是双向链表。到达 tick 时，若 `remainingRounds <= 0` 且 deadline 已到就执行；否则轮数减一，坐标为 `HashedWheelTimer.java:760-802`。

## 为什么需要 remainingRounds

只用 `deadline & mask` 会把“下一圈”和“几十圈之后”的任务放进同一个槽，无法知道当前 tick 是否真的到期。`remainingRounds` 把槽位定位和圈数判断拆开，代价是每个 timeout 多一个 long，并且每圈都要检查一次。

替代方案是最小堆。堆能更精确地按 deadline 排序，但每次插入和取消都有 O(log n) 成本；时间轮把常见插入路径降到近似 O(1)，适合连接超时、重试和海量短任务。

## IdleStateHandler

```text
handlerAdded/channelActive
          │ initialize
          ├─ schedule reader task
          ├─ schedule writer task
          └─ schedule all-idle task
                    │
                    ▼
             fireUserEventTriggered
```

构造函数把非正数时间视为禁用，正数转换为纳秒并设置最小超时，坐标为 `handler/timeout/IdleStateHandler.java:192-214`。Handler 加入已激活 Channel 后会立即初始化，坐标为 `IdleStateHandler.java:240-250`；具体任务通过 `ctx.executor().schedule` 调度，坐标为 `IdleStateHandler.java:350-365`。

`observeOutput` 开启后，Handler 会比较 `ChannelOutboundBuffer.current()`、pending bytes 和 flush progress，坐标为 `IdleStateHandler.java:411-420`，因此“调用过 write 但数据仍在缓冲区没有进展”可以区别于真正的写空闲。

## 边界与踩坑

- 时间轮的 tick 精度不是任务的精确执行时间；EventLoop 忙或系统调度延迟时，任务会晚执行。
- `IdleStateHandler` 只产生事件，不会自动关闭连接；是否发心跳或 close 由业务 Handler 决定。
- 同一个 Handler 被错误地跨 Channel 复用，会把读写时间状态混在一起；除非明确满足共享约束，不要声明 `@Sharable`。
- `HashedWheelTimer#stop` 不能从 worker 线程调用，且会返回未处理 timeout，坐标为 `HashedWheelTimer.java:379-428`。

## 可迁移知识

时间轮适合把大量定时任务压缩到“槽位 + 轮数”两个维度；生产实现还要考虑取消队列、单 tick 搬运上限和关闭时的未处理任务回收。它可用于重试、租约、会话过期和连接保活。

> 面试锚点：时间轮为什么需要 remainingRounds？IdleStateHandler 如何判断写操作是否真的有进展？

## Related

- [Reactor 线程模型](/notes/source/java/base/netty/reactor-threading/)
- [Pipeline 与 Handler 责任链](/notes/source/java/base/netty/pipeline-handler/)
- [整体架构](/notes/source/java/base/netty/architecture/)
