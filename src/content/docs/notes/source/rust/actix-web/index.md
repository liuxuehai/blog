---
title: Actix Web
description: Actix Web 源码解析总览：HttpServer worker、ServiceFactory、路由、提取器、中间件与 WebSocket Actor。
category: Backend
tags: [Source Reading, Actix Web, Rust, Web]
order: 4
updatedDate: 2026-08-17
difficulty: advanced
status: stable
lastReviewed: 2026-08-17
draft: false
sidebar:
  order: 4
---

Actix Web 以 `actix-service` 的 `ServiceFactory` / `Service` 为骨架：应用工厂为每个 worker 构建一棵本地服务树，请求经过资源匹配、guard、extractor 和 middleware 后进入 handler。Actor 并不是普通 HTTP 请求的必经核心，而是通过 `actix-web-actors` 为 WebSocket 等长连接提供可选集成。

<!-- more -->

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
