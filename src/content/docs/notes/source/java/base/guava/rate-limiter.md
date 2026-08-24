---
title: RateLimiter
description: SmoothBursty、SmoothWarmingUp 与 stored permits 时间模型。
category: Backend
tags: [Source Reading, Guava, RateLimiter, Concurrency]
order: 65
updatedDate: 2026-08-24
difficulty: advanced
status: stable
lastReviewed: 2026-08-24
draft: false
sidebar:
  order: 65
---

Guava `RateLimiter` 不是固定窗口计数器，而是把许可看成可随时间生成、随请求消耗的债务。它允许短时突发，同时让后续请求等待以偿还突发成本。

<!-- more -->

## 先给答案：Guava RateLimiter 不是固定窗口计数器，而是把许可看成可随时间生成、随请求消耗的债务

Guava RateLimiter 不是固定窗口计数器，而是把许可看成可随时间生成、随请求消耗的债务。它允许短时突发，同时让后续请求等待以偿还突发成本。 正文沿“实现拆解 -> 两种平滑策略”展开：先确认入口和状态归属，再跟踪控制流或数据流的推进，最后落到对外可观察的结果。

主要失效边界集中在“把 acquire 当并发上限、调高 rate 后立即无等待、多实例各自限流”这些场景。它们破坏的是容量、顺序、并发或生命周期前提；排查时应先确认状态是否仍由正确对象持有，再核对推进条件和清理路径。

## 实现拆解

`RateLimiter#create` 默认构造 `SmoothBursty`，见 `RateLimiter.java:119-139`；带预热时间的工厂在 `:167-210` 创建 `SmoothWarmingUp`。速率设置入口是 `setRate`（`:258`）。

`acquire` 在 `RateLimiter.java:291`，`reserve` 在 `:317`，带超时的 `tryAcquire` 在 `:411`。共同流程由 `reserveAndGetWaitLength`（`:436`）计算最早可用时间。

`SmoothRateLimiter` 从 `SmoothRateLimiter.java:27` 开始。核心状态是 `storedPermits`（`:315`）和下一张票的时间；`reserveEarliestAvailable`（`:357`）先 `resync`（`:386`），再拆分 stored permits 与 fresh permits。`SmoothBursty` 在 `:279`，`SmoothWarmingUp` 在 `:206`。

源码注释把等待时间解释为许可成本函数的积分，因此一次 `acquire(3)` 与三次 `acquire(1)` 在总节流效果上保持一致，而不是简单把大请求当作一次计数。

### 为什么不用固定窗口计数

**替代方案**：每秒计数，窗口结束时清零。
**为什么不行**：窗口边界会产生双倍突发，无法表达“欠下的流量成本”。
**证据**：`SmoothRateLimiter` 用 `storedPermits` 和 `nextFreeTicketMicros` 连续推进可用时间；`reserveEarliestAvailable` 先偿还旧债，再为新请求安排时间。

## 两种平滑策略

| 实现 | 行为 | 适合 |
| --- | --- | --- |
| `SmoothBursty` | 存量许可的等待成本为零，最多积累一段 burst | API 短突发、后台任务 |
| `SmoothWarmingUp` | 存量越多，许可等待成本越高，逐步升温 | 冷启动昂贵、避免瞬时冲击 |

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| 把 `acquire` 当并发上限 | 同时仍有很多执行中请求 | 限制的是进入速率 | 使用 `Semaphore` |
| 调高 rate 后立即无等待 | 旧请求的时间债务仍可能存在 | `setRate` 不会抹掉所有历史安排 | 将 rate 调整视为渐进变化 |
| 多实例各自限流 | 集群总流量超过预期 | 状态只在进程内 | 使用网关或集中式配额 |

## 可迁移知识

令牌桶的关键是把额度与时间绑定，而不是只记录数量。把未来可用时间当作单调状态，可以自然支持批量请求、突发和超时判断。

> **面试锚点**
> - `storedPermits` 如何随时间恢复？
> - SmoothBursty 和 SmoothWarmingUp 的曲线差异是什么？
> - RateLimiter 为什么不能替代信号量？

## Related

- [整体架构](/notes/source/java/base/guava/architecture/)
- [Sentinel 流控](/notes/source/java/rpc/sentinel/flow-control/)
