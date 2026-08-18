---
title: 整体架构
description: Caffeine 的配置建造、缓存实现、事件缓冲和维护流程。
category: Backend
tags: [Source Reading, Caffeine, Architecture]
order: 51
updatedDate: 2026-08-16
difficulty: advanced
status: stable
lastReviewed: 2026-08-16
draft: false
sidebar:
  order: 51
---

Caffeine 把访问、记录、维护和加载拆开：主读路径快速返回，后续再批量整理队列、过期和驱逐状态。

<!-- more -->

```text
Caffeine builder -> Cache / LoadingCache / AsyncCache
                         |
                  BoundedLocalCache
          +------+--------+--------+
          |      |        |        |
       CHM<Node> buffer  Sketch  TimerWheel
```

| 层 | 坐标 |
| --- | --- |
| 配置 | `Caffeine.java:141`、`1102-1217` |
| 存储 | `BoundedLocalCache.java:113` |
| 维护 | `BoundedLocalCache.java:1588`、`1767`、`1829`、`1903` |
| 策略 | `FrequencySketch.java:30` |
| 过期 | `TimerWheel.java:40` |

## 启动流程

```text
maximumSize / expire / loader -> Caffeine#build
       -> manual / loading / async implementation
       -> BoundedLocalCache + policies
```

`maximumSize` 在 `Caffeine.java:447` 保存配置；`build` 在 `1102`、`1128`、`1160` 和 `1193` 选择实现。

## 请求流程

```text
get -> CHM lookup -> hit: return + record event
                 -> miss: loader/future -> write -> drain -> eviction
```

`get` 在 `BoundedLocalCache.java:2252`，`getIfPresent` 在 `2257`；`afterWrite` 在 `1588`，`maintenance` 在 `1767`。

## 关键取舍

**替代方案**：每次命中立即移动 LRU 链表。
**为什么不行**：热点访问会竞争同一条写共享结构。
**证据**：命中只记录事件，`drainReadBuffer`（`BoundedLocalCache.java:1829`）批量整理访问顺序。

## 边界与踩坑

| 场景 | 原因 | 规避 |
| --- | --- | --- |
| 只配 TTL | 维护由访问/写入触发 | 配 scheduler 或 `cleanUp` |
| loader 阻塞 | 同步 loader 在调用线程执行 | 隔离线程池或异步 loader |
| listener 阻塞 | 回调处于维护链路 | 只做轻量投递 |

## 可迁移知识

“快速记录、延后归并、批量维护”适合指标、日志、连接池和本地索引。

> **面试锚点**
> - Caffeine 为什么不是 ConcurrentHashMap 加 LRU？
> - 读路径为什么不立即更新访问队列？
> - `build()` 如何选择同步和异步实现？

## Related

- [W-TinyLFU 与准入](/notes/source/java/base/caffeine/tiny-lfu/)
- [写后队列与维护](/notes/source/java/base/caffeine/write-buffer/)
