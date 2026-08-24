---
title: 缓存一致性与击穿保护
description: 本地缓存、Redis cacheNode、SingleFlight、空值占位和灾难快速失败。
category: Backend
tags: [Source Reading, go-zero, Go, Cache]
order: 25
updatedDate: 2026-08-24
difficulty: advanced
status: stable
lastReviewed: 2026-08-24
draft: false
sidebar:
  order: 25
---

go-zero 的缓存实现把几个常见问题放在同一条路径上处理：过期、容量、并发回源、缓存空值、缓存损坏和数据库故障隔离。

<!-- more -->

## 先给答案：go-zero 的缓存实现把几个常见问题放在同一条路径上处理：过期、容量、并发回源、缓存空值、缓存损坏和数…

go-zero 的缓存实现把几个常见问题放在同一条路径上处理：过期、容量、并发回源、缓存空值、缓存损坏和数据库故障隔离。 正文沿“回源流程 -> 本地缓存 -> Redis cacheNode”展开：先确认入口和状态归属，再跟踪控制流或数据流的推进，最后落到对外可观察的结果。

主要失效边界集中在“不缓存 not-found、缓存坏值、DB 已故障仍回源”这些场景。它们破坏的是容量、顺序、并发或生命周期前提；排查时应先确认状态是否仍由正确对象持有，再核对推进条件和清理路径。

## 回源流程

```text
Get cache
  ├─ hit ─► unmarshal ─► return
  └─ miss
       └─ SingleFlight(key)
            ├─ double-check cache
            ├─ query DB
            ├─ not found ─► placeholder + short expiry
            ├─ error ─► fail fast, do not hit DB again
            └─ success ─► set cache ─► share result
```

## 本地缓存

`collection.NewCache` 初始化 map、`SingleFlight`、不稳定过期和时间轮：`core/collection/cache.go:43-75`。写入时把过期时间加上 ±5% 抖动：`core/collection/cache.go:108-121`。`WithLimit` 接入 key LRU，淘汰回调删除 map 和 timer：`core/collection/cache.go:188-195`、`core/collection/cache.go:235-269`。

## Redis cacheNode

`NewNode` 保存 Redis、过期时间、barrier、统计器和 not-found 错误：`core/stores/cache/cachenode.go:42-61`。`doGetCache` 识别空字符串和 `*` 占位符：`core/stores/cache/cachenode.go:187-205`。`doTake` 通过 `DoEx` 合并回源；数据库错误会直接返回，源码明确说明这是为了不让灾难传到数据库：`core/stores/cache/cachenode.go:208-239`。

不存在的记录使用 `SetnxEx` 写占位值：`core/stores/cache/cachenode.go:278-281`。缓存反序列化失败则删除坏值并返回 not-found，让下一次查询重新加载：`core/stores/cache/cachenode.go:258-275`。

## 为什么过期时间要加抖动

**替代方案**：所有 key 使用完全相同的 TTL。
**为什么不行**：批量写入的热点 key 会形成同一时刻的过期风暴，瞬间把回源压力推给数据库。
**证据**：本地 cache 的 `unstableExpiry` 和 Redis cacheNode 的 `aroundDuration` 都采用 5% 偏差：`core/collection/cache.go:18-20`、`core/stores/cache/cachenode.go:20-24`。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| 不缓存 not-found | 热点不存在 key 打穿 DB | 每次 miss 都回源 | 使用短 TTL 空值占位 |
| 缓存坏值 | 每次读取都反序列化失败 | 数据格式变更或写入不完整 | 删除坏值并重新加载 |
| DB 已故障仍回源 | 连接池和数据库雪崩 | miss 路径无限重试 | 对非 not-found 错误 fail fast |
| 删除后只依赖 TTL | 旧值继续可见 | 删除延迟或失败 | 异步重试删除并设置 TTL |

## 可迁移知识

缓存正确性不是命中率一个指标，而是由 TTL 抖动、空值策略、并发合并、坏值修复和故障隔离共同决定。

> **面试锚点**
> - go-zero 如何处理缓存击穿和缓存穿透？
> - 为什么对数据库错误 fail fast？
> - 缓存过期抖动解决什么线上问题？

## Related

- [syncx 并发原语](/notes/source/go/go-zero/syncx/)
- [自适应限流与负载保护](/notes/source/go/go-zero/adaptive-limit/)
- [Caffeine 过期机制](/notes/source/java/base/caffeine/expiration/)
