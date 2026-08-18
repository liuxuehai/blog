---
title: 注册发现与客户端订阅
description: Nacos Naming 从客户端注册、服务端实例操作、订阅请求到本地服务快照的完整链路。
category: Backend
tags: [Source Reading, Nacos, Naming, Discovery]
order: 35
updatedDate: 2026-08-16
difficulty: advanced
status: stable
lastReviewed: 2026-08-16
draft: false
sidebar: { order: 35 }
---

Naming 的核心状态是服务下的实例集合。客户端 API 负责把实例和订阅意图送入远程代理，服务端负责写入服务模型、同步临时状态，并把变更推回订阅者。

<!-- more -->

## 注册与订阅

```text
NacosNamingService
  ├─ registerInstance -> NamingClientProxyDelegate
  │                         -> server InstanceOperator
  └─ subscribe       -> proxy -> ServiceInfo cache
                              ▲
              push / poll ----┘
  heartbeat -> handleBeat -> health / expiration
```

## 实现拆解

`NacosNamingService#registerInstance` 统一参数后交给代理；服务端 `InstanceOperatorClientImpl#registerInstance` 再根据临时或持久语义选择操作服务。临时实例依赖心跳维持租约，持久实例则进入 CP 相关路径。

订阅方法通过 `NamingClientProxyDelegate#subscribe` 进入 gRPC 或 HTTP 代理。客户端缓存 `ServiceInfo`，收到变更后更新实例列表并通知 `EventListener`。查询和订阅可以同时存在，前者是一次性快照，后者建立持续状态关系。

## 为什么注册和订阅要分成两个状态机

**替代方案**：注册接口成功后自动把调用方加入所有订阅关系。
**为什么不行**：生产者和消费者角色不同，一个进程可能只注册不订阅，或订阅多个服务；隐式绑定会造成连接、权限和生命周期耦合。
**证据**：`NacosNamingService` 分别暴露 `registerInstance`、`getAllInstances` 和 `subscribe`，代理层也分别实现注册与订阅。

## 源码坐标索引

- `NacosNamingService#registerInstance` — `client/src/main/java/com/alibaba/nacos/client/naming/NacosNamingService.java:145`
- `NacosNamingService#getAllInstances` — `client/src/main/java/com/alibaba/nacos/client/naming/NacosNamingService.java:257`
- `NacosNamingService#selectInstances` — `client/src/main/java/com/alibaba/nacos/client/naming/NacosNamingService.java:313`
- `NacosNamingService#selectOneHealthyInstance` — `client/src/main/java/com/alibaba/nacos/client/naming/NacosNamingService.java:457`
- `NacosNamingService#subscribe` — `client/src/main/java/com/alibaba/nacos/client/naming/NacosNamingService.java:498`
- `NacosNamingService#unsubscribe` — `client/src/main/java/com/alibaba/nacos/client/naming/NacosNamingService.java:550`
- `NamingClientProxyDelegate#subscribe` — `client/src/main/java/com/alibaba/nacos/client/naming/remote/NamingClientProxyDelegate.java:182`
- `NamingGrpcClientProxy#subscribe` — `client/src/main/java/com/alibaba/nacos/client/naming/remote/gprc/NamingGrpcClientProxy.java:419`
- `InstanceOperatorClientImpl#registerInstance` — `naming/src/main/java/com/alibaba/nacos/naming/core/InstanceOperatorClientImpl.java:102`
- `InstanceOperatorClientImpl#handleBeat` — `naming/src/main/java/com/alibaba/nacos/naming/core/InstanceOperatorClientImpl.java:246`
- `EphemeralClientOperationServiceImpl#registerInstance` — `naming/src/main/java/com/alibaba/nacos/naming/core/v2/service/impl/EphemeralClientOperationServiceImpl.java:56`
- `PersistentClientOperationServiceImpl#registerInstance` — `naming/src/main/java/com/alibaba/nacos/naming/core/v2/service/impl/PersistentClientOperationServiceImpl.java:107`

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| 客户端重启 | 临时实例消失后重新出现 | 临时实例依赖连接和心跳 | 将注册放入启动和重连流程 |
| 订阅回调慢 | 本地服务列表更新滞后 | 回调线程被业务逻辑占用 | 回调只替换快照，业务异步处理 |
| HTTP/gRPC 能力差异 | 某些推送行为不同 | 代理协议实现不完全同构 | 以客户端能力协商和重连逻辑兜底 |

## 可迁移知识

服务发现客户端最好把“远程状态”和“本地可读快照”分开。调用方读快照不必等待网络，但必须有版本、过期和重连策略，避免把缓存当作永久真相。

> **面试锚点**
> - 临时实例和持久实例的核心差别是什么？
> - 注册成功后客户端还需要做什么？
> - 服务订阅如何避免每次调用都访问注册中心？

## Related

- [Distro 与 AP 同步](/notes/source/java/rpc/nacos/distro-ap/)
- [健康检查与故障收敛](/notes/source/java/rpc/nacos/health-check/)
- [Dubbo 服务治理](/notes/source/java/rpc/dubbo/governance/)
