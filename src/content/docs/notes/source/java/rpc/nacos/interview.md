---
title: 面试专题
description: Nacos 的 Distro、JRaft、配置长轮询、服务发现与健康检查源码级面试题。
category: Backend
tags: [Source Reading, Nacos, Interview]
order: 37
updatedDate: 2026-08-16
difficulty: advanced
status: stable
lastReviewed: 2026-08-16
draft: false
sidebar: { order: 37 }
---

Nacos 面试的核心不是背“AP/CP”标签，而是能根据数据语义说明成员发现、协议选择、缓存更新和故障收敛如何串成闭环。

<!-- more -->

## 高频题

### Nacos 为什么同时使用 Distro 和 JRaft？

**30 秒版**：临时实例是可重建、追求高可用和最终收敛的状态，适合 Distro；持久配置和持久实例需要顺序提交与多数派确认，适合 JRaft。**展开**：Distro 的同步入口在 `DistroProtocol#sync`，CP 写入入口在 `JRaftProtocol#writeAsync`。**常见错答**：把 Distro 说成 Raft 的简化实现，忽略两者服务的数据语义不同。

### Distro 如何完成节点间同步？

**30 秒版**：节点根据成员列表和资源键确定责任节点，先做按资源同步，再通过校验和或全量数据修复异常。**展开**：`DistroClientDataProcessor#processData` 处理数据，`processVerifyData` 处理校验请求；成员变化由 `ServerMemberManager` 驱动重新收敛。

### 配置长轮询为什么不会一直占用业务线程？

**30 秒版**：MD5 未变化时，服务端把请求转为异步上下文并交给长轮询执行器；事件到达或超时后再恢复响应。**展开**：`LongPollingService#addLongPollingClient` 完成挂起，`ConfigExecutor#executeLongPolling` 提交任务，`NotifyCenter` 唤醒匹配的监听请求。

### 配置变更通知丢失后，客户端如何恢复？

通知不是唯一真相。客户端保留 `CacheData` 和 MD5，重连或下一次监听时会重新比较；服务端也会在长轮询超时后返回，客户端再发起下一轮请求。因此事件通知负责降低延迟，快照比较负责补偿丢失。

### 临时实例和持久实例有什么本质区别？

临时实例的有效性依赖客户端连接、心跳和租约，客户端消失后服务端可以自动清理；持久实例不依赖单个客户端连接，状态需要被可靠保存和管理。源码上可沿 `InstanceOperatorClientImpl#registerInstance` 进入不同的客户端操作服务。

### 为什么服务订阅要维护本地 `ServiceInfo` 快照？

调用方读取服务列表时不应被注册中心网络抖动阻塞。本地快照让读路径低延迟，远端订阅和推送只负责更新快照；代价是必须处理版本、过期、重连和回调顺序。`NacosNamingService#subscribe` 与客户端代理、`ServiceInfo` 更新链路共同完成这一模型。

## 高难追问

### 应用层超时后，JRaft 写入一定失败吗？

不一定。应用层 Future 超时只表示调用方停止等待，日志可能已经复制并提交，或者正在提交。重试前要考虑请求幂等性，必要时通过业务唯一键查询最终状态。

### 为什么要拆分多个 Raft Group？

多个 Group 能把不同领域的日志顺序、Leader 和故障影响隔离开，避免配置写入拖慢所有持久状态。对应实现可看 `JRaftProtocol#addRequestProcessors` 和 `JRaftServer#start`。代价是运维、成员管理和跨 Group 事务更复杂。

### 健康检查为什么不能只依赖客户端心跳？

心跳只能证明客户端仍在发送请求，不能证明实例端口、网络路径或业务探活接口可用。服务端还需要 `HealthCheckReactor#scheduleCheck` 等主动检查，并把结果纳入实例健康状态。

## 场景题

### 集群扩容后部分服务发现结果不一致，如何排查？

先确认 `ServerMemberManager` 的成员列表是否在所有节点收敛，再看 Distro 初始化状态、责任节点映射和校验任务；随后检查临时实例是否重新注册、客户端订阅是否重连。不要只看某一节点的内存列表，因为它可能尚未完成同步。

### 配置发布后客户端迟迟不生效，如何定位？

沿着 `MD5Util#compareMd5`、`LongPollingService#addLongPollingClient`、`ConfigExecutor#executeLongPolling` 和 `ClientWorker$ConfigRpcTransportClient#notifyListenConfig` 检查服务端 MD5、异步请求、事件匹配和客户端缓存更新。

### 临时实例频繁上下线，应该先调大超时时间吗？

不应直接调参。先区分客户端重启、心跳线程阻塞、网络丢包、服务端主动探活失败和保护阈值触发，确认原因后再调整参数，并保留重连和重新注册机制。

## 源码坐标总览

- `ServerMemberManager#init` — `core/src/main/java/com/alibaba/nacos/core/cluster/ServerMemberManager.java:153`
- `DistroProtocol#sync` — `core/src/main/java/com/alibaba/nacos/core/distributed/distro/DistroProtocol.java:106`
- `DistroClientDataProcessor#processData` — `naming/src/main/java/com/alibaba/nacos/naming/consistency/ephemeral/distro/v2/DistroClientDataProcessor.java:149`
- `JRaftProtocol#writeAsync` — `core/src/main/java/com/alibaba/nacos/core/distributed/raft/JRaftProtocol.java:188`
- `JRaftProtocol#addRequestProcessors` — `core/src/main/java/com/alibaba/nacos/core/distributed/raft/JRaftProtocol.java:164`
- `JRaftServer#start` — `core/src/main/java/com/alibaba/nacos/core/distributed/raft/JRaftServer.java:196`
- `LongPollingService#addLongPollingClient` — `config/src/main/java/com/alibaba/nacos/config/server/service/LongPollingService.java:177`
- `ConfigExecutor#executeLongPolling` — `config/src/main/java/com/alibaba/nacos/config/server/utils/ConfigExecutor.java:130`
- `MD5Util#compareMd5` — `config/src/main/java/com/alibaba/nacos/config/server/utils/MD5Util.java:52`
- `ClientWorker$ConfigRpcTransportClient#notifyListenConfig` — `client/src/main/java/com/alibaba/nacos/client/config/impl/ClientWorker.java:926`
- `NacosNamingService#subscribe` — `client/src/main/java/com/alibaba/nacos/client/naming/NacosNamingService.java:498`
- `InstanceOperatorClientImpl#registerInstance` — `naming/src/main/java/com/alibaba/nacos/naming/core/InstanceOperatorClientImpl.java:102`
- `HealthCheckReactor#scheduleCheck` — `naming/src/main/java/com/alibaba/nacos/naming/healthcheck/HealthCheckReactor.java:44`

## 反向问面试官

- 临时实例、持久实例和配置数据分别采用什么一致性与恢复策略？
- 生产环境是否区分配置发布成功、客户端收到变更和业务监听器生效三个指标？
- 集群扩缩容、网络分区和客户端大规模重连时，有哪些限流与保护措施？

## Related

- [整体架构](/notes/source/java/rpc/nacos/architecture/)
- [Distro 与 AP 同步](/notes/source/java/rpc/nacos/distro-ap/)
- [配置长轮询与推送](/notes/source/java/rpc/nacos/config-long-polling/)
- [注册发现与客户端订阅](/notes/source/java/rpc/nacos/naming-discovery/)
- [健康检查与故障收敛](/notes/source/java/rpc/nacos/health-check/)
