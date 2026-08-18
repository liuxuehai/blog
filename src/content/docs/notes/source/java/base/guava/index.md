---
title: Guava
description: Guava 源码解析总览：不可变集合、本地缓存、EventBus 与 RateLimiter。
category: Backend
tags: [Source Reading, Guava, Java, Collections]
order: 6
updatedDate: 2026-08-16
difficulty: advanced
status: stable
lastReviewed: 2026-08-16
draft: false
sidebar:
  order: 6
---

Guava 是 Google 维护的 Java 基础库集合，覆盖不可变数据结构、并发缓存、事件分派和限流算法。

<!-- more -->

## 版本快照

| 项 | 值 |
| --- | --- |
| 仓库 | `google/guava` |
| 本地路径 | `E:\source\java\base\guava` |
| 分支 | `master` |
| Commit | `94f39958b`（2026-08-11） |
| Maven 版本 | `999.0.0-HEAD-jre-SNAPSHOT` |
| 稳定版本线 | README 示例中的 `33.6.0-jre` |

> 本册源码坐标均基于上述 commit。当前快照是开发分支，稳定版本号不是该 commit 的精确 tag。

## 它解决什么问题

- 不可变集合降低共享状态的同步成本，并针对小集合提供紧凑布局。
- 本地缓存合并并发加载，统一过期、引用和淘汰策略。
- EventBus 隐藏生产者与订阅者的直接引用，提供进程内分派。
- RateLimiter 用时间模型表达平均速率、突发容量和预热行为。

## 读码入口

1. `ImmutableList` / `ImmutableSet` / `ImmutableMap` 的 `of`、`copyOf`、`Builder`。
2. `CacheBuilder#build` → `LocalCache` → `Segment`。
3. `EventBus#register` / `post` → `SubscriberRegistry` → `Dispatcher`。
4. `RateLimiter#acquire` → `reserve` → `SmoothRateLimiter#reserveEarliestAvailable`。

## 本册目录

- [整体架构](/notes/source/java/base/guava/architecture/)
- [不可变集合](/notes/source/java/base/guava/immutable-collections/)
- [Cache 与 Caffeine 对照](/notes/source/java/base/guava/cache-vs-caffeine/)
- [EventBus](/notes/source/java/base/guava/eventbus/)
- [RateLimiter](/notes/source/java/base/guava/rate-limiter/)
- [面试专题](/notes/source/java/base/guava/interview/)

## 横向对照

| 对象 | 对照点 |
| --- | --- |
| JDK `List` / `Map` | Guava 用不可变约束换取共享安全性和专用布局 |
| Caffeine | Guava `LocalCache` 使用分段锁；Caffeine 将读路径和维护队列进一步拆开 |
| Reactor / RxJava | EventBus 是反射驱动的进程内分派，不提供背压和流组合语义 |

## Related

- [Java 基础库索引](/notes/source/java/base/)
- [Caffeine](/notes/source/java/base/caffeine/)
