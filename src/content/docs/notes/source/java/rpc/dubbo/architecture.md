---
title: 整体架构
description: Dubbo 从配置、注册发现到 Cluster、Protocol、Remoting 的分层和两条主流程。
category: Backend
tags: [Source Reading, Dubbo, Architecture]
order: 21
updatedDate: 2026-08-16
difficulty: advanced
status: stable
lastReviewed: 2026-08-16
draft: false
sidebar: { order: 21 }
---

Dubbo 的核心不是单一协议，而是一条以 `Invoker` 为中心的调用抽象。服务提供者和消费者最终都被转换为 Invoker，再由 Cluster、Filter、Protocol 和 Remoting 组合出不同运行模式。

<!-- more -->

## 分层

```text
配置 / Spring
  ServiceConfig, ReferenceConfig
          │
注册发现 ──┼── URL / Registry / ServiceDiscovery
          ▼
Cluster: Directory -> Router -> LoadBalance -> Fault Tolerance
          ▼
Invoker / Filter Chain
          ▼
Protocol: Dubbo / Triple / Injvm
          ▼
Exchange -> Transport -> Codec -> Socket / HTTP / HTTP2
```

| 层 | 核心抽象 | 解决的问题 |
| --- | --- | --- |
| 配置 | `ServiceConfig`、`ReferenceConfig` | 将声明式配置转成运行时对象 |
| 发现 | `Registry`、`Directory` | 地址订阅、刷新和可用节点视图 |
| 集群 | `ClusterInvoker` | 路由、负载均衡、重试、广播和失败策略 |
| RPC | `Invoker`、`Protocol` | 统一本地/远程调用与导出/引用 |
| 远程 | `ExchangeHandler`、`Codec` | 请求响应、序列化和连接管理 |

## 核心抽象

`Invoker` 把“调用谁、如何调用、调用结果是什么”统一起来。`ServiceConfig#doExportUrl` 在 `dubbo-config/dubbo-config-api/src/main/java/org/apache/dubbo/config/ServiceConfig.java:978` 创建并导出 Invoker；`ReferenceConfig#createProxy` 在 `dubbo-config/dubbo-config-api/src/main/java/org/apache/dubbo/config/ReferenceConfig.java:490` 通过 Protocol/Cluster 构造消费者侧代理。

`Directory` 是动态 Invoker 视图，`AbstractDirectory#list` 位于 `dubbo-cluster/src/main/java/org/apache/dubbo/rpc/cluster/directory/AbstractDirectory.java:204`，会在快照上执行路由，避免通知线程修改正在使用的列表。`AbstractClusterInvoker#invoke` 位于 `dubbo-cluster/src/main/java/org/apache/dubbo/rpc/cluster/support/AbstractClusterInvoker.java:345`，把列表交给具体容错策略。

## 主流程一：服务启动

```text
ServiceConfig#export
  -> doExport -> doExportUrls
  -> URL + Invoker
  -> Protocol#export
  -> Exchangers.bind
  -> 注册服务地址和元数据

ReferenceConfig#get
  -> init -> createProxy
  -> Registry 订阅地址
  -> Protocol#refer -> Cluster#join
  -> 生成接口代理
```

提供者侧 `ServiceConfig#export` 在 `ServiceConfig.java:325` 进入初始化和延迟导出；协议导出在 `ServiceConfig.java:992` 调用 `protocolSPI.export(invoker)`。`DubboProtocol#export` 位于 `dubbo-rpc/dubbo-rpc-dubbo/src/main/java/org/apache/dubbo/rpc/protocol/dubbo/DubboProtocol.java:346`，服务端绑定在 `DubboProtocol.java:426` 通过 `Exchangers.bind` 完成。

消费者侧 `ReferenceConfig#get` 位于 `ReferenceConfig.java:230`，初始化在 `ReferenceConfig.java:328`，真正生成代理在 `ReferenceConfig.java:383`。单地址引用通过 `ReferenceConfig.java:672` 调用 `protocolSPI.refer`，多地址则在 `ReferenceConfig.java:686` 建立多个 Invoker 后交给 Cluster。

## 主流程二：一次请求

```text
业务代理
  -> ClusterInvoker#invoke
  -> Directory#list
  -> RouterChain#route
  -> LoadBalance#select
  -> Invoker#invoke
  -> ExchangeClient#request
  -> DubboCodec encode/decode
  -> 服务端 ExchangeHandler#reply
  -> Result / Future
```

