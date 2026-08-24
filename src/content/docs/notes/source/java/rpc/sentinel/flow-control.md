---
title: 流控与规则匹配
description: FlowSlot、FlowRuleChecker、RuleManager 与排队、预热、关联和集群流控的源码关系。
category: Backend
tags: [Source Reading, Sentinel, Flow Control, QPS]
order: 44
updatedDate: 2026-08-24
difficulty: advanced
status: stable
lastReviewed: 2026-08-24
draft: false
sidebar: { order: 44 }
---

<!-- more -->

## 先给答案：FlowSlot、FlowRuleChecker、RuleManager 与排队、预热、关联和集群流控的源…

FlowSlot、FlowRuleChecker、RuleManager 与排队、预热、关联和集群流控的源码关系。 正文沿“检查路径 -> 规则快照 -> 热点参数边界”展开：先确认入口和状态归属，再跟踪控制流或数据流的推进，最后落到对外可观察的结果。

主要失效边界集中在“参数流控在 sentinel-parameter-flow-control 扩展模块中实现，不是 core 默认 Slot 的同义词”这些场景。它们破坏的是容量、顺序、并发或生命周期前提；排查时应先确认状态是否仍由正确对象持有，再核对推进条件和清理路径。

## 检查路径

```text
FlowSlot.entry
  -> FlowRuleManager.getFlowRules(resource)
  -> 遍历规则
  -> FlowRuleChecker.checkFlow
       -> cluster mode ? requestToken : local Node
       -> strategy 选择资源视图
       -> rater.canPass(node, count, prioritized)
  -> pass 或 FlowException
```

策略可以按当前资源、调用方、关联资源或调用链选择统计 Node；控制行为则决定立即拒绝、Warm Up 或 Rate Limiter。排队模式会借助 Node 的 waiting/occupied 统计计算下一次可通过时间。

## 规则快照

`FlowRuleManager` 通过 `SentinelProperty<List<FlowRule>>` 接收配置。监听器把列表转换成资源到规则的 Map，并调用 `RuleManager.updateRules` 替换索引。`RuleManager` 将简单资源和正则资源分开，匹配过的正则结果进入缓存，避免每次请求重新遍历 Pattern。

## 热点参数边界

参数流控在 `sentinel-parameter-flow-control` 扩展模块中实现，不是 core 默认 Slot 的同义词。扩展通过 `ParamFlowSlot` 检查参数，`ParamFlowRuleManager` 维护参数规则；是否出现于链中取决于模块和 SPI 配置。

## 为什么这么设计

**替代方案一：** 在 `FlowSlot` 中实现所有策略。**问题：** 新增 Warm Up、排队或集群模式会让入口类膨胀。**选择：** Slot 负责编排，Checker 和 Controller 负责算法。

**替代方案二：** 规则更新时逐请求加锁读取新列表。**问题：** 热路径被配置变更锁影响。**选择：** Manager 构造新索引，再以 volatile/监听器语义发布。

**替代方案三：** 集群流控让每个节点独立估算。**问题：** 配额被节点数放大。**选择：** Client 向 Token Server 申请令牌，失败时按规则决定是否回退本地。

## 源码坐标索引

- `FlowSlot#entry` — `sentinel-core/src/main/java/com/alibaba/csp/sentinel/slots/block/flow/FlowSlot.java:160`
- `FlowSlot#checkFlow` — `sentinel-core/src/main/java/com/alibaba/csp/sentinel/slots/block/flow/FlowSlot.java:168`
- `FlowSlot#ruleProvider` — `sentinel-core/src/main/java/com/alibaba/csp/sentinel/slots/block/flow/FlowSlot.java:177`
- `FlowRuleChecker#checkFlow` — `sentinel-core/src/main/java/com/alibaba/csp/sentinel/slots/block/flow/FlowRuleChecker.java:44`
- `FlowRuleChecker#canPassCheck` — `sentinel-core/src/main/java/com/alibaba/csp/sentinel/slots/block/flow/FlowRuleChecker.java:59`
- `FlowRuleChecker#selectNodeByRequesterAndStrategy` — `sentinel-core/src/main/java/com/alibaba/csp/sentinel/slots/block/flow/FlowRuleChecker.java:115`
- `FlowRuleChecker#passClusterCheck` — `sentinel-core/src/main/java/com/alibaba/csp/sentinel/slots/block/flow/FlowRuleChecker.java:147`
- `FlowRuleManager#register2Property` — `sentinel-core/src/main/java/com/alibaba/csp/sentinel/slots/block/flow/FlowRuleManager.java:93`
- `FlowRuleManager#loadRules` — `sentinel-core/src/main/java/com/alibaba/csp/sentinel/slots/block/flow/FlowRuleManager.java:117`
- `RuleManager#updateRules` — `sentinel-core/src/main/java/com/alibaba/csp/sentinel/slots/block/RuleManager.java:55`
- `RuleManager#getRules` — `sentinel-core/src/main/java/com/alibaba/csp/sentinel/slots/block/RuleManager.java:88`
- `ParamFlowSlot#checkFlow` — `sentinel-extension/sentinel-parameter-flow-control/src/main/java/com/alibaba/csp/sentinel/slots/block/flow/param/ParamFlowSlot.java:61`

## 边界与踩坑

- 多条 FlowRule 是逐条检查，任意一条失败都会阻断；规则顺序和策略组合需要显式测试。
- `strategy` 选择的是统计视图，不是简单的“把请求转发给另一个资源”。
- Warm Up 和 Rate Limiter 改变的是通过时机，不等同于把阈值永久改小。
- 集群 Token Client 不可用时是否本地回退由 `fallbackToLocalWhenFail` 决定，不能默认认为强一致。

## 可迁移知识

把限流拆成“规则匹配、统计视图选择、令牌算法、失败策略”四层，能够同时覆盖本地和集群场景。热路径只做索引读取和算法判断，配置传播放在旁路完成。

> **面试锚点**：关联流控和链路流控如何选 Node？Warm Up 与排队的差异是什么？正则资源规则为什么要缓存匹配结果？

## Related

- [统计节点与时间窗口](/notes/source/java/rpc/sentinel/statistic-node/)
- [集群流控与面试专题](/notes/source/java/rpc/sentinel/cluster-and-interview/)
- [流量控制概念笔记](/notes/backend/sentinel/flow-control/)
- [热点参数流控](/notes/backend/sentinel/hotspot-param-flow/)
