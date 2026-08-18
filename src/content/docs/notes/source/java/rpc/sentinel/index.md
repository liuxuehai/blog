---
title: Sentinel
description: Sentinel 1.8 源码解析：Slot 链、滑动窗口、流控、熔断、系统自适应与集群 Token。
category: Backend
tags: [Source Reading, Sentinel, Flow Control, Microservices]
order: 4
updatedDate: 2026-08-16
difficulty: advanced
status: stable
lastReviewed: 2026-08-16
draft: false
sidebar: { order: 4 }
---

Sentinel 把一次资源调用拆成入口、Slot 链、统计节点和规则检查。源码阅读的主线是：请求如何进入统一链路，统计如何在通过和阻断两条路径上回写，以及规则如何通过 Property 和 SPI 在运行时替换。

<!-- more -->

## 版本快照

| 项 | 值 |
| --- | --- |
| 仓库 | `alibaba/Sentinel` |
| 本地路径 | `E:\source\java\rpc\sentinel` |
| 分支 | `1.8` |
| Commit | `a3f40ba8`（2026-05-27） |
| 最近 tag | `1.8.10` |

> 本册源码坐标均基于上述 commit，上游演进后行号可能漂移。

## 它解决什么问题

- 在调用侧提供低侵入的流量入口、统计、授权和熔断能力。
- 通过滑动窗口把实时指标变成规则检查可消费的 Node 数据。
- 用 SPI、动态 Property 和集群 Token 把本地执行、配置传播与集中配额解耦。

## 本册目录

- [整体架构](/notes/source/java/rpc/sentinel/architecture/)
- [Slot 链与调用入口](/notes/source/java/rpc/sentinel/slot-chain/)
- [统计节点与时间窗口](/notes/source/java/rpc/sentinel/statistic-node/)
- [流控与规则匹配](/notes/source/java/rpc/sentinel/flow-control/)
- [熔断、系统保护与授权](/notes/source/java/rpc/sentinel/degrade-system/)
- [集群流控与面试专题](/notes/source/java/rpc/sentinel/cluster-and-interview/)

## 源码导航

| 主题 | 入口 |
| --- | --- |
| 调用门面 | `sentinel-core/.../SphU.java`、`CtSph.java` |
| Slot 构建 | `slotchain/SlotChainProvider.java`、`slots/DefaultSlotChainBuilder.java` |
| 统计 | `slots/statistic/StatisticSlot.java`、`node/StatisticNode.java` |
| 规则 | `slots/block/RuleManager.java`、各 RuleManager |
| 集群 | `cluster/ClusterStateManager.java`、`cluster/client`、`cluster/server` |

## Related

- [RPC 与微服务](/notes/source/java/rpc/)
- [Spring Cloud Alibaba](/notes/source/java/spring/spring-cloud-alibaba/)
- [Sentinel 概念笔记](/notes/backend/sentinel/)
