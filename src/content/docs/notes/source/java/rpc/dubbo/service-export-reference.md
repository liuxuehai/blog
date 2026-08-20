---
title: 服务导出与引用
description: ServiceConfig 和 ReferenceConfig 如何把配置转换为服务端 Exporter 与消费者代理。
category: Backend
tags: [Source Reading, Dubbo, Service Export, Proxy]
order: 23
updatedDate: 2026-08-20
difficulty: advanced
status: stable
lastReviewed: 2026-08-20
draft: false
sidebar: { order: 23 }
---

服务导出与引用是 Dubbo 的两条对称链路：提供者把实现对象包装为 Invoker 并交给 Protocol 暴露，消费者把地址转换为 Invoker，再由 ProxyFactory 暴露为接口代理。

<!-- more -->

## 先给答案：导出与引用统一成 Invoker，调用链因此可复用

服务导出把本地实现包装成 Invoker，再交给 Protocol 暴露 Exporter 并注册地址；服务引用则从注册中心得到地址，创建远程 Invoker，经过 Cluster 组装成代理。代理只负责把接口方法转成 Invocation，真正的路由、负载均衡、过滤器、超时和重试发生在 Invoker 链中。

这个统一模型的好处是本地调用和远程调用可以共享治理能力，代价是启动和排障都要分清“配置对象、代理、ClusterInvoker、协议客户端、服务端 Invoker”这些层次。导出成功不等于远端已经可调用，引用拿到代理也不等于连接已经建立；地址注册、连接建立和首次请求可能是延迟发生的。

## 两条链路

```text
提供者                                    消费者
ServiceConfig#export                     ReferenceConfig#get
  -> init                                  -> init
  -> URL + Invoker                         -> Registry 订阅 URL
  -> Protocol#export                       -> Protocol#refer
  -> Exporter + server                     -> Cluster#join
                                           -> ProxyFactory#getProxy
```

## 服务导出

`ServiceConfig#export` 在 `dubbo-config/dubbo-config-api/src/main/java/org/apache/dubbo/config/ServiceConfig.java:325`，条件判断后在 `:346` 初始化，在 `:356` 或 `:358` 进入导出。`doExport` 位于 `:566`，`doExportUrls` 位于 `:582`，负责把一个服务拆成多个协议或注册中心 URL。

`doExportUrlsFor1Protocol` 位于 `ServiceConfig.java:628`，`exportLocal` 在 `:1000` 支持 Injvm，本地调用也走 Protocol/Invoker 抽象。真正的 `Exporter` 创建发生在 `doExportUrl` 的 `:992`，这使配置层不需要知道具体网络服务器如何启动。

## 服务引用

`ReferenceConfig#get(boolean)` 在 `dubbo-config/dubbo-config-api/src/main/java/org/apache/dubbo/config/ReferenceConfig.java:230`，`init` 在 `:328`，生成代理在 `:383`。`createProxy` 位于 `:490`，先整理引用参数，再按直连、注册中心或 Injvm 路径构造 Invoker。

单地址路径在 `ReferenceConfig.java:672` 调用 `protocolSPI.refer`；多地址路径在 `:686` 为每个 URL 创建 Invoker，再通过 Cluster 聚合。这样“一个服务多个提供者”不会泄漏到代理代码中。

## 为什么要先 Invoker 后 Proxy

**替代方案**：代理直接保存连接对象和地址列表。**为什么不行**：重试、路由、过滤器、指标和协议替换都会侵入代理生成器，提供者和消费者模型也无法对称。**证据**：`ReferenceConfig#createProxy` 先创建 `Invoker`，再交给代理工厂；`ServiceConfig#doExportUrl` 先调用 `protocolSPI.export(invoker)`，两侧都以 Invoker 作为稳定边界。

## 源码坐标索引

- `ServiceConfig#export` — `dubbo-config/dubbo-config-api/src/main/java/org/apache/dubbo/config/ServiceConfig.java:325`
- `ServiceConfig#init` — `dubbo-config/dubbo-config-api/src/main/java/org/apache/dubbo/config/ServiceConfig.java:312`
- `ServiceConfig#doExport` — `dubbo-config/dubbo-config-api/src/main/java/org/apache/dubbo/config/ServiceConfig.java:566`
- `ServiceConfig#doExportUrls` — `dubbo-config/dubbo-config-api/src/main/java/org/apache/dubbo/config/ServiceConfig.java:582`
- `ServiceConfig#doExportUrlsFor1Protocol` — `dubbo-config/dubbo-config-api/src/main/java/org/apache/dubbo/config/ServiceConfig.java:628`
- `ServiceConfig#doExportUrl` — `dubbo-config/dubbo-config-api/src/main/java/org/apache/dubbo/config/ServiceConfig.java:978`
- `ReferenceConfig#get` — `dubbo-config/dubbo-config-api/src/main/java/org/apache/dubbo/config/ReferenceConfig.java:230`
- `ReferenceConfig#init` — `dubbo-config/dubbo-config-api/src/main/java/org/apache/dubbo/config/ReferenceConfig.java:328`
- `ReferenceConfig#createProxy` — `dubbo-config/dubbo-config-api/src/main/java/org/apache/dubbo/config/ReferenceConfig.java:490`

## 生命周期与延迟

服务导出支持 `doDelayExport`，入口在 `ServiceConfig.java:391`，适合等待 Spring 容器或配置中心完成初始化。消费者的 `get` 只允许成功初始化一次，重复销毁或并发初始化时必须依赖配置对象的状态控制，否则容易出现重复订阅和重复连接。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| 同时配置多协议 | 暴露多个端口或多个 URL | 每个协议都会生成一条导出路径 | 明确端口复用策略和注册元数据 |
| 直连参数覆盖注册发现 | 请求没有走预期注册中心 | `url` 或 `references` 改变了引用分支 | 生产环境区分直连调试配置 |
| 重复 export/refer | 连接、线程或注册信息重复 | 生命周期没有统一管理 | 使用 Spring Bean 生命周期和 destroy |

## 可迁移知识

“领域对象 -> 统一执行器 -> 策略聚合 -> 外观代理”适合数据库代理、消息生产者和云服务 SDK：先将差异收敛到执行器，再生成面向用户的易用 API。

> **面试锚点**
> - ServiceConfig 导出服务的关键步骤是什么？
> - ReferenceConfig 为什么不直接创建连接，而是先创建 Invoker？
> - Dubbo 如何同时支持 Injvm 和远程协议？

## Related

- [SPI 扩展机制](/notes/source/java/rpc/dubbo/spi-extension/)
- [协议与编解码](/notes/source/java/rpc/dubbo/protocol-codec/)
- [Spring Boot 启动流程](/notes/source/java/spring/spring-boot/startup/)
