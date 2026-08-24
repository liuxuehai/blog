---
title: W-TinyLFU 与准入
description: Count-Min Sketch、双区队列与 W-TinyLFU victim 竞争。
category: Backend
tags: [Source Reading, Caffeine, W-TinyLFU, Eviction]
order: 52
updatedDate: 2026-08-22
difficulty: advanced
status: stable
lastReviewed: 2026-08-22
draft: false
sidebar:
  order: 52
---

Caffeine 把准入和淘汰分开：新条目先进入小窗口，只有频率足够高才有机会挤进主空间。

<!-- more -->

## 先给答案：W-TinyLFU 把“短期新鲜度”和“长期频率”放到一次准入决策里

新条目不会因为刚到达就直接挤掉热点条目。它通常先经过小窗口获得短期机会，再与受害者比较频率估计；频率高的候选更容易进入主缓存，低频的一次性流量会被挡在外面。计数器并不保存无限历史，而是用有限空间近似近期访问频率，并周期性衰减让旧热点失去永久特权。

这解释了它与纯 LRU 的差异：LRU 对突发扫描敏感，W-TinyLFU 会问“这个新 key 是否真的比当前受害者更值得占用容量”。代价是策略更复杂，命中率依赖访问分布，不能脱离真实工作负载凭直觉判断。

```text
new -> Window LRU -> candidate --frequency compare--> victim/Main
                                      |
                         probation <-> protected
```

`FrequencySketch` 在 `FrequencySketch.java:30` 声明为概率多重集合；`ensureCapacity` 在 `91` 初始化，`frequency` 在 `112` 查询，`increment` 在 `143` 更新，`reset` 在 `223` 衰减。

## Count-Min Sketch

四个 hash 位置各有一个 4-bit counter，查询取最小值，最大计数为 15。`BoundedLocalCache#evictFromMain` 位于 `BoundedLocalCache.java:733`，`admit` 位于 `841`，比较 candidate 与 victim。

### 为什么不用精确计数表

**替代方案**：每个 key 保存精确访问次数。
**为什么不行**：空间与 key 集合同阶，还要处理淘汰和长期热点衰减。
**证据**：固定深度、饱和 counter 和周期 `reset` 用小空间换相对热度。

## 边界与踩坑

| 场景 | 原因 | 规避 |
| --- | --- | --- |
| hash 质量差 | sketch 碰撞 | 使用稳定 hashCode |
| 流量突变 | 旧热点需经过老化窗口 | 观察完整窗口再调参 |
| 极小缓存 | 队列比例和精度受限 | 先做基准测试 |

## 可迁移知识

Count-Min Sketch 适合准入、限流、热点探测和流式统计；饱和计数加周期衰减可控制长期偏差。

> **面试锚点**
> - W-TinyLFU 为什么抗扫描流量？
> - 为什么查询取多个 counter 的最小值？
> - 频率为什么必须周期性减半？

## Related

- [整体架构](/notes/source/java/base/caffeine/architecture/)
- [写后队列与维护](/notes/source/java/base/caffeine/write-buffer/)
