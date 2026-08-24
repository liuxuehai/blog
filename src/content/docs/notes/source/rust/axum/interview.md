---
title: Axum 面试专题
description: Axum Tower Service、Handler、Extractor、路由状态与中间件错误边界的源码级高频题。
category: Backend
tags: [Source Reading, Axum, Rust, Interview]
order: 29
updatedDate: 2026-08-24
difficulty: advanced
status: stable
lastReviewed: 2026-08-24
draft: false
sidebar:
  order: 29
---

Axum 面试的区分度来自能否说清 trait 适配链，而不是能否背出 `Router::route` 的写法。

<!-- more -->

## 先给答案：Axum 面试的区分度来自能否说清 trait 适配链，而不是能否背出 Router::route 的写法

Axum 面试的区分度来自能否说清 trait 适配链，而不是能否背出 Router::route 的写法。 正文沿“1. Axum 为什么建立在 Tower 上 -> 2. Handler 如何调用普通 async fn -> 3. FromRequestParts 和 FromRequest 的区别”展开：先确认入口和状态归属，再跟踪控制流或数据流的推进，最后落到对外可观察的结果。

主要失效边界集中在“为什么 Router 的错误常是 Infallible、“Handler trait not implemented” 怎么排查、线上请求偶发长尾怎么分层”这些场景。它们破坏的是容量、顺序、并发或生命周期前提；排查时应先确认状态是否仍由正确对象持有，再核对推进条件和清理路径。

## 1. Axum 为什么建立在 Tower 上

Tower 的 `Service<Request>` 与 `Layer` 提供统一服务和中间件协议。Axum 只需把 Router、Handler 和路由 endpoint 适配进去，就能复用 timeout、trace、限流等生态。源码入口：`routing/mod.rs:575`、`handler/service.rs:146`。

## 2. Handler 如何调用普通 async fn

`Handler<T, S>` 为不同函数参数元组生成实现：先按顺序运行 extractors，再调用函数并 await，最后执行 `IntoResponse`。参数版本由 `impl_handler!` 在 `handler/mod.rs:221-257` 生成。

## 3. `FromRequestParts` 和 `FromRequest` 的区别

前者只借用 `Parts`，适合路径、查询、header 与 state；后者拥有完整请求，可消费 body。分离后，body 单次消费约束能进入类型系统。源码：`axum-core/src/extract/mod.rs:53`、`:79`。

## 4. 为什么 body extractor 要放最后

handler 的 tuple 实现要求前面的参数实现 `FromRequestParts`，最后一个参数实现 `FromRequest`。这样不会出现前一个参数拿走 body、后一个参数才发现空 body 的隐式运行时错误。

## 5. `Router<S>` 的 S 是什么

它表示 Router 仍缺少的 state 类型。`with_state` 提供当前 S 后可返回另一个缺失状态类型，通常最终成为 `Router<()>`。源码：`routing/mod.rs:444-450`。

## 6. Axum 路由怎么匹配

先由 `PathRouter` 包装的 `matchit::Router` 匹配路径并写入参数，再由 `MethodRouter` 选择 method endpoint；路径失败与 method 失败分别对应 404 与 405。源码：`path_router.rs:325-372`、`method_routing.rs:1200-1251`。

## 7. 为什么 Router 的错误常是 `Infallible`

进入 HTTP server 后，每个请求都应得到响应；任意 Tower 错误必须先通过 `HandleError` 映射为状态码和响应体，不能泄漏给 Hyper 连接层。源码：`error_handling/mod.rs:115-220`。

## 8. `layer` 与 `route_layer` 有何不同

`layer` 包括 fallback，`route_layer` 只包已注册 route，常用于避免鉴权层把 404 也变成 401。源码：`routing/mod.rs:302-370`。

## 9. “Handler trait not implemented” 怎么排查

按顺序检查：参数是否都是 extractor、body extractor 是否最后、Future 是否 Send、返回值是否 `IntoResponse`、state 是否 Send+Sync、闭包是否 Clone。可临时加 `#[debug_handler]` 改善诊断。

## 10. 线上请求偶发长尾怎么分层

```text
Router 匹配耗时
  -> middleware timeout/queue
  -> extractor body buffering
  -> handler 持锁或阻塞
  -> Hyper connection / flow control
  -> Tokio worker starvation
```

重点记录每层 span，检查是否持同步锁跨 await、是否整体收集大 body、是否 CPU 工作跑在 async worker。

## 11. Axum 与 Actix Web 的核心差异

Axum 最大化复用 Tower/Hyper/Tokio，类型签名直接表达 extractor 和 state；Actix Web 使用自己的 `ServiceFactory` 初始化树与每 worker service，允许更多 `Rc`/`RefCell` 风格的 worker-local 状态。差异首先是运行与服务模型，不只是 API 语法。

## 12. 一句话总结 Axum

Axum 用 Tower Service 统一路由和中间件，用 Handler 泛型把 async 函数适配成 Service，用两级 extractor trait 管理请求所有权，再把结果统一收敛为 `IntoResponse`。

## Related

- [Axum 整体架构](/notes/source/rust/axum/architecture/)
- [Extractor 类型级管线](/notes/source/rust/axum/extractors/)
- [Actix Web 与 Axum 对照](/notes/source/rust/actix-web/axum-compare/)
