---
title: Caffeine
description: Caffeine 源码解析：W-TinyLFU、写后维护、时间轮、并发缓存与异步加载。
category: Backend
tags: [Source Reading, Caffeine, Cache, Concurrency]
order: 5
updatedDate: 2026-08-22
difficulty: advanced
status: stable
lastReviewed: 2026-08-22
draft: false
sidebar:
  order: 5
---

Caffeine 是 Java 进程内缓存库。它把 W-TinyLFU 驱逐策略、并发读路径与异步写后维护组合起来，提供有界缓存、过期、刷新、统计和加载能力。

<!-- more -->

## 本册问题地图

Caffeine 要沿着“读路径快、写路径可维护、容量有边界”来理解：

1. **为什么命中读取不直接维护全部策略？** 读路径若同步更新频率、队列和时间信息，会把每次访问都变成共享写；Caffeine 把部分维护延后到写后缓冲和维护任务。
2. **W-TinyLFU 解决什么矛盾？** 只按最近访问容易让一次性大流量污染缓存，只按频率又会淘汰掉刚刚变热的键；它用窗口、准入比较和频率估计平衡两者。
3. **过期与容量驱逐谁先发生？** 过期是时间条件，容量驱逐是空间条件；一次读取或维护可能同时发现两者，不能把“没读到”简单归因于缓存未命中。
4. **异步加载如何避免重复建值？** 同一个 key 的加载应共享进行中的 Future，失败后还要决定是否移除失败结果，否则下一次请求会复用错误状态。
5. **缓存为什么一定要有边界？** 本地缓存用内存换延迟，容量、权重、过期和加载并发共同决定它是否会反过来拖垮应用。

## 版本快照

| 项 | 值 |
| --- | --- |
| 仓库 | `ben-manes/caffeine` |
| 本地路径 | `E:\source\java\base\caffeine` |
| 分支 | `master` |
| Commit | `9da6581e`（2026-08-10） |
| 最近 tag | `v3.2.4` |

> 本册源码坐标均基于上述 commit。

## 读码入口

1. `Caffeine#build` — `Caffeine.java:1102`：配置选择实现。
2. `BoundedLocalCache#getIfPresent` — `BoundedLocalCache.java:2257`：命中读路径。
3. `drainReadBuffer` / `drainWriteBuffer` — `BoundedLocalCache.java:1829`、`1903`：写后维护。
4. `FrequencySketch`、`admit`：W-TinyLFU 准入。
5. `TimerWheel`：动态过期。
6. `LocalAsyncLoadingCache#get` — `LocalAsyncLoadingCache.java:113`：异步加载。

## 本册目录

- [整体架构](/notes/source/java/base/caffeine/architecture/)
- [W-TinyLFU 与准入](/notes/source/java/base/caffeine/tiny-lfu/)
- [写后队列与维护](/notes/source/java/base/caffeine/write-buffer/)
- [过期与时间轮](/notes/source/java/base/caffeine/expiration/)
- [并发读写路径](/notes/source/java/base/caffeine/concurrency/)
- [异步加载与刷新](/notes/source/java/base/caffeine/async-loading/)
- [面试专题](/notes/source/java/base/caffeine/interview/)

## Related

- [Java 基础库索引](/notes/source/java/base/)
- [Redis 源码解析](/notes/source/redis/redis/)
