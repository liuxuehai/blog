---
title: Sentinel
description: Sentinel 1.8 源码解析：Slot 链、滑动窗口、流控、熔断、系统自适应与集群 Token。
category: Backend
tags: [Source Reading, Sentinel, Flow Control, Microservices]
order: 4
updatedDate: 2026-08-20
difficulty: advanced
status: stable
lastReviewed: 2026-08-20
draft: false
sidebar: { order: 4 }
---

Sentinel 把一次资源调用拆成入口、Slot 链、统计节点和规则检查。源码阅读的主线是：请求如何进入统一链路，统计如何在通过和阻断两条路径上回写，以及规则如何通过 Property 和 SPI 在运行时替换。

<!-- more -->

## 本册问题地图

Sentinel 的核心是把一次资源调用放入一条可扩展的保护链：

1. **Entry、Slot、Exit 各自做什么？** Entry 建立上下文，Slot 依次统计和判断，Exit 负责收尾；异常路径不退出会让线程上下文和统计结果失真。
2. **滑动窗口统计什么？** 它把请求按时间切片，近似计算通过量、异常数和慢调用，而不是保存每一次请求的完整历史。
3. **流控、熔断、系统保护观察什么？** 流控看资源或热点参数的瞬时压力，熔断看异常/慢调用比例，系统保护看全局负载，触发条件和恢复方式不同。
4. **规则为什么要区分内存与数据源？** 内存规则生效快但重启丢失，数据源便于持久化和推送；规则更新本身也需要考虑版本和失败回退。
5. **集群 Client/Server 解决什么？** 把限流决策集中到统一配额上，避免每个实例都按本地流量放行导致总量失控。

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
