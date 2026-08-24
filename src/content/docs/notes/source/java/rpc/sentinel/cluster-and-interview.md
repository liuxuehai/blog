---
title: 集群流控与面试专题
description: Sentinel 集群 Token Client/Server、状态切换、规则动态加载和源码面试题。
category: Backend
tags: [Source Reading, Sentinel, Cluster Flow Control, Interview]
order: 46
updatedDate: 2026-08-24
difficulty: advanced
status: stable
lastReviewed: 2026-08-24
draft: false
sidebar: { order: 46 }
---

<!-- more -->

## 先给答案：Sentinel 集群 Token Client/Server、状态切换、规则动态加载和源码面试题

Sentinel 集群 Token Client/Server、状态切换、规则动态加载和源码面试题。 正文沿“集群路径 -> Client / Server 边界 -> 为什么这么设计”展开：先确认入口和状态归属，再跟踪控制流或数据流的推进，最后落到对外可观察的结果。

主要失效边界集中在“ClusterTokenClient 只表达当前 Token Server、启动停止和状态，ClusterTokenServer 只表达服务生命周期；协议、编码、请求处理器放在默认实现模块”这些场景。它们破坏的是容量、顺序、并发或生命周期前提；排查时应先确认状态是否仍由正确对象持有，再核对推进条件和清理路径。

## 集群路径

```text
业务请求
  -> FlowRuleChecker#passClusterCheck
  -> ClusterStateManager.isClient()
  -> ClusterTokenClient.requestToken
  -> Token Server
       -> 集群规则 / ClusterFlowRuleManager
       -> TokenResult
  -> pass / block / fallback local
```

```text
配置 Property
  -> ClusterStateManager.applyState
       NOT_STARTED
       CLIENT: stop embedded server, start client
       SERVER: stop client, start embedded server
```

## Client / Server 边界

`ClusterTokenClient` 只表达当前 Token Server、启动停止和状态，`ClusterTokenServer` 只表达服务生命周期；协议、编码、请求处理器放在默认实现模块。`ClusterStateManager` 负责互斥切换，切换到 Client 前停 Server，切换到 Server 前停 Client。

规则动态加载遵循相同模式：Dashboard 或外部数据源更新 Property，Manager listener 构造资源索引，热路径只读取索引。集群规则还需要保证 Token Server 的规则视图和 Client 的本地规则元数据协同更新。

## 为什么这么设计

**替代方案一：** 每个业务节点各自做本地限流。**问题：** 总配额随节点数线性放大。**选择：** 用 Token Server 作为共享配额仲裁者。

**替代方案二：** 把网络协议写进 FlowRuleChecker。**问题：** core 被具体传输和部署方式绑死。**选择：** 只依赖 `TokenService`、Client/Server 接口，协议实现下沉模块。

**替代方案三：** Client 和 Server 同时运行以提高可用性。**问题：** 同一进程的角色和规则语义冲突。**选择：** 状态管理器显式停止旧角色，再启动新角色。

## 源码坐标索引

- `FlowRuleChecker#passClusterCheck` — `sentinel-core/src/main/java/com/alibaba/csp/sentinel/slots/block/flow/FlowRuleChecker.java:147`
- `FlowRuleChecker#pickClusterService` — `sentinel-core/src/main/java/com/alibaba/csp/sentinel/slots/block/flow/FlowRuleChecker.java:176`
- `ClusterStateManager#setToClient` — `sentinel-core/src/main/java/com/alibaba/csp/sentinel/cluster/ClusterStateManager.java:82`
- `ClusterStateManager#startClient` — `sentinel-core/src/main/java/com/alibaba/csp/sentinel/cluster/ClusterStateManager.java:94`
- `ClusterStateManager#setToServer` — `sentinel-core/src/main/java/com/alibaba/csp/sentinel/cluster/ClusterStateManager.java:136`
- `ClusterStateManager#startServer` — `sentinel-core/src/main/java/com/alibaba/csp/sentinel/cluster/ClusterStateManager.java:146`
- `ClusterStateManager#applyState` — `sentinel-core/src/main/java/com/alibaba/csp/sentinel/cluster/ClusterStateManager.java:265`
- `ClusterTokenClient#currentServer` — `sentinel-core/src/main/java/com/alibaba/csp/sentinel/cluster/client/ClusterTokenClient.java:34`
- `ClusterTokenClient#start` — `sentinel-core/src/main/java/com/alibaba/csp/sentinel/cluster/client/ClusterTokenClient.java:39`
- `ClusterTokenServer#start` — `sentinel-core/src/main/java/com/alibaba/csp/sentinel/cluster/server/ClusterTokenServer.java:27`
- `FlowRuleManager#register2Property` — `sentinel-core/src/main/java/com/alibaba/csp/sentinel/slots/block/flow/FlowRuleManager.java:93`
- `RuleManager#updateRules` — `sentinel-core/src/main/java/com/alibaba/csp/sentinel/slots/block/RuleManager.java:55`

## 高频面试题

**Q：为什么集群流控不能只复制本地规则？**

A：复制规则解决配置一致，不解决并发令牌竞争；多个节点仍会各自放行，必须有共享 Token 仲裁或等价的分布式计数。

**Q：Token Server 挂掉时一定拒绝吗？**

A：不一定。`FlowRule.ClusterConfig` 可以配置失败时回退本地，选择取决于业务对可用性和配额准确性的优先级。

**Q：为什么规则 Manager 还需要正则缓存？**

A：规则发布是低频操作，资源匹配是高频操作；把 Pattern 匹配结果缓存成资源索引，能把复杂匹配从请求路径移到更新路径。

## 边界与踩坑

- 集群令牌申请引入网络延迟和失败模式，不能把本地限流的低延迟假设直接套过来。
- Client/Server 状态切换是异步 Property 触发的，观察配置值不等于角色已成功启动。
- 本地回退会牺牲全局配额精度，必须结合监控和故障演练验证。

## 可迁移知识

分布式配额系统常把“配置一致”和“运行时仲裁”分开：前者可以异步传播，后者需要集中 Token、租约或原子计数。角色切换也应显式建模为状态机，而不是依靠多个布尔开关。

> **面试锚点**：集群流控的瓶颈在哪里？失败回退如何取舍？为什么 Client/Server 要通过接口和 SPI 解耦？

## Related

- [流控与规则匹配](/notes/source/java/rpc/sentinel/flow-control/)
- [整体架构](/notes/source/java/rpc/sentinel/architecture/)
- [集群流控概念笔记](/notes/backend/sentinel/cluster-flow-control/)
- [RPC 与微服务](/notes/source/java/rpc/)
