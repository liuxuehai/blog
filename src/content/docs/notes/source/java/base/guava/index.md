---
title: Guava
description: Guava 源码解析总览：不可变集合、本地缓存、EventBus 与 RateLimiter。
category: Backend
tags: [Source Reading, Guava, Java, Collections]
order: 6
updatedDate: 2026-08-22
difficulty: advanced
status: stable
lastReviewed: 2026-08-22
draft: false
sidebar:
  order: 6
---

Guava 是 Google 维护的 Java 基础库集合，覆盖不可变数据结构、并发缓存、事件分派和限流算法。

<!-- more -->

## 本册问题地图

Guava 不是一组孤立工具，而是一套“用更强语义减少调用方错误”的基础设施：

1. **不可变集合为什么值得单独设计？** 它把构造完成后的状态冻结，使共享、缓存和并发读取不再需要防御性同步；代价是更新必须创建新对象。
2. **Guava Cache 与 Caffeine 的差别看什么？** 不要只比较 API，要比较维护模型、驱逐策略、并发读写路径和现代版本的性能取舍。
3. **EventBus 隐藏了什么？** 发布者只关心事件类型，订阅者由反射或注册表匹配；解耦带来的代价是调用链不显式、异常和线程模型容易被忽略。
4. **RateLimiter 限制的是什么？** 它平滑的是许可发放时间，不等于并发数限制；等待许可的线程仍可能长期占用线程资源。
5. **工具类的共同边界是什么？** 便利 API 只能减少样板，不能替调用方决定生命周期、异常传播和业务幂等。

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
