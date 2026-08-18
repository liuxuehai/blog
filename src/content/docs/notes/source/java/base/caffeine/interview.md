---
title: 面试专题
description: Caffeine 高频面试题、高难追问、场景题与源码级加分回答。
category: Backend
tags: [Source Reading, Caffeine, Interview]
order: 59
updatedDate: 2026-08-16
difficulty: advanced
status: stable
lastReviewed: 2026-08-16
draft: false
sidebar:
  order: 59
---

Caffeine 面试的关键不是背“高性能缓存”，而是解释它如何同时处理命中率、并发竞争、维护成本和加载一致性。

<!-- more -->

## 高频题

### Caffeine 为什么比简单 LRU 更强？

**30 秒版**：W-TinyLFU 做准入，Window/Main 双区处理短期突发和长期热点；访问队列延迟到 buffer drain，避免每次命中写共享链表。

**展开**：`FrequencySketch` 在 `FrequencySketch.java:112`、`143`，`admit` 在 `BoundedLocalCache.java:841`，读事件由 `drainReadBuffer`（`1829`）整理。

### W-TinyLFU 如何估计频率？

Count-Min Sketch 用多个 hash 位置计数，查询取最小值；counter 为 4 bit，达到样本阈值后 `reset`（`FrequencySketch.java:223`）衰减。

### 读操作为什么还有写？

命中需要记录访问顺序、频率和统计，但先进入 buffer，后续批量更新。入口是 `getIfPresent`（`BoundedLocalCache.java:2257`）。

### expireAfterWrite 和 refreshAfterWrite 有什么区别？

前者使值到期失效，后者允许重新加载并通常继续返回旧值。配置位于 `Caffeine.java:694`、`879`，刷新判断位于 `BoundedLocalCache.java:1293`。

### 异步缓存如何防止击穿？

把加载中的 `CompletableFuture` 放进 map，相同 key 复用 future。入口是 `LocalAsyncLoadingCache#get`（`LocalAsyncLoadingCache.java:113`）。

## 高难追问

### 为什么不用每个条目一个定时任务？

`TimerWheel`（`TimerWheel.java:40`）按时间桶批量推进，避免大量 `ScheduledFuture` 对象和取消成本。

### Caffeine 是否提供分布式一致性？

不提供。它是进程内 L1；共享失效需要 Redis、消息通知或版本校验。

## 场景题

后端 QPS 升高时，检查命中率、eviction、TTL 同时到期、future pending、刷新失败、容量和 loader 线程池。过期未释放则确认 scheduler、`cleanUp` 和 listener 是否阻塞。

## 反向问面试官

- Caffeine 是 L1 还是唯一缓存？失效广播怎么做？
- loader 是否阻塞？是否有独立线程池和超时？
- 更关心命中率、尾延迟还是堆占用？

## Related

- [W-TinyLFU 与准入](/notes/source/java/base/caffeine/tiny-lfu/)
- [异步加载与刷新](/notes/source/java/base/caffeine/async-loading/)
