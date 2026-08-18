---
title: Cache 与 Caffeine 对照
description: Guava LocalCache 的分段锁、加载占位、过期淘汰与 Caffeine 并发设计对照。
category: Backend
tags: [Source Reading, Guava, Cache, Caffeine, Concurrency]
order: 63
updatedDate: 2026-08-16
difficulty: advanced
status: stable
lastReviewed: 2026-08-16
draft: false
sidebar:
  order: 63
---

Guava Cache 的核心是 `LocalCache` 加 `Segment`：通过分段降低锁竞争，并用加载占位合并同一 key 的并发请求。它与 Caffeine 的差异集中在读路径是否直接修改维护结构。

<!-- more -->

```text
request -> hash -> Segment -> table lookup
                         -> hit: value + recency record
                         -> miss: LoadingValueReference
                                  -> one loader -> waiters share result
```

## Guava 实现

`CacheBuilder` 保存最大容量、权重、过期和刷新配置，字段位于 `CacheBuilder.java:289-303`；`maximumSize` 从 `:499`、`expireAfterWrite` 从 `:764` 设置，`build` 在 `:1042`、`:1060` 创建缓存。

`LocalCache` 在 `LocalCache.java:110`，源码注释说明 table 按 `Segment` 划分；segments 字段在 `:186`，构造分配在 `:293`，每段最大权重在 `:307-314`。容量边界因此是 best effort 的分段边界，而非全局精确 LRU。

过期判断集中在 `LocalCache#isExpired`（`LocalCache.java:1796`），访问时间与写入时间分别参与判断。Segment 继承 `ReentrantLock`，见 `LocalCache.java:1864`；超重淘汰在 `:2649-2669`，刷新从 `:2385` 开始。

## 与 Caffeine 的差异

| 维度 | Guava | Caffeine |
| --- | --- | --- |
| 竞争隔离 | `Segment` 分段锁 | 更细粒度的缓冲与批量维护 |
| 命中记录 | Segment 内维护 recency 队列 | 读事件进入 read buffer，之后 drain |
| 驱逐策略 | LRU/LFU 风格的分段维护 | W-TinyLFU 准入与更精细的窗口 |
| 加载模型 | `LoadingValueReference` | 异步加载和 future 支持更完整 |

Caffeine 的典型入口是 `BoundedLocalCache#getIfPresent` 和 `drainReadBuffer`，详见 [Caffeine 并发读写](/notes/source/java/base/caffeine/concurrency/)。Guava 的 `Segment` 把查找、加锁、队列整理和淘汰放在同一实现边界内。

### 为什么 Guava 使用分段锁

**替代方案**：整张缓存使用一把全局锁。
**为什么不行**：不同 key 的加载和淘汰会互相阻塞，缓存命中也被慢请求拖住。
**证据**：`LocalCache` 将表拆分为多个 `Segment`，每段是 `ReentrantLock`；构造阶段还按最大权重分摊到各 segment（`LocalCache.java:279-314`）。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| `maximumSize` 很小但并发度很大 | 实际容量与期望有偏差 | 上限按 segment 分摊 | 让并发度和容量规模匹配，或使用 Caffeine |
| loader 慢 | 等待同 key 的线程变多 | 占位合并请求但不能消除慢依赖 | loader 设置超时、隔离线程池 |
| 只配 TTL | 过期条目短时间仍可能留在 table | 清理依赖访问、写入或维护 | 定期 `cleanUp` 或配置调度维护 |

## 可迁移知识

分片锁适合热点分布均匀、操作粒度独立的哈希结构；占位对象适合合并重复工作，但必须配合超时、异常传播和取消策略。

> **面试锚点**
> - Guava Cache 的 Segment 为什么造成容量近似？
> - `LoadingValueReference` 解决的是重复加载还是一致性？
> - Caffeine 为什么能减少命中路径上的写竞争？

## Related

- [Caffeine 整体架构](/notes/source/java/base/caffeine/architecture/)
- [Caffeine 并发读写](/notes/source/java/base/caffeine/concurrency/)
- [整体架构](/notes/source/java/base/guava/architecture/)
