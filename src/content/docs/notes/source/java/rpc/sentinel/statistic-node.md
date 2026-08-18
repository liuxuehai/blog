---
title: 统计节点与时间窗口
description: StatisticSlot、StatisticNode、DefaultNode、ClusterNode 与 LeapArray 如何形成 Sentinel 的实时指标。
category: Backend
tags: [Source Reading, Sentinel, Sliding Window, Metrics]
order: 43
updatedDate: 2026-08-16
difficulty: advanced
status: stable
lastReviewed: 2026-08-16
draft: false
sidebar: { order: 43 }
---

Sentinel 的规则检查依赖事实统计。`StatisticSlot` 负责把一次请求的通过、阻断、异常、线程和 RT 写入节点；`StatisticNode` 用秒级和分钟级滚动数组提供不同时间尺度的查询。

## 节点关系

```text
Context
  -> DefaultNode(resource, context)
       -> ClusterNode(resource 全局汇总)
       -> origin Node(按调用方)
       -> child DefaultNode(按调用入口树)

StatisticSlot
  entry: pass / block / thread
  exit : rt / success / exception / thread--
```

## 滑动窗口

```text
时间 --->
| 1s | 1s | 1s | 1s | 1s | 1s |  ... 60 个分钟桶 ... |
      rollingCounterInSecond        rollingCounterInMinute
                 \________________________/
                    rule 查询当前有效桶
```

秒级窗口用于 QPS、RT、线程等热判断，分钟级窗口用于总量、上一窗口等统计。桶不是固定数组索引永久占用；时间推进时 `LeapArray` 会校验桶时间并重置过期桶，因此不会为每个时间点持续分配对象。

## 计数路径

通过请求先增加 pass 和线程数；业务完成后用完成时间减创建时间得到 RT，再增加 success 或 exception 并减少线程数。阻断请求增加 block，但不应被当成业务成功请求。

`DefaultNode` 把资源维度统计转发给关联 `ClusterNode`，同时根据 Context 维护子节点；`ClusterNode` 再提供按 origin 的统计。这个层次使同一资源既能看全局，也能看入口树和调用方。

## 为什么这么设计

**替代方案一：** 只维护一个全局计数器。**问题：** 无法支持资源、入口、调用方和集群规则的不同视角。**选择：** `DefaultNode`、`ClusterNode`、origin Node 分层聚合。

**替代方案二：** 每次查询遍历全部历史请求。**问题：** 规则检查会从 O(1) 退化为与流量量级相关。**选择：** 固定桶滚动统计，把查询压缩为有限桶聚合。

**替代方案三：** 用一个时间窗口服务所有指标。**问题：** 秒级流控与分钟级监控的精度和成本冲突。**选择：** 秒、分钟两套 `ArrayMetric`，按用途取舍。

## 源码坐标索引

- `StatisticSlot#entry` — `sentinel-core/src/main/java/com/alibaba/csp/sentinel/slots/statistic/StatisticSlot.java:55`
- `StatisticSlot#exit` — `sentinel-core/src/main/java/com/alibaba/csp/sentinel/slots/statistic/StatisticSlot.java:126`
- `StatisticSlot#recordCompleteFor` — `sentinel-core/src/main/java/com/alibaba/csp/sentinel/slots/statistic/StatisticSlot.java:155`
- `StatisticNode#rollingCounterInSecond` — `sentinel-core/src/main/java/com/alibaba/csp/sentinel/node/StatisticNode.java:96`
- `StatisticNode#rollingCounterInMinute` — `sentinel-core/src/main/java/com/alibaba/csp/sentinel/node/StatisticNode.java:103`
- `StatisticNode#passQps` — `sentinel-core/src/main/java/com/alibaba/csp/sentinel/node/StatisticNode.java:200`
- `StatisticNode#avgRt` — `sentinel-core/src/main/java/com/alibaba/csp/sentinel/node/StatisticNode.java:226`
- `StatisticNode#addPassRequest` — `sentinel-core/src/main/java/com/alibaba/csp/sentinel/node/StatisticNode.java:246`
- `StatisticNode#tryOccupyNext` — `sentinel-core/src/main/java/com/alibaba/csp/sentinel/node/StatisticNode.java:288`
- `DefaultNode#addPassRequest` — `sentinel-core/src/main/java/com/alibaba/csp/sentinel/node/DefaultNode.java:140`
- `ClusterNode#getOrCreateOriginNode` — `sentinel-core/src/main/java/com/alibaba/csp/sentinel/node/ClusterNode.java:101`

## 边界与踩坑

- QPS 是有效窗口内的聚合，不等于当前瞬时计数；窗口大小由属性和采样桶共同决定。
- RT 统计通常基于成功完成请求；被阻断请求没有业务完成 RT。
- 线程数必须在 exit 路径减少，跨线程、异常退出或错误 Entry 配对会造成虚高。
- 时间窗口解决的是统计近似，不提供严格线性一致的限流计数。

## 可迁移知识

滑动窗口适合把“近一段时间的行为”变成固定成本的在线指标。分层节点则是多维聚合的一种通用方式：叶子保留上下文细节，父节点提供共享配额视图。

> **面试锚点**：为什么 Sentinel 有秒级和分钟级窗口？阻断请求为什么也要统计？`DefaultNode` 和 `ClusterNode` 的职责有什么差异？

## Related

- [流控与规则匹配](/notes/source/java/rpc/sentinel/flow-control/)
- [Slot 链与调用入口](/notes/source/java/rpc/sentinel/slot-chain/)
- [流量控制概念笔记](/notes/backend/sentinel/flow-control/)
