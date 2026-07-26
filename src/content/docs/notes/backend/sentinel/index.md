---
title: Sentinel 流量治理
description: Sentinel 核心概念、流控规则、熔断降级、热点参数限流、系统保护与工程实践。
category: Backend
tags:
  - Sentinel
  - Flow Control
  - Circuit Breaking
  - Microservices
sidebar:
  order: 54
---

Sentinel 是面向分布式、多语言异构化服务架构的流量治理组件，以流量为切入点，涵盖流量路由、流量控制、流量整形、熔断降级、系统自适应过载保护、热点流量防护等多个维度。

<!-- more -->

## 核心概念

### 资源（Resource）

资源是 Sentinel 的关键概念。它可以是：

- 应用程序提供的服务
- 应用调用的外部服务
- 甚至是一段代码

通过 Sentinel API 定义的代码即为资源，可被 Sentinel 保护。资源名可用方法签名、URL 或服务名称来标示。

### 规则（Rule）

围绕资源的实时状态设定的规则类型：

| 规则类型 | 作用 |
|----------|------|
| **流量控制规则** | 根据系统处理能力对请求进行调控 |
| **熔断降级规则** | 切断不稳定调用，防止局部问题引发全局雪崩 |
| **系统保护规则** | 从系统维度保护，防止过载 |
| **热点参数限流规则** | 对热点参数进行精细化限流 |
| **来源访问控制规则** | 根据调用来源进行黑白名单控制 |

所有规则支持**动态实时调整**。

## 工作原理

Sentinel 的工作机制分三步：

1. **资源定义与统计** — 对主流框架提供适配或显式 API 定义保护资源，提供设施对资源进行实时统计和调用链路分析
2. **规则驱动的流量控制** — 根据预设规则结合实时统计信息对流量进行控制，提供开放接口方便定义和改变规则
3. **实时监控** — 提供实时监控系统，快速了解系统状态

## 知识库结构

- [流控规则](/notes/backend/sentinel/flow-control/)：QPS 模式、线程数模式、流控效果（直连拒绝、Warm Up、排队等待）、关联模式
- [熔断降级](/notes/backend/sentinel/circuit-breaking/)：慢调用比例、异常比例、异常数、熔断状态机、半开探测
- [热点参数限流](/notes/backend/sentinel/hotspot-param-flow/)：热点参数识别、参数类型、阈值控制
- [系统保护](/notes/backend/sentinel/system-adaptive-protection/)：系统负载、入口 QPS、平均响应时间、CPU 使用率
- [集群流控](/notes/backend/sentinel/cluster-flow-control/)：集群模式、Token Client/Server、精确流量控制
- [工程实践](/notes/backend/sentinel/practice/)：注解方式、动态规则扩展、与 Spring Cloud 集成、Dashboard 使用

## Sentinel vs Hystrix

| 维度 | Sentinel | Hystrix |
|------|----------|---------|
| **隔离策略** | 并发线程数限制（信号量） | 线程池隔离 / 信号量隔离 |
| **熔断策略** | 慢调用比例、异常比例、异常数 | 异常比例 |
| **流控效果** | 直接拒绝、Warm Up、排队等待 | 快速失败、Fallback |
| **热点限流** | 支持 | 不支持 |
| **集群流控** | 支持 | 不支持 |
| **系统保护** | 支持（CPU、负载、入口 QPS） | 不支持 |
| **动态规则** | 原生支持（多种数据源） | 需要配合 Archaius |
| **实时监控** | 原生 Dashboard | 需要配合 Turbine |
| **扩展性** | 丰富的 SPI 扩展点 | 有限 |

> Hystrix 已停止维护（Netflix 2018 年进入维护模式），Sentinel 是目前 Java 生态中最活跃的流量治理组件。

## 版本演进

| 年份 | 里程碑 |
|------|--------|
| 2012 | 诞生于阿里巴巴，入口流量控制 |
| 2013-2017 | 阿里内部全覆盖，积累大量生产实践（双 11 核心保障） |
| 2018 | 开源 |
| 2019 | C++ 版本、Envoy 集群流量控制（Service Mesh） |
| 2020 | Go 版本，云原生方向 |
| 2021 | Rust 版本、Envoy WASM extension、eBPF extension 探索 |
| 2022 | 品牌升级为流量治理，OpenSergo 标准化 |

## Related

- [Seata 分布式事务](/notes/backend/seata/)：AT / TCC / Saga / XA 四种模式
- [缓存穿透、击穿、雪崩与 Hotkey 实战](/notes/backend/cache-penetration-breakdown-avalanche/)：缓存三大问题与热点探测
- [Java 微服务架构治理实践](/notes/backend/java-microservice-architecture-governance/)：服务边界与一致性
