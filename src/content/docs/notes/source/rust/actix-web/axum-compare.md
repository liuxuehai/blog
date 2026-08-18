---
title: 与 Axum 的设计对照
description: Actix Web 与 Axum 在运行时、Service、状态、提取器、中间件和错误模型上的取舍。
category: Backend
tags: [Source Reading, Actix Web, Axum, Architecture]
order: 46
updatedDate: 2026-08-17
difficulty: advanced
status: stable
lastReviewed: 2026-08-17
draft: false
sidebar:
  order: 46
---

Actix Web 与 Axum 都使用 trait 和异步 Future，但抽象中心不同：Axum 围绕 Tower `Service` 与 Hyper 生态组合；Actix Web 围绕 per-worker `ServiceFactory` 初始化树和本地 Service。

<!-- more -->

## 核心对照

| 维度 | Actix Web | Axum |
| --- | --- | --- |
| 服务协议 | `actix_service::Service` + `ServiceFactory` | `tower_service::Service` + `Layer` |
| 初始化 | 每 worker 异步 `new_service` | Router 构建后 clone/serve |
| Future | 大量 `LocalBoxFuture`，可非 Send | handler Future 通常必须 Send |
| 状态 | extensions + `Data<T>(Arc<T>)`，可层级覆盖 | `Router<S>` missing-state + `State<T>` |
| Extractor | 单一 `FromRequest(&HttpRequest, &mut Payload)` | parts/body 两 trait |
| 中间件 | `Transform` 生成 Service | `Layer` 包裹 Service |
| HTTP 内核 | actix-http | Hyper |
| Actor | WebSocket 等可选集成 | 非核心 |

## 源码证据

Actix Web 的工厂与本地 Future 可见 `app_service.rs:48-64`、`:262-280`，handler 协议在 `handler.rs:89-145`，extractor 在 `extract.rs:65-93`。Axum 对应 Router Service 在 `axum/src/routing/mod.rs:575`，Handler 在 `handler/mod.rs:148`，两类 extractor 在 `axum-core/src/extract/mod.rs:53`、`:79`。

## 状态取舍

Actix `Data<T>` 是 Arc 包装（`actix-web/src/data.rs:90-98`），通过 extensions 按类型查找，Scope/Resource 可覆盖；Axum 让 Router 泛型表示缺失状态，并通过 `FromRef` 投影子状态。前者运行时灵活，后者把更多组合错误前移到编译期。

## Send 约束取舍

Actix worker-local Service 可使用 `Rc` 与 non-Send Future，减少线程安全约束，但任务不能自由迁移 worker。Axum 建立在 Tokio/Tower 的跨任务组合上，handler Future 通常要求 Send，生态互操作更直接。

### 为什么不存在绝对赢家

**替代判断**：只按 benchmark 或 API 简洁度选框架。

**为什么不够**：真正成本来自团队调试能力、middleware 生态、状态模型、运行时约束和服务部署形态。

**证据**：两者热路径都使用静态泛型，但类型擦除与局部性边界不同；Actix 在 worker 初始化树内使用 Rc，Axum 在 Route 聚合处使用 boxed clone service。

## 选型提示

| 场景 | 倾向 |
| --- | --- |
| 已大量使用 Tower middleware/Hyper | Axum |
| 希望 worker-local non-Send 服务 | Actix Web |
| 强调 extractor 顺序的编译期约束 | Axum |
| 需要成熟 Actix Web 生态或 actor WebSocket | Actix Web |
| 团队更熟 Tokio/Tower 调试链 | Axum |

## 边界与踩坑

| 误区 | 修正 |
| --- | --- |
| Actix Web 每请求一个 Actor | 普通 HTTP 是 Service pipeline |
| Axum 没有初始化成本 | 路由和 Layer 仍在构建期组合 |
| non-Send 一定更快 | 只是减少约束，性能需测量 |
| 编译期类型越多越好 | 也会增加编译时间和诊断复杂度 |

## 可迁移知识

框架对照应比较“所有权和并发边界放在哪里”，而非只看表层 API。worker-local、跨线程共享、运行时查找和编译期 type-state 是不同成本模型。

> **面试锚点**
> - Actix ServiceFactory 与 Tower Layer 的差别是什么？
> - 两者对 Send Future 的约束为何不同？
> - 两者的状态注入各有什么代价？

## Related

- [Actix Web 整体架构](/notes/source/rust/actix-web/architecture/)
- [Axum 整体架构](/notes/source/rust/axum/architecture/)
- [Axum Tower Service 适配层](/notes/source/rust/axum/tower-service/)
