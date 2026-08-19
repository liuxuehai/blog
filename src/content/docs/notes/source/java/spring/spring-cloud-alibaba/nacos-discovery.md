---
title: Nacos 服务发现与注册
description: DiscoveryClient、ServiceRegistry、服务缓存与失败容忍的源码链路。
category: Backend
tags: [Source Reading, Spring Cloud Alibaba, Nacos, Service Discovery]
order: 83
updatedDate: 2026-08-19
difficulty: advanced
status: stable
lastReviewed: 2026-08-19
draft: false
sidebar:
  order: 83
---

Nacos 发现适配覆盖两条方向：客户端查询实例，以及应用启动后向 Nacos 注册自己。

<!-- more -->

## 先给答案：服务发现同时维护“我是谁”和“别人在哪里”两条链

注册链负责实例启动、元数据上报、心跳和注销；查询链负责从本地缓存或 Nacos 获取实例列表，再交给负载均衡选择目标。两条链的故障语义不同：注册失败影响可见性，查询失败可能触发缓存降级。

本地缓存提高可用性，却可能返回过期实例；心跳和健康检查也不能保证业务一定可用。排查调用失败时要区分服务不存在、实例列表陈旧、实例已摘除但缓存未更新，以及真正的网络或业务错误。


## 两条链路

```text
查询: LoadBalancer -> DiscoveryClient -> NacosServiceDiscovery -> Naming
注册: WebServerReady -> AutoServiceRegistration -> NacosServiceRegistry
                         \-> ServiceCache fallback
```

## 查询实现

- `NacosDiscoveryClient:36` 实现 `DiscoveryClient`。
- `getInstances:60-72` 成功时写入 `ServiceCache`，失败时按 failure tolerance 返回缓存。
- 服务列表查询位于 `NacosDiscoveryClient:81-87`，同样支持缓存降级。
- `ServiceCache:30-64` 保存 serviceId 和实例列表，是进程级缓存。
- 响应式实现 `NacosReactiveDiscoveryClient:59-77` 用 Flux 包装同一语义。
- `NacosLoadBalancerClientConfiguration:58-118` 将发现接到 `ServiceInstanceListSupplier`。

## 注册实现

- `NacosServiceRegistry:42` 实现 `ServiceRegistry<Registration>`。
- `register:61-95` 把 `NacosRegistration` 转成 NamingService 注册请求。
- `deregister:97-119` 在停机或注销时移除实例。
- `NacosAutoServiceRegistration:72-80` 接入 Cloud 注册生命周期。
- `NacosServiceRegistry:147-150` 支持配置变化后的注销再注册。

## 为什么保留缓存降级

**替代方案**：每次发现都强依赖 Nacos，异常直接向上抛出。
**为什么不行**：注册中心故障会把已有实例视为全部不可用，造成二次故障。
**证据**：`NacosDiscoveryClient#getInstances:60-72` 在 failure tolerance 打开时返回 `ServiceCache`。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| 缓存过期实例 | 请求打到已下线节点 | 容错缓存牺牲新鲜度 | 配合超时、健康检查和故障窗口 |
| 注册端口错误 | 实例存在但请求失败 | 管理端口与业务端口混淆 | 检查 `NacosRegistration` 最终端口 |
| 固定 URL | 不触发发现 | LoadBalancer 只处理服务名 | 不同时配置固定 URL 和服务名路由 |

## 可迁移知识

服务发现缓存是“过期可用”策略的实例，适合拓扑等读多写少数据，但必须明确最大陈旧时间。

> **面试锚点**
> - `DiscoveryClient` 和 `ServiceRegistry` 分别解决什么问题？
> - Nacos 发现失败时为什么可以返回缓存？
> - 注册发生在 WebServerReady 前还是后？

## Related

- [整体架构](/notes/source/java/spring/spring-cloud-alibaba/architecture/)
- [Spring Cloud OpenFeign 负载均衡](/notes/source/java/spring/spring-cloud-openfeign/load-balancing-retry/)
- [消息队列专题](/notes/backend/mq/)
