---
title: 集群容错与负载均衡
description: Directory、RouterChain、LoadBalance 与 FailoverClusterInvoker 的调用选择和重试机制。
category: Backend
tags: [Source Reading, Dubbo, Cluster, Load Balance]
order: 24
updatedDate: 2026-08-16
difficulty: advanced
status: stable
lastReviewed: 2026-08-16
draft: false
sidebar: { order: 24 }
---

Dubbo 的集群层把“多个服务地址”变成“一个可调用对象”。它先得到动态地址视图，再执行路由和负载均衡，最后由 Cluster 策略决定失败、重试、广播还是静默降级。

<!-- more -->

## 调用选择图

```text
ClusterInvoker#invoke
  -> Directory#list
      -> snapshot + RouterChain#route
  -> initLoadBalance
  -> select
      -> available check
      -> LoadBalance#select
  -> concrete doInvoke
      -> Failover: retry selected invokers
      -> Broadcast: invoke all
      -> Failsafe: swallow exception
```

## Directory 与路由

`AbstractDirectory#list` 位于 `dubbo-cluster/src/main/java/org/apache/dubbo/rpc/cluster/directory/AbstractDirectory.java:204`，先复制或读取可用 Invoker 快照，在 `:249` 调用 `doList`，最后在 `:264` 返回不可修改列表。地址变更通过 `refreshInvoker`（`:433`）和 `refreshInvokerInternal`（`:447`）更新，避免调用线程看到半更新状态。

`RouterChain#buildChain` 位于 `dubbo-cluster/src/main/java/org/apache/dubbo/rpc/cluster/RouterChain.java:52`，创建主链和备用链；`route` 在 `:120` 选择当前链并完成路由。路由不是负载均衡：前者决定“哪些节点可以参与”，后者决定“最终选哪个”。

## 负载均衡与选择

`AbstractClusterInvoker#invoke` 位于 `dubbo-cluster/src/main/java/org/apache/dubbo/rpc/cluster/support/AbstractClusterInvoker.java:345`，在 `:355` 获取列表、`:360` 初始化 LoadBalance、`:366` 交给 `doInvoke`。`select` 在 `:155` 处理粘滞、重复选择和 available 检查；具体选择在 `:199` 调用 `loadbalance.select`。

## Failover 的语义

`FailoverClusterInvoker#doInvoke` 位于 `dubbo-cluster/src/main/java/org/apache/dubbo/rpc/cluster/support/FailoverClusterInvoker.java:59`，每轮重新获取或复制候选列表，并在 `:77` 选择未调用过的 Invoker。重试次数不是“保证成功”，只是把可恢复异常传播延迟；网络请求可能已经到达服务端，因此非幂等业务会重复执行。

## 关键取舍

### 为什么把路由和负载均衡分开

**替代方案**：一个 `select()` 同时完成标签过滤、区域优先和节点选择。**为什么不行**：治理规则会和算法耦合，无法独立替换，也难以解释“为什么这台节点没有被选中”。**证据**：`AbstractDirectory#list` 先调用 `doList`/RouterChain，`AbstractClusterInvoker#select` 再调用 `LoadBalance#select`，源码顺序固定表达了两个决策阶段。

## 源码坐标索引

- `AbstractDirectory#list` — `dubbo-cluster/src/main/java/org/apache/dubbo/rpc/cluster/directory/AbstractDirectory.java:204`
- `AbstractDirectory#doList` — `dubbo-cluster/src/main/java/org/apache/dubbo/rpc/cluster/directory/AbstractDirectory.java:249`
- `AbstractDirectory#refreshInvoker` — `dubbo-cluster/src/main/java/org/apache/dubbo/rpc/cluster/directory/AbstractDirectory.java:433`
- `AbstractDirectory#refreshInvokerInternal` — `dubbo-cluster/src/main/java/org/apache/dubbo/rpc/cluster/directory/AbstractDirectory.java:447`
- `RouterChain#buildChain` — `dubbo-cluster/src/main/java/org/apache/dubbo/rpc/cluster/RouterChain.java:52`
- `RouterChain#route` — `dubbo-cluster/src/main/java/org/apache/dubbo/rpc/cluster/RouterChain.java:120`
- `AbstractClusterInvoker#invoke` — `dubbo-cluster/src/main/java/org/apache/dubbo/rpc/cluster/support/AbstractClusterInvoker.java:345`
- `AbstractClusterInvoker#select` — `dubbo-cluster/src/main/java/org/apache/dubbo/rpc/cluster/support/AbstractClusterInvoker.java:155`
- `FailoverClusterInvoker#doInvoke` — `dubbo-cluster/src/main/java/org/apache/dubbo/rpc/cluster/support/FailoverClusterInvoker.java:59`

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| 所有节点不可用 | 选择失败或快速异常 | available 检查过滤了候选 | 检查健康检查、连接状态和路由规则 |
| 重试导致重复扣款 | 业务结果重复 | 客户端无法判断服务端是否已执行 | 幂等键、状态查询、关闭重试 |
| 路由过滤过度 | 明明有节点却无 provider | 标签/区域规则把列表清空 | 监控路由前后列表长度，设置兜底 |

## 可迁移知识

候选集过滤与最终选择分离，是推荐系统、任务调度和数据库分片路由的通用结构。容错策略要和业务幂等性绑定，而不能只按网络异常分类。

> **面试锚点**
> - Directory、Router 和 LoadBalance 的执行顺序是什么？
> - Failover 为什么可能造成重复执行？
> - Dubbo 的 Cluster 策略有哪些典型语义？

## Related

- [整体架构](/notes/source/java/rpc/dubbo/architecture/)
- [服务治理与扩展边界](/notes/source/java/rpc/dubbo/governance/)
- [RocketMQ 消费重平衡](/notes/source/java/mq/rocketmq/consumer-rebalance/)
