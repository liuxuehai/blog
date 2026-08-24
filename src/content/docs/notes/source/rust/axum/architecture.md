---
title: Axum 整体架构
description: Axum 如何在 Tokio、Hyper 与 Tower 之上组织 Router、Handler、Extractor 和 Response。
category: Backend
tags: [Source Reading, Axum, Rust, Architecture]
order: 20
updatedDate: 2026-08-24
difficulty: advanced
status: stable
lastReviewed: 2026-08-24
draft: false
sidebar:
  order: 20
---

Axum 的架构重点不是“自己实现 HTTP”，而是把已有底座通过稳定 trait 拼接起来。理解每层负责什么，比记住路由 API 更重要。

<!-- more -->

## 先给答案：Axum 的架构重点不是“自己实现 HTTP”，而是把已有底座通过稳定 trait 拼接起来

Axum 的架构重点不是“自己实现 HTTP”，而是把已有底座通过稳定 trait 拼接起来。理解每层负责什么，比记住路由 API 更重要。 正文沿“分层地图 -> 请求数据面 -> 核心抽象”展开：先确认入口和状态归属，再跟踪控制流或数据流的推进，最后落到对外可观察的结果。

主要失效边界集中在“Handler 中做长 CPU 计算、把 Axum 当完整网络栈、盲目堆 Layer”这些场景。它们破坏的是容量、顺序、并发或生命周期前提；排查时应先确认状态是否仍由正确对象持有，再核对推进条件和清理路径。

## 分层地图

```text
application
  handler fn + extractors + response types
              |
axum         Router / MethodRouter / middleware
              |
Tower        Service<Request> + Layer
              |
Hyper        HTTP/1、HTTP/2、Body、connection state machine
              |
Tokio        task scheduler、socket readiness、timer
```

`axum/src/lib.rs:553-600` 给出模块与公开重导出；`Router` 定义在 `axum/src/routing/mod.rs:86`，`Handler` 在 `axum/src/handler/mod.rs:148`，提取协议在 `axum-core/src/extract/mod.rs:53-88`，响应收口在 `axum-core/src/response/into_response.rs:115`。

## 请求数据面

```text
Request
  -> path match
  -> method match
  -> request parts extractors
  -> last body extractor
  -> handler.call(tuple, state)
  -> Future::Output
  -> IntoResponse
  -> Response<Body>
```

路径路由最终进入 `PathRouter::call_with_state`（`axum/src/routing/path_router.rs:325`）；方法分派进入 `MethodRouter::call_with_state`（`routing/method_routing.rs:1200`）；函数处理器由宏生成的 `Handler` 实现驱动（`handler/mod.rs:221-257`）。

## 核心抽象

| 抽象 | 责任 | 关键坐标 |
| --- | --- | --- |
| `Router<S>` | 路径树、方法路由、fallback 与缺失状态 | `routing/mod.rs:86-94` |
| `Route<E>` | 类型擦除后的可克隆请求 Service | `routing/route.rs:31-35` |
| `Handler<T, S>` | 把异步函数签名解释为请求处理器 | `handler/mod.rs:148-190` |
| `FromRequestParts` | 只读取 method/URI/header/extensions | `axum-core/src/extract/mod.rs:53-70` |
| `FromRequest` | 可以消费完整请求体 | `axum-core/src/extract/mod.rs:79-96` |
| `IntoResponse` | 将业务返回类型统一为响应 | `axum-core/src/response/into_response.rs:115-118` |
| `Serve` | 接受连接并交给 Hyper | `serve/mod.rs:203-214` |

## 关键取舍

**替代方案**：像传统框架一样定义私有中间件接口、私有请求响应类型和私有服务器循环。

**为什么不选**：生态互操作成本高，同一套 timeout、trace、load-shed 逻辑无法在客户端、服务端与不同框架之间复用。

**证据**：`Router`、`MethodRouter`、`Route`、`HandlerService` 都实现 Tower `Service<Request<_>>`，入口分别位于 `routing/mod.rs:575`、`routing/method_routing.rs:1369`、`routing/route.rs:88`、`handler/service.rs:146`。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| Handler 中做长 CPU 计算 | 同 worker 上其他请求延迟升高 | Tokio Future 不能被任意抢占 | 切片、`spawn_blocking` 或专用线程池 |
| 把 Axum 当完整网络栈 | 排查停在框架层 | 协议状态机在 Hyper，调度在 Tokio | 沿 Service → Hyper → Tokio 分层定位 |
| 盲目堆 Layer | 类型错误或顺序与预期相反 | Layer 包裹顺序决定请求/响应经过顺序 | 用 `ServiceBuilder` 显式组织 |
| 状态不是 Clone + Send + Sync | 编译失败 | Router/Handler 可能跨任务共享 | 用 `Arc` 封装并缩小状态边界 |

## 可迁移知识

成熟框架可把“协议内核、服务抽象、业务适配”拆为三层。上层只依赖 trait，既保留静态分派和编译期检查，也允许在边界处通过 `Route` 做有限类型擦除，控制泛型爆炸。

> **面试锚点**
> - Axum、Tower、Hyper、Tokio 分别负责什么？
> - 为什么说 Router 本质是 Service？
> - 类型擦除为什么只集中在 Route 边界？

## Related

- [Tower Service 适配层](/notes/source/rust/axum/tower-service/)
- [Extractor 类型级管线](/notes/source/rust/axum/extractors/)
- [Hyper 整体架构](/notes/source/rust/hyper/architecture/)
