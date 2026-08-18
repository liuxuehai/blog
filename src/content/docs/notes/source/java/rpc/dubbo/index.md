---
title: Dubbo
description: Dubbo 3.3 源码解析：SPI、服务导出与引用、集群容错、协议编解码和服务治理。
category: Backend
tags:
  - Source Reading
  - Dubbo
  - RPC
  - Microservices
order: 2
updatedDate: 2026-08-16
difficulty: advanced
status: stable
lastReviewed: 2026-08-16
draft: false
sidebar:
  order: 2
---

Dubbo 把一次远程调用拆成可替换的扩展点：配置层组装服务，注册中心提供地址，Cluster 负责治理与容错，Protocol/Remoting 负责传输。阅读重点不是记住某个协议，而是看清“扩展加载 + Invoker 链 + URL 元数据”如何把这些层串起来。

<!-- more -->

## 版本快照

| 项 | 值 |
| --- | --- |
| 仓库 | `apache/dubbo` |
| 本地路径 | `E:\source\java\rpc\dubbo` |
| 分支 | `3.3` |
| Commit | `3a3043227f5571d25eb2889de5bca22f2914843b`（2026-07-28） |
| 最近 tag | `dubbo-3.3.6` |

> 本册所有 `文件:行号` 坐标均基于上述 commit，上游演进后行号可能漂移。

## 它解决什么问题

- 将本地接口调用映射为可治理的远程调用，并允许协议、序列化、注册中心和负载均衡独立替换。
- 在服务地址变化、节点失败和请求重试时，把业务代码与基础设施故障隔离。
- 让同一套调用模型覆盖传统 Dubbo 二进制协议、Triple/HTTP、Injvm 等不同传输。

## 模块地图

| 模块 | 职责 | 关键抽象 |
| --- | --- | --- |
| `dubbo-common` | URL、SPI、线程模型与基础工具 | `ExtensionLoader`、`URL` |
| `dubbo-config` | Spring/Java 配置转运行时对象 | `ServiceConfig`、`ReferenceConfig` |
| `dubbo-registry` | 注册、订阅和地址变更 | `Registry`、`ServiceDiscovery` |
| `dubbo-cluster` | 目录、路由、负载均衡、容错 | `Directory`、`ClusterInvoker` |
| `dubbo-rpc` | Invoker、Protocol、代理与协议实现 | `Invoker`、`Protocol` |
| `dubbo-remoting` | Transport、Exchange、Codec | `Exchangers`、`ExchangeHandler` |

## 读码入口顺序

1. `ExtensionLoader#getExtension`：先理解 Dubbo 的 SPI、包装器、依赖注入和自适应扩展。
2. `ServiceConfig#export` 与 `ReferenceConfig#get`：观察配置如何变成 Exporter/Invoker。
3. `AbstractClusterInvoker#invoke`：从 Directory 列表进入路由、选择和重试。
4. `DubboProtocol#export/refer`：进入 Exchange、客户端连接和请求处理。
5. `DubboCodec` 与 `HeaderExchangeHandler`：追踪字节、请求、响应和 Future 的转换。

## 本册目录

- [整体架构](/notes/source/java/rpc/dubbo/architecture/)：分层、启动和请求两条主流程
- [SPI 扩展机制](/notes/source/java/rpc/dubbo/spi-extension/)：目录加载、包装器、自适应和注入
- [服务导出与引用](/notes/source/java/rpc/dubbo/service-export-reference/)：配置到 Exporter/代理的完整链路
- [集群容错与负载均衡](/notes/source/java/rpc/dubbo/cluster-fault-tolerance/)：Directory、Router、LoadBalance、Failover
- [协议与编解码](/notes/source/java/rpc/dubbo/protocol-codec/)：Exchange、Dubbo 协议头和延迟解码
- [服务治理与扩展边界](/notes/source/java/rpc/dubbo/governance/)：URL 元数据、过滤器、注册订阅和生命周期
- [面试专题](/notes/source/java/rpc/dubbo/interview/)：高频题、高难追问与场景题

## 横向对照

| 对象 | 对照点 |
| --- | --- |
| Spring `BeanFactory` | 都用扩展点和后置处理，但 Dubbo 的核心产物是 Invoker 链 |
| Spring Cloud OpenFeign | 都把接口调用代理成远程请求，Dubbo 的 Cluster/Registry 治理层更内聚 |
| Netty | Dubbo Remoting 借助传输抽象承载请求，Netty 只是一种底层实现 |
| RocketMQ | 都用 URL/元数据和可插拔组件隔离运行时差异，但 Dubbo 的一致性目标是调用治理 |

## Related

- [RPC 与微服务](/notes/source/java/rpc/)
- [Spring Cloud OpenFeign](/notes/source/java/spring/spring-cloud-openfeign/)
- [Netty](/notes/source/java/base/netty/)
