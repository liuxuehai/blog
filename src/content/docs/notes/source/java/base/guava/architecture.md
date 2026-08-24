---
title: 整体架构
description: Guava 集合、缓存、事件分派与限流组件的源码入口和共同设计模式。
category: Backend
tags: [Source Reading, Guava, Architecture]
order: 61
updatedDate: 2026-08-24
difficulty: advanced
status: stable
lastReviewed: 2026-08-24
draft: false
sidebar:
  order: 61
---

Guava 是一组围绕“约束状态、封装并发、隐藏样板代码”的基础设施，阅读时应按数据结构、状态协调和时间模型三条线展开。

<!-- more -->

## 先给答案：Guava 是一组围绕“约束状态、封装并发、隐藏样板代码”的基础设施，阅读时应按数据结构、状态协调和时间模…

Guava 是一组围绕“约束状态、封装并发、隐藏样板代码”的基础设施，阅读时应按数据结构、状态协调和时间模型三条线展开。 正文沿“主流程一：不可变集合 -> 主流程二：缓存加载 -> 主流程三：事件与限流”展开：先确认入口和状态归属，再跟踪控制流或数据流的推进，最后落到对外可观察的结果。

主要失效边界集中在“EventBus 订阅者抛异常、Cache 只配过期、RateLimiter 被当作并发隔离”这些场景。它们破坏的是容量、顺序、并发或生命周期前提；排查时应先确认状态是否仍由正确对象持有，再核对推进条件和清理路径。

## 主流程一：不可变集合

```text
of/copyOf/builder -> 收集元素 -> 去重/建表
                  -> hash flooding 检测
                  -> RegularImmutable* 或 JdkBackedImmutable*
```

`ImmutableList#copyOf` 位于 `ImmutableList.java:238`，`ImmutableSet#copyOf` 位于 `ImmutableSet.java:174`，`ImmutableMap.Builder#build` 最终进入 `RegularImmutableMap.fromEntryArray`，见 `ImmutableMap.java:581`。

## 主流程二：缓存加载

```text
CacheBuilder#build -> LocalLoadingCache -> Segment
                   -> LoadingValueReference -> loader.load
                   -> setValue -> 清理过期/超重项
```

`CacheBuilder#build` 在 `CacheBuilder.java:1042`、`:1060` 分别创建加载和手工缓存；`LocalCache` 在 `LocalCache.java:110`，分段数组和权重配置在 `:186`、`:203`、`:293`。

## 主流程三：事件与限流

`EventBus#post` 位于 `EventBus.java:259`，先从 `SubscriberRegistry` 找可赋值类型的订阅者，再交给 `Dispatcher`。`Dispatcher` 的实现位于 `Dispatcher.java:35`、`:74`、`:182`。

`RateLimiter#acquire` 位于 `RateLimiter.java:291`，调用 `reserve`（`:317`），最终由 `SmoothRateLimiter#reserveEarliestAvailable`（`SmoothRateLimiter.java:357`）计算等待时间。

## 共同设计手法

| 手法 | Guava 中的体现 | 价值 |
| --- | --- | --- |
| 工厂选择专用实现 | 空集合、单元素集合、JDK 回退实现 | 小对象低成本，异常输入有后备路径 |
| 快路径与慢路径分离 | Cache 命中与 Segment 加锁加载 | 常见命中不承担加载成本 |
| 状态机封装 | 令牌桶的 stored permits 与 next free time | 把时间和并发更新约束在一个边界内 |

### 为什么不把所有组件做成通用抽象

**替代方案**：用一套通用容器、事件队列和限流器覆盖所有场景。
**为什么不行**：集合的核心是内存布局，缓存的核心是并发状态，限流的核心是时间积分；强行共享抽象会隐藏各自的不变量。
**证据**：源码分别把集合落在 `RegularImmutable*`、缓存落在 `LocalCache.Segment`、限流落在 `SmoothRateLimiter`。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| EventBus 订阅者抛异常 | `post` 不向调用方传播原异常 | `SubscriberExceptionHandler` 负责捕获 | 需要失败传播时使用显式调用 |
| Cache 只配过期 | 条目不会由独立后台线程即时清理 | 清理由访问、写入或维护触发 | 调用 `cleanUp` 或配置调度维护 |
| RateLimiter 被当作并发隔离 | 请求仍可能并发执行 | 它只延迟获取许可 | 配合信号量 |

## 可迁移知识

“入口校验 → 专用实现 → 慢路径回退”适合序列化器、路由表和连接池；“把时间转成可累计的债务”适合重试、配额和流量整形。

> **面试锚点**
> - 四个核心子系统分别维护什么不变量？
> - 为什么集合构造会有 JDK 回退实现？
> - Cache 的 Segment 和 RateLimiter 的时间状态如何隔离竞争？

## Related

- [不可变集合](/notes/source/java/base/guava/immutable-collections/)
- [Cache 与 Caffeine 对照](/notes/source/java/base/guava/cache-vs-caffeine/)
- [Caffeine 整体架构](/notes/source/java/base/caffeine/architecture/)
