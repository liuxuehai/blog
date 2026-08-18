---
title: 整体架构
description: Tomcat 的分层、启动时序和请求时序：从 Catalina 到 Servlet。
category: Backend
tags: [Source Reading, Tomcat, Architecture]
order: 30
updatedDate: 2026-08-15
difficulty: advanced
status: stable
lastReviewed: 2026-08-15
draft: false
sidebar: { order: 30 }
---

Tomcat 启动时沿组件树向下传播，运行时沿 Connector、协议处理器和容器 Pipeline 流动。

<!-- more -->

```text
Bootstrap/Catalina -> Server -> Service -> Connector + Engine
                                      Engine -> Host -> Context -> Wrapper -> Servlet
```

```text
socket -> NioEndpoint -> Http11Processor -> CoyoteAdapter -> Mapper
       -> EngineValve -> HostValve -> ContextValve -> WrapperValve -> Servlet
```

## 启动主流程

`Catalina#start` 位于 `java/org/apache/catalina/startup/Catalina.java:868`；`LifecycleBase#init` 与 `start` 位于 `java/org/apache/catalina/util/LifecycleBase.java:121`、`:145`。Service 启动在 `StandardService.java:424`，Connector 初始化/启动在 `Connector.java:1255`、`:1300`。

## 请求主流程

`NioEndpoint#processKey` 位于 `java/org/apache/tomcat/util/net/NioEndpoint.java:1129`，`Http11Processor#service` 位于 `java/org/apache/coyote/http11/Http11Processor.java:254`，`CoyoteAdapter#service` 位于 `java/org/apache/catalina/connector/CoyoteAdapter.java:305`，`Mapper#map` 位于 `java/org/apache/catalina/mapper/Mapper.java:688`。之后由 `StandardEngineValve.java:54` 开始逐级进入容器。

## 设计取舍

**替代方案**：把协议解析、路由和 Servlet 调用放进一个请求处理器。
**为什么不行**：协议演进、虚拟主机、Web 应用生命周期和类加载隔离会互相污染。Tomcat 用 Coyote/Catalina Adapter、Mapper 和 Valve 分开承担边界。

## 边界与踩坑

| 风险 | 触发条件 | 诊断入口 |
| --- | --- | --- |
| 启动失败 | 生命周期子组件异常 | `LifecycleBase` 状态与根因日志 |
| 请求排队 | Endpoint 或 Servlet 阻塞 | 线程池、队列、慢请求 |
| 路由错误 | Host/Context/Wrapper 不匹配 | `Mapper` 与部署命名 |
| 热部署泄漏 | Webapp 类仍被外部引用 | `WebappClassLoaderBase` 停止清理 |

> **面试锚点**
> - 画出 Tomcat 从 socket 到 Servlet 的调用链。
> - Connector 与 Container 为什么分离？
> - Mapper 和 Valve 的职责是什么？

## Related

- [生命周期与启动](/notes/source/java/base/tomcat/lifecycle-startup/)
- [HTTP 请求处理链](/notes/source/java/base/tomcat/request-pipeline/)
- [容器层级与组件关系](/notes/source/java/base/tomcat/container-hierarchy/)