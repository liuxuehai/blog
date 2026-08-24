---
title: 面试专题
description: Spring Cloud Alibaba 源码级面试题：自动装配、Nacos、Sentinel 与 RocketMQ 适配。
category: Backend
tags: [Source Reading, Spring Cloud Alibaba, Interview]
order: 89
updatedDate: 2026-08-24
difficulty: advanced
status: stable
lastReviewed: 2026-08-24
draft: false
sidebar:
  order: 89
---

回答这套源码时，先说清 Spring 负责生命周期和平台契约，第三方客户端负责协议与核心算法。

<!-- more -->

## 先给答案：先说适配链，再说底层一致性

这套组件的共同结构是“自动配置发现客户端 -> 属性和条件决定实例 -> 适配为 Spring 标准接口 -> 生命周期回调驱动运行”。Nacos、Sentinel 和 RocketMQ 的差异不在装配外壳，而在配置、发现、保护和消息各自的协议状态机。

高难追问通常落在语义边界：bootstrap 配置与运行期刷新是否一致，服务发现失败时缓存是否可接受，Sentinel 规则何时生效，消息发送成功与业务完成是否等价。Spring 负责接线，不会自动消除陈旧数据、重试和幂等问题。

## 高频题

### Nacos 配置为什么接入 Config Data

**30 秒版**：Resolver 把 `nacos:` 解析成资源，Loader 调用 ConfigService 生成 `ConfigData`，从而复用 profile、optional 和属性优先级。

**源码加分**：`NacosConfigDataLocationResolver:121-163`、`NacosConfigDataLoader:75-108`。

### Nacos 发现失败为什么还能返回实例

成功查询会写入 `ServiceCache`，失败时如果开启 failure tolerance，`NacosDiscoveryClient:60-72` 返回缓存拓扑，牺牲短时新鲜度换可用性。

### `DiscoveryClient` 和 `ServiceRegistry` 的区别

前者是消费侧查询实例，后者是提供侧注册和注销当前应用。源码分别为 `NacosDiscoveryClient:36`、`NacosServiceRegistry:42`。

### Sentinel starter 做了哪些事情

它装配 Web 适配、规则数据源、转换器和 CircuitBreaker 工厂，不实现 Sentinel 核心统计算法。入口是 `SentinelWebAutoConfiguration:50`、`SentinelDataSourceHandler:51`、`SentinelCircuitBreakerFactory:33`。

### RocketMQ Binder 为什么不是普通 Producer 封装

Binder 还负责 destination provision、consumer endpoint、错误通道和 Stream 生命周期。`RocketMQMessageChannelBinder:61-74` 与 `RocketMQProducerMessageHandler:166-202` 分工明显。

### OneWay、Sync、Async、Transaction 怎么选

OneWay 不等待结果；Sync 直接得到 `SendResult`；Async 通过 callback；Transaction 交给 RocketMQ 事务消息机制。分支见 `RocketMQProducerMessageHandler:181-247`。

## 高难追问

### 为什么 Nacos Config Manager 有静态单例又注册成 Bean

静态 manager 服务于 Config Data bootstrap 阶段，Spring Bean 服务于上下文和刷新器注入。`NacosConfigManager:52-89` 保证两阶段取得同一个 ConfigService。

### 为什么 Sentinel 数据源使用 `SmartInitializingSingleton`

规则源可能依赖 converter 和其他 Bean，延迟到 `afterSingletonsInstantiated:78` 可避免启动顺序隐式依赖。

### 配置加载和动态刷新是同一条链吗

不是。初次加载由 Resolver/Loader 完成；变化监听由 `NacosContextRefresher` 完成，装配见 `NacosConfigAutoConfiguration:70-75`。

### RocketMQ 入站失败如何避免静默丢消息

适配器支持恢复回调，出错可发送到 error channel，提示见 `RocketMQInboundChannelAdapter:82-87`。重试和死信仍取决于 consumer 与 Stream 配置。

## 排障路径

| 现象 | 优先检查 |
| --- | --- |
| Nacos 配置未生效 | `spring.config.import`、dataId/group、profile、optional |
| 服务发现为空 | 命名空间、group、failure tolerance 缓存 |
| Sentinel 不拦截 | Web 类型、条件注解、handler/filter Bean |
| RocketMQ 无消息 | destination/topic、consumer group、Binder properties |
| 消息失败无告警 | failure channel、recoverer、callback Bean |

## 反向问面试官

- Nacos 配置是强依赖启动，还是允许 optional 降级？
- 注册中心故障时是否允许使用陈旧实例？最大多久？
- RocketMQ 消费失败是重试、死信还是业务补偿？

> **面试锚点**
> - Config Data 两阶段模型如何测试？
> - 发现缓存的可用性与一致性取舍是什么？
> - Binder 如何统一不同消息系统的生命周期？

## Related

- [整体架构](/notes/source/java/spring/spring-cloud-alibaba/architecture/)
- [Nacos 配置加载](/notes/source/java/spring/spring-cloud-alibaba/nacos-config/)
- [Nacos 服务发现与注册](/notes/source/java/spring/spring-cloud-alibaba/nacos-discovery/)
