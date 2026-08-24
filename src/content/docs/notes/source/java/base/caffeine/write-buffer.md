---
title: 写后队列与维护
description: MPSC 缓冲、drain 状态机和批量维护如何降低并发竞争。
category: Backend
tags: [Source Reading, Caffeine, Concurrency, Buffer]
order: 53
updatedDate: 2026-08-24
difficulty: advanced
status: stable
lastReviewed: 2026-08-24
draft: false
sidebar:
  order: 53
---

Caffeine 先记录访问和写入事件，再由维护者按顺序 drain，把高频小更新转换成批量维护。

<!-- more -->

## 先给答案：Caffeine 先记录访问和写入事件，再由维护者按顺序 drain，把高频小更新转换成批量维护

Caffeine 先记录访问和写入事件，再由维护者按顺序 drain，把高频小更新转换成批量维护。 理解写后队列与维护时，要先确认入口与状态归属，再跟踪控制流或数据流的推进顺序，最后落到对外可观察的结果。

主要失效边界集中在“长时间无操作、listener 阻塞、高频写入”这些场景。它们破坏的是容量、顺序、并发或生命周期前提；排查时应先确认状态是否仍由正确对象持有，再核对推进条件和清理路径。

主要失效边界集中在“长时间无操作、listener 阻塞、高频写入”这些场景。它们破坏的是容量、顺序、并发或生命周期前提；排查时应先确认状态是否仍由正确对象持有，再核对推进条件和清理路径。

```text
read/write threads -> read/write buffer -> drain state machine
                                             -> deque/sketch/eviction
```

`afterWrite` 在 `BoundedLocalCache.java:1588`，`scheduleDrainBuffers` 在 `1681`，`maintenance` 在 `1767`，`drainReadBuffer` 在 `1829`，`drainWriteBuffer` 在 `1903`。

### 为什么不用全局锁

**替代方案**：每次访问锁住缓存并更新 LRU。
**为什么不行**：命中是最高频操作，锁会把并发读串行化。
**证据**：`getIfPresent`（`2257`）与 drain 分离，维护阶段批量归并。

```text
IDLE --CAS--> REQUIRED --maintenance--> PROCESSING
  ^                                      |
  +------------- no new events ----------+
```

## 边界与踩坑

| 场景 | 原因 | 规避 |
| --- | --- | --- |
| 长时间无操作 | 事件未触发 drain | scheduler 或 `cleanUp` |
| listener 阻塞 | 回调在维护链路 | 只做轻量投递 |
| 高频写入 | buffer 压力大 | 减少无意义更新 |

## 可迁移知识

“生产者只记录，维护者顺序归并”适合指标聚合、访问日志、对象池和会话管理。

> **面试锚点**
> - 读操作为什么会产生写事件？
> - 谁来执行 drain？
> - 延迟维护会不会破坏一致性？

## Related

- [并发读写路径](/notes/source/java/base/caffeine/concurrency/)
- [过期与时间轮](/notes/source/java/base/caffeine/expiration/)
