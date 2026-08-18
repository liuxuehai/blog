---
title: 整体架构
description: Sentinel 的入口、Slot 链、统计节点、规则管理和集群扩展的源码地图。
category: Backend
tags: [Source Reading, Sentinel, Architecture]
order: 41
updatedDate: 2026-08-16
difficulty: advanced
status: stable
lastReviewed: 2026-08-16
draft: false
sidebar: { order: 41 }
---

Sentinel 的核心架构可以压缩为一条调用管线和一组旁路状态：调用管线负责逐 Slot 检查，统计节点负责记录事实，RuleManager 负责提供规则，Property/SPI 负责替换实现。

## 模块地图

```text
业务代码
  -> SphU / CtSph
  -> ProcessorSlotChain
       -> Statistic -> Authority -> System -> Flow -> Degrade
       -> 可选 ParamFlow / ClusterBuilder 等扩展
  -> 业务执行
  -> Entry.exit
       -> 统计 RT、成功、异常、线程数

规则来源: loadRules / SentinelProperty / Dashboard / 外部数据源
扩展来源: SpiLoader
```

```text
                 +-------------------+
                 |  SentinelProperty  |
                 +---------+---------+
                           |
       +-------------------+-------------------+
       v                                       v
 RuleManager                          ClusterStateManager
       |                                       |
       +------------> Slot 检查 <-------------+
                           |
                     DefaultNode
                     /         \
              ClusterNode    OriginNode
```

## 核心边界

`CtSph` 不直接实现所有规则，它只负责 Context、Entry 和按资源缓存 Slot 链；`DefaultSlotChainBuilder` 再通过 SPI 找到有序 Slot。规则管理器把外部配置转换成资源到规则的索引，Node 只保存运行时事实。

## 读码路径

1. 从 `SphU.entry` 进入 `CtSph.entry`。
2. 在 `lookProcessChain` 看资源级链缓存和上限保护。
3. 在 `SlotChainProvider` 与 `DefaultSlotChainBuilder` 看 SPI 和顺序。
4. 在 `StatisticSlot` 看通过、阻断、异常和退出回写。
5. 在 `FlowRuleManager`、`DegradeRuleManager`、`SystemRuleManager` 看规则热更新。

## 为什么这么设计

**替代方案一：** 每种规则在 `SphU` 中写死。**问题：** 入口会耦合所有治理策略，新策略需要修改核心门面。**选择：** 入口只组装资源和链，Slot 负责单一检查。

**替代方案二：** 每次请求重新构造检查器。**问题：** 规则检查处于热路径，构造和反射成本会被放大。**选择：** 同一资源共享 `ProcessorSlotChain`，规则通过可替换管理器读取。

**替代方案三：** 统计、规则、配置传播使用同一对象。**问题：** 配置更新会干扰高并发计数。**选择：** Property 更新规则索引，Node 独立维护窗口统计。

## 源码坐标索引

- `CtSph#entry` — `sentinel-core/src/main/java/com/alibaba/csp/sentinel/CtSph.java:175`
- `CtSph#lookProcessChain` — `sentinel-core/src/main/java/com/alibaba/csp/sentinel/CtSph.java:194`
- `SlotChainProvider#newSlotChain` — `sentinel-core/src/main/java/com/alibaba/csp/sentinel/slotchain/SlotChainProvider.java:38`
- `DefaultSlotChainBuilder#build` — `sentinel-core/src/main/java/com/alibaba/csp/sentinel/slots/DefaultSlotChainBuilder.java:39`
- `StatisticSlot#entry` — `sentinel-core/src/main/java/com/alibaba/csp/sentinel/slots/statistic/StatisticSlot.java:55`
- `StatisticSlot#exit` — `sentinel-core/src/main/java/com/alibaba/csp/sentinel/slots/statistic/StatisticSlot.java:126`
- `FlowSlot#entry` — `sentinel-core/src/main/java/com/alibaba/csp/sentinel/slots/block/flow/FlowSlot.java:160`
- `DefaultCircuitBreakerSlot#entry` — `sentinel-core/src/main/java/com/alibaba/csp/sentinel/slots/block/degrade/DefaultCircuitBreakerSlot.java:41`
- `ClusterStateManager#setToClient` — `sentinel-core/src/main/java/com/alibaba/csp/sentinel/cluster/ClusterStateManager.java:82`

## 边界与踩坑

- Slot 顺序来自 SPI order，不能只按目录顺序推断；扩展模块可能插入新 Slot。
- `chainMap` 按资源缓存，资源名无限增长会触发 `MAX_SLOT_CHAIN_SIZE` 保护，超过后请求会跳过规则检查。
- `EntryType.IN` 与 `OUT` 会影响系统规则；不能把所有调用都当作入站流量。

## 可迁移知识

治理框架适合采用“入口门面 + 有序处理链 + 独立事实存储 + 可替换规则源”的结构。这样新增策略只增加处理节点或规则实现，不必改变业务调用协议。

> **面试锚点**：为什么 Sentinel 用 Slot 链？资源级链缓存解决什么问题？规则热更新为什么不直接修改统计节点？

## Related

- [Slot 链与调用入口](/notes/source/java/rpc/sentinel/slot-chain/)
- [统计节点与时间窗口](/notes/source/java/rpc/sentinel/statistic-node/)
- [Sentinel 概念笔记](/notes/backend/sentinel/)
