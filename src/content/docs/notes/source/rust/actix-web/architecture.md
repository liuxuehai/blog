---
title: Actix Web 整体架构
description: HttpServer、App 工厂、ServiceFactory 初始化树、路由数据面和 actix-http 的模块边界。
category: Backend
tags: [Source Reading, Actix Web, Rust, Architecture]
order: 40
updatedDate: 2026-08-24
difficulty: advanced
status: stable
lastReviewed: 2026-08-24
draft: false
sidebar:
  order: 40
---

Actix Web 把“构建服务”和“处理请求”分成两个阶段：`ServiceFactory::new_service` 在 worker 初始化时生成本地 Service，之后请求只走已经完成组装的数据面。

<!-- more -->

## 先给答案：Actix Web 把“构建服务”和“处理请求”分成两个阶段：ServiceFactory::newser…

Actix Web 把“构建服务”和“处理请求”分成两个阶段：ServiceFactory::newservice 在 worker 初始化时生成本地 Service，之后请求只走已经完成组装的数据面。 正文沿“分层地图 -> 控制面与数据面 -> 核心抽象”展开：先确认入口和状态归属，再跟踪控制流或数据流的推进，最后落到对外可观察的结果。

主要失效边界集中在“假设 App factory 只执行一次、worker 内做阻塞 IO、共享状态误用 Rc”这些场景。它们破坏的是容量、顺序、并发或生命周期前提；排查时应先确认状态是否仍由正确对象持有，再核对推进条件和清理路径。

## 分层地图

```text
actix-web
  App / Scope / Resource / Route
  Extractor / Handler / Responder / Middleware
             |
actix-service
  ServiceFactory -> Service
             |
actix-http
  HTTP/1、HTTP/2、payload、body、ws codec
             |
actix-server + actix-rt
  listeners、workers、Tokio current-thread runtime
```

`App<T>` 定义在 `actix-web/src/app.rs:25-31`，`HttpServer` 在 `server.rs:75-96`。`dev.rs:16-21` 重导出 `actix_service::{Service, ServiceFactory, Transform}`。HTTP 协议细节下沉到 `actix-http`，Web 层主要处理路由、应用数据与响应转换。

## 控制面与数据面

```text
startup / each worker
  App factory
  -> AppInit::new_service
  -> register Scope/Resource
  -> build ResourceMap + Router
  -> initialize middleware
  -> AppInitService

request
  AppInitService::call
  -> AppRouting::call
  -> matched ResourceService
  -> RouteService
  -> handler
```

`AppInit<T, B>` 位于 `app_service.rs:27-46`，其 `new_service` 在 `:48-160` 注册子服务、完成 `ResourceMap` 并等待异步 data factory。`AppInitService` 定义在 `:166-180`，调用入口在 `:221-257`。`AppRouting` 位于 `:319-349`。

## 核心抽象

| 抽象 | 职责 | 坐标 |
| --- | --- | --- |
| `HttpServer` | listener、worker 数、协议配置、关闭 | `server.rs:75-96` |
| `App` | 声明服务树与 middleware | `app.rs:25-59` |
| `ServiceFactory` | 为每个 worker 异步创建 Service | `dev.rs:16-21` |
| `AppRouting` | 按资源定义匹配 endpoint | `app_service.rs:319-349` |
| `FromRequest` | 从请求与 payload 构造 handler 参数 | `extract.rs:65-93` |
| `Responder` | 把 handler 输出转成 HttpResponse | `response/responder.rs:39-48` |

## 关键取舍

**替代方案**：整台服务器共享一棵 `Send + Sync` 服务树，所有 worker 并发调用。

**为什么不选**：许多请求态组件无需跨线程共享；允许每 worker 使用 `Rc` 和局部 Future，可减少同步约束与原子操作。

**证据**：应用初始化和路由内部广泛使用 `Rc<...>`、`RefCell` 与 `LocalBoxFuture`（如 `app_service.rs:48-64`、`:262-280`），服务工厂会在每 worker 实例化。

## Actor 的真实位置

普通 HTTP 数据面不要求 `Actor` trait。Actor 集中出现在可选 `actix-web-actors` crate，例如 WebSocket `WebsocketContext`（`actix-web-actors/src/ws.rs:454`）。因此分析性能或线程模型时，应先看 worker Service，而不是先套 mailbox。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| 假设 App factory 只执行一次 | 重复初始化连接/客户端 | 每 worker、每 bind 地址都可能实例化 | 在外部创建可共享 handle，再 clone 进 factory |
| worker 内做阻塞 IO | 该 worker 请求停顿 | current-thread 本地执行模型 | `web::block`/blocking pool/异步客户端 |
| 共享状态误用 `Rc` | 无法跨 factory 线程 | factory 本身需要 Send | 外部共享用 `Arc`，worker 内可用 `Rc` |
| 把 Actor 当 HTTP 核心 | 排障方向错误 | HTTP path 是 Service pipeline | 只在 actor integration 处看 mailbox |

## 可迁移知识

把初始化期和请求期分开，可以把昂贵的路由编译、middleware 组装和依赖创建移出热路径；每执行单元持有本地服务树，则用架构边界换取更弱的同步要求。

> **面试锚点**
> - ServiceFactory 与 Service 为什么分开？
> - App factory 为什么会执行多次？
> - Actix Web 普通 HTTP 请求是否经过 Actor mailbox？

## Related

- [HttpServer 与 Worker](/notes/source/rust/actix-web/server-worker/)
- [ServiceFactory 与路由树](/notes/source/rust/actix-web/service-routing/)
- [与 Axum 的设计对照](/notes/source/rust/actix-web/axum-compare/)
