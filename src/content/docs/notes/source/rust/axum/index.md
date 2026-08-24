---
title: Axum
description: Axum 源码解析总览：Tower Service、Handler、Extractor、路由、状态共享与中间件。
category: Backend
tags: [Source Reading, Axum, Rust, Tower]
order: 2
updatedDate: 2026-08-22
difficulty: advanced
status: stable
lastReviewed: 2026-08-22
draft: false
sidebar:
  order: 2
---

Axum 不另造一套网络运行时和中间件协议，而是把 Tokio、Hyper 与 Tower 组合为类型驱动的 Web 框架：`Router` 是 `Service`，异步函数经 `Handler` 适配为 `Service`，参数经 `FromRequestParts` / `FromRequest` 提取，返回值经 `IntoResponse` 收敛为 HTTP 响应。

<!-- more -->

## 本册问题地图

Axum 的主线是把类型安全的 Handler 适配成 Tower Service：

1. **Extractor 为什么按顺序消费请求？** 路由参数、状态、headers 和 body 都从请求中提取，body 通常只能被消费一次，因此 extractor 顺序会影响后续 handler 能否继续读取。
2. **Handler 如何变成 Service？** Axum 用 trait 和泛型把参数元组、返回值和错误转换成统一响应，运行时仍由 Tower 负责 poll 和 middleware 调用。
3. **状态共享放在哪里？** Router 的 state 被克隆或引用到请求服务中，状态类型必须满足并发边界；把非线程安全对象直接塞进共享状态会在编译期暴露问题。
4. **中间件的错误边界是什么？** 中间件可以在进入前拒绝、在退出后改写响应，但错误类型和响应转换必须统一，否则链条无法组合。
5. **类型安全的代价是什么？** 编译期约束减少运行时分支，却会让泛型错误复杂；读源码要把 trait 适配层和实际请求时序分开。

## 版本快照

| 项 | 值 |
| --- | --- |
| 仓库 | `tokio-rs/axum` |
| 本地路径 | `E:\source\rust\axum` |
| 分支 | `main` |
| Commit | `151cd5c1`（2026-08-11） |
| Axum 主 crate | `0.8.9`，对应 tag `axum-v0.8.9` |
| axum-core | `0.5.6` |
| Rust MSRV | `1.80` |

> 本册源码坐标均基于该 commit。仓库按 `axum`、`axum-core`、`axum-extra`、`axum-macros` 分 crate，核心协议主要落在前两个 crate。

## 主调用链

```text
TCP listener
  -> axum::serve
  -> Router::call_with_state
  -> PathRouter(matchit)
  -> MethodRouter
  -> HandlerService
  -> extractor tuple
  -> handler Future
  -> IntoResponse
  -> Hyper connection
```

## 本册目录

- [整体架构](/notes/source/rust/axum/architecture/)：Tokio、Hyper、Tower 与 Axum 的边界
- [Tower Service 适配层](/notes/source/rust/axum/tower-service/)：Router、Route 与 HandlerService 如何统一为 Service
- [Extractor 类型级管线](/notes/source/rust/axum/extractors/)：parts/body 两阶段提取、拒绝类型与顺序约束
- [Handler 泛型分派](/notes/source/rust/axum/handler/)：函数签名、宏生成、Future 与 IntoResponse
- [路由与状态共享](/notes/source/rust/axum/routing-state/)：matchit、MethodRouter、nest、fallback 与缺失状态
- [中间件与错误边界](/notes/source/rust/axum/middleware-errors/)：Layer、from_fn、Infallible 与 HandleError
- [面试专题](/notes/source/rust/axum/interview/)：源码级高频题与排障场景

## Related

- [Rust 源码解析](/notes/source/rust/)
- [Tokio 整体架构](/notes/source/rust/tokio/architecture/)
- [Hyper 整体架构](/notes/source/rust/hyper/architecture/)
