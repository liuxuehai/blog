---
title: Actix Web
description: Actix Web 源码解析总览：HttpServer worker、ServiceFactory、路由、提取器、中间件与 WebSocket Actor。
category: Backend
tags: [Source Reading, Actix Web, Rust, Web]
order: 4
updatedDate: 2026-08-22
difficulty: advanced
status: stable
lastReviewed: 2026-08-22
draft: false
sidebar:
  order: 4
---

Actix Web 以 `actix-service` 的 `ServiceFactory` / `Service` 为骨架：应用工厂为每个 worker 构建一棵本地服务树，请求经过资源匹配、guard、extractor 和 middleware 后进入 handler。Actor 并不是普通 HTTP 请求的必经核心，而是通过 `actix-web-actors` 为 WebSocket 等长连接提供可选集成。

<!-- more -->

## 本册问题地图

Actix-web 要从 worker、ServiceFactory 和请求消息三层理解：

1. **Worker 为什么是核心并发单位？** 每个 worker 有自己的服务实例和事件循环，连接请求被分发到 worker；共享状态因此要显式使用同步或消息传递。
2. **ServiceFactory 与 Service 如何分工？** Factory 创建可运行的服务，Service 处理具体请求；中间件可以在构造期捕获配置，在请求期维护状态。
3. **Extractor 和 Handler 如何协作？** Extractor 从请求消息中消费并校验数据，Handler 只接收已转换参数；失败会在进入业务前变成响应。
4. **Actor WebSocket 适合什么？** 它把连接状态封装进 actor 消息循环，适合有状态长连接；跨 actor 共享数据需要遵守 mailbox 和停止语义。
5. **与 Axum 的取舍是什么？** Actix 更强调 actor/worker 模型，Axum 更强调 Tower 和类型组合；两者都需处理背压、取消和共享状态。

## 版本快照

| 项 | 值 |
| --- | --- |
| 仓库 | `actix/actix-web` |
| 本地路径 | `E:\source\rust\actix-web` |
| 分支 | `main` |
| Commit | `1ab8d6ac`（2026-08-12） |
| actix-web | `4.14.1`，tag `web-v4.14.1` |
| Rust MSRV | `1.88` |

> 本册源码坐标均基于该 commit。普通 HTTP 服务核心是 Service/ServiceFactory 与 worker-local runtime；“Actix Web 等于 Actor Web 框架”是过度简化。

## 主调用链

```text
HttpServer factory
  -> per-worker AppInit::new_service
  -> AppRouting
  -> Scope / Resource / Route
  -> FromRequest tuple
  -> Handler
  -> Responder
  -> ServiceResponse
```

## 本册目录

- [整体架构](/notes/source/rust/actix-web/architecture/)：crate 边界、worker 与服务树
- [HttpServer 与 Worker](/notes/source/rust/actix-web/server-worker/)：应用工厂、多 listener、worker-local runtime 与关闭
- [ServiceFactory 与路由树](/notes/source/rust/actix-web/service-routing/)：AppInit、AppRouting、Scope、Resource、Route
- [Extractor 与 Handler](/notes/source/rust/actix-web/extractors-handler/)：FromRequest、tuple future、Responder 与 Data
- [中间件管线](/notes/source/rust/actix-web/middleware/)：Transform 初始化、Service 调用、from_fn 与 Logger
- [WebSocket Actor 集成](/notes/source/rust/actix-web/websocket-actors/)：升级、WebsocketContext 与 StreamHandler
- [与 Axum 的设计对照](/notes/source/rust/actix-web/axum-compare/)：ServiceFactory/worker-local 与 Tower/type-state
- [面试专题](/notes/source/rust/actix-web/interview/)：源码级高频题与排障场景

## Related

- [Rust 源码解析](/notes/source/rust/)
- [Axum 整体架构](/notes/source/rust/axum/architecture/)
- [Tokio Runtime 构建与进入](/notes/source/rust/tokio/runtime/)