`AbstractClusterInvoker#invoke` 在 `AbstractClusterInvoker.java:355` 获取地址，在 `:360` 初始化负载均衡，在 `:366` 进入具体策略。服务端 `DubboProtocol` 的 `requestHandler` 在 `DubboProtocol.java:115` 创建，`reply` 入口位于 `DubboProtocol.java:118`。请求响应包装由 `HeaderExchangeHandler#received` 在 `dubbo-remoting/dubbo-remoting-api/src/main/java/org/apache/dubbo/remoting/exchange/support/header/HeaderExchangeHandler.java:196` 分派。

## 扩展点全景

| 扩展点 | 触发时机 | 典型用途 |
| --- | --- | --- |
| `Protocol` | 导出/引用服务 | 增加协议或协议包装 |
| `Cluster` | 多 Invoker 聚合 | Failover、Failfast、Broadcast |
| `Router` | 选择前过滤 | 标签、区域、条件路由 |
| `LoadBalance` | 候选节点选择 | Random、RoundRobin、ConsistentHash |
| `Filter` | 调用前后 | 鉴权、指标、上下文传播 |
| `Serialization` / `Codec2` | 字节转换 | 替换序列化和线协议 |

## 源码坐标索引

- `ExtensionLoader#getExtensionLoader` — `dubbo-common/src/main/java/org/apache/dubbo/common/extension/ExtensionLoader.java:242`
- `ExtensionDirector#getExtensionLoader` — `dubbo-common/src/main/java/org/apache/dubbo/common/extension/ExtensionDirector.java:67`
- `ServiceConfig#export` — `dubbo-config/dubbo-config-api/src/main/java/org/apache/dubbo/config/ServiceConfig.java:325`
- `ServiceConfig#doExportUrl` — `dubbo-config/dubbo-config-api/src/main/java/org/apache/dubbo/config/ServiceConfig.java:978`
- `ReferenceConfig#get` — `dubbo-config/dubbo-config-api/src/main/java/org/apache/dubbo/config/ReferenceConfig.java:230`
- `AbstractDirectory#list` — `dubbo-cluster/src/main/java/org/apache/dubbo/rpc/cluster/directory/AbstractDirectory.java:204`
- `AbstractClusterInvoker#invoke` — `dubbo-cluster/src/main/java/org/apache/dubbo/rpc/cluster/support/AbstractClusterInvoker.java:345`
- `DubboProtocol#export` — `dubbo-rpc/dubbo-rpc-dubbo/src/main/java/org/apache/dubbo/rpc/protocol/dubbo/DubboProtocol.java:346`
- `HeaderExchangeHandler#received` — `dubbo-remoting/dubbo-remoting-api/src/main/java/org/apache/dubbo/remoting/exchange/support/header/HeaderExchangeHandler.java:196`

## 关键取舍

### 为什么以 Invoker 为统一边界

**替代方案**：让代理直接依赖具体客户端、连接池和协议实现。**为什么不行**：本地调用、远程调用和集群调用会形成多套分支，路由、过滤器和容错难以复用。**证据**：`ClusterInvoker` 直接持有 `Directory`，而 `Protocol#export/refer` 都以 Invoker 为输入输出，边界集中在 `dubbo-rpc/dubbo-rpc-api/src/main/java/org/apache/dubbo/rpc/Invoker.java` 及各协议实现。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| 注册中心暂时无地址 | 引用失败或空列表 | Directory 没有可调用 Invoker | 配置直连、检查订阅和启动顺序 |
| 重试非幂等操作 | 一次业务被执行多次 | Failover 只知道异常，不知道业务语义 | 写操作关闭重试或设计幂等键 |
| 协议与序列化不兼容 | 解码异常 | URL 参数或协议版本不匹配 | 固化协议、序列化和超时配置 |

## 可迁移知识

“配置对象 -> 中间抽象 -> 策略链 -> 传输适配”的分层适合支付、消息发送和数据库路由：上层只操作稳定接口，下层通过策略和 SPI 替换实现。

> **面试锚点**
> - Dubbo 为什么以 Invoker 作为核心抽象？
> - Directory、Router、LoadBalance、ClusterInvoker 的职责如何区分？
> - 一次 RPC 调用从代理到服务端经历哪些层？

## Related

- [SPI 扩展机制](/notes/source/java/rpc/dubbo/spi-extension/)
- [集群容错与负载均衡](/notes/source/java/rpc/dubbo/cluster-fault-tolerance/)
- [Spring Cloud OpenFeign](/notes/source/java/spring/spring-cloud-openfeign/)
