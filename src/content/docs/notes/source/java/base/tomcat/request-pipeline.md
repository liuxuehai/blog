---
title: HTTP 请求处理链
description: 从 Http11Processor 到 CoyoteAdapter，再到 Catalina Container 的完整请求调用链。
category: Backend
tags: [Source Reading, Tomcat, HTTP]
order: 34
updatedDate: 2026-08-19
difficulty: advanced
status: stable
lastReviewed: 2026-08-19
draft: false
sidebar: { order: 34 }
---

Tomcat 请求处理的关键边界是 Coyote 与 Catalina：前者理解字节流和 HTTP 协议，后者理解 Servlet 请求、容器路由和应用生命周期。

<!-- more -->

## 先给答案：Adapter 是协议世界和 Servlet 容器世界之间的语义翻译器

Coyote 处理 HTTP 连接和协议解析，Container 处理 Web 应用和 Servlet。Adapter 把 Request/Response、异步状态、映射结果和调用入口转换成另一侧能理解的模型，避免协议层直接依赖 Servlet 层。

这层适配也定义了错误边界：协议解析错误、映射失败、Servlet 异常和响应提交失败可能发生在不同阶段。理解请求链时要追踪请求对象在哪次转换中增加了什么信息，而不是只记住 `service()` 最终被调用。


```text
Socket -> Http11Processor#service -> CoyoteAdapter#service
      -> postParseRequest/Mapper -> Engine/Host/Context/Wrapper Valve -> Servlet
```

`Http11Processor#service` 在 `java/org/apache/coyote/http11/Http11Processor.java:254`，在 `:401` 调用 Adapter。`CoyoteAdapter#service` 位于 `java/org/apache/catalina/connector/CoyoteAdapter.java:305`，在 `:342` 调用 `postParseRequest`，随后于 `:347` 进入容器 Pipeline；路由调用 `Mapper#map` 位于 `CoyoteAdapter.java:700`。

## 为什么需要 Adapter

**替代方案**：让 Coyote 直接调用 Catalina 的 Request/Response。
**为什么不行**：协议实现会依赖容器内部类型，HTTP/2、升级协议和不同连接器难以复用。Adapter 集中处理模型转换、异步、错误和访问日志边界。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| 请求体未读完 | Keep-Alive 异常 | Servlet 提前返回 | 正确消费 body |
| 异步请求 | 原线程已返回 | AsyncContext 转移执行权 | 不在原线程继续写 |
| 协议升级 | 普通链不再继续 | 连接状态改变 | 明确升级后的所有权 |
| 响应已提交 | 状态码无法修改 | 输出已 flush | 尽早校验 |

## 可迁移知识

协议对象到业务对象之间设置防腐层，可以隔离协议版本、资源生命周期和实现差异。

> **面试锚点**
> - Coyote 与 Catalina 的职责边界是什么？
> - Adapter 为什么是关键层？
> - Servlet 异步如何影响线程和连接？

## Related

- [Mapper 路由与 Pipeline/Valve](/notes/source/java/base/tomcat/mapper-valve/)
- [NIO Endpoint 与线程模型](/notes/source/java/base/tomcat/nio-endpoint/)
