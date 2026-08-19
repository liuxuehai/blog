---
title: 过期与内存淘汰
description: Redis 如何在读路径、主动扫描和内存压力下处理 TTL 与淘汰。
category: Database
tags: [Source Reading, Redis, Expiry, Eviction]
order: 17
updatedDate: 2026-08-19
difficulty: advanced
status: stable
lastReviewed: 2026-08-19
draft: false
sidebar:
  order: 17
---

Redis 的过期不是一个必须即时触发的定时器集合，而是惰性删除与主动抽样的组合；内存超过上限后，再由 eviction 逻辑选择受害 key。

<!-- more -->

## 先给答案：过期解决“键还能不能存在”，淘汰解决“内存不够时删谁”

过期时间是业务或命令赋予单个 key 的生命周期；淘汰策略是在达到内存上限后，从仍可能有效的 key 中选择牺牲者。两者都可能让读取返回 miss，却有不同的触发条件、统计指标和一致性含义。

Redis 同时使用惰性删除和主动抽样：访问时保证过期键不会继续被使用，后台周期性清理则避免无人访问的过期键长期占内存。主动清理受预算限制，所以过期并不等于物理内存瞬间归还；在高写入、低访问或大 value 场景下，应分别观察 keyspace、eviction 和 allocator 行为。


## 两条回收路径

```text
读/写 key
   └─► lookupKey ─► expireIfNeeded ─► 删除或返回不存在

serverCron / activeExpireCycle
   └─► 抽样 expires ─► 批量删除过期 key

写入导致超限
   └─► performEvictions ─► 采样比较 ─► 删除 victim
```

`lookupKey` 在 `src/db.c:298`，过期判断由 `expireIfNeeded` 在 `src/db.c:3020` 完成；主动过期入口是 `src/expire.c:287` 的 `activeExpireCycle`。内存淘汰入口是 `src/evict.c:532` 的 `performEvictions`。

## 惰性与主动过期

惰性过期保证客户端不会读到已经过期的 key，但它只覆盖被访问的 key。主动过期由周期任务扫描 expires 字典，通过预算限制单次工作量，避免为了清理冷 key 阻塞主循环。`activeExpireCycleTryExpire` 位于 `src/expire.c:40`，负责在扫描中确认并删除候选。

### 为什么不为每个 key 创建一个精确定时器

**替代方案**：每个 TTL 注册独立时间事件，到点立即删除。
**为什么不行**：海量 key 会产生海量定时器节点；删除时机与主线程执行绑定，精确定时并不能消除事件循环拥塞，反而增加内存和调度开销。
**证据**：Redis 将 expires 存储与 `activeExpireCycle` 抽样扫描结合，见 `src/expire.c:287`，而不是为每个 key 调用 `aeCreateTimeEvent`。

## 内存淘汰

`performEvictions` 在写入路径检测内存压力，根据配置选择 noeviction、LRU、LFU、随机或 TTL 策略。采样式淘汰避免维护全局有序结构；代价是每次选择只是近似最优。淘汰和过期都必须更新复制/AOF 语义，不能只释放内存而跳过命令传播。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| 冷 key 过期但未访问 | `DBSIZE` 仍偏大 | 惰性删除尚未触发 | 依赖主动过期，不能把 TTL 当实时回收 |
| 过期集中爆发 | 延迟尖刺 | 主动扫描删除过多对象 | 分散 TTL，观察 active-expire 时间预算 |
| 淘汰策略不匹配 | 热 key 被删除 | LRU/LFU 是采样近似且受访问统计影响 | 用业务访问分布选择策略并压测 |
| 大 key 删除 | 主线程卡顿 | 释放对象成本高 | 拆分 key，使用异步释放能力并监控 latency |

## 可迁移知识

回收系统通常需要三层：访问时校验保证语义正确，后台扫描保证最终清理，压力触发保证资源上限。采样代替全局排序则是以可控 CPU 换近似决策，适合高吞吐系统。

> **面试锚点**
> - Redis 过期 key 为什么不一定马上消失？
> - 惰性删除和主动删除如何配合？
> - LRU/LFU 淘汰为什么采用采样而不是维护全局队列？

## Related

- [ae 事件循环与单线程模型](/notes/source/redis/redis/event-loop/)
- [整体架构](/notes/source/redis/redis/architecture/)
- [Redisson source index](/notes/source/java/storage/redisson/)
