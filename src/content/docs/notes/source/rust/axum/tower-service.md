---
title: Tower Service 适配层
description: Router、MethodRouter、Route 与 HandlerService 如何收敛为 Tower Service。
category: Backend
tags: [Source Reading, Axum, Tower, Service]
order: 21
updatedDate: 2026-08-17
difficulty: advanced
status: stable
lastReviewed: 2026-08-17
draft: false
sidebar:
  order: 21
---

Tower `Service` 是 Axum 的通用接缝。路由器、单条路由、异步处理函数和中间件最终都要表现成“接收 Request、返回 Future”的对象。

<!-- more -->

## 适配链

```text
handler fn
  -> Handler<T, S>
  -> HandlerService<H, T, S>
  -> Route<BoxCloneSyncService>
  -> MethodRouter
  -> Router
  -> make service per connection
```

## 四层对象

1. `HandlerService` 保存 handler 与 state，定义在 `axum/src/handler/service.rs:22-27`；其 `Service<Request<B>>` 实现在 `handler/service.rs:146-168`。
2. `Route<E>` 把具体 service 擦除成 `BoxCloneSyncService<Request, Response, E>`，见 `routing/route.rs:31-35`。
3. `MethodRouter<S, E>` 保存各 HTTP method endpoint 与 fallback，见 `routing/method_routing.rs:549-558`；请求分派在 `method_routing.rs:1200-1251`。
4. `Router<S>` 组合 path router、fallback router 和默认 fallback，见 `routing/mod.rs:86-94`；最终调用在 `routing/mod.rs:452-460`。

`Router` 在状态补齐后实现 `Service<Request<B>>`（`routing/mod.rs:575-597`），`Route` 的 `call` 会替换内部 service 再调用，避免违反 Tower 对并发调用准备状态的约束（`routing/route.rs:88-106`）。

## `poll_ready` 为什么看起来总是 Ready

Axum 的大多数路由 Service 在 `poll_ready` 返回 Ready，而真正可能失败或等待的逻辑放进返回 Future。原因是路由层需要可克隆、可并发地驱动内层服务；具体背压常由更外层 Tower middleware 或 Hyper 连接管理表达。

### 为什么不用一个巨型枚举保存所有 Handler 类型

**替代方案**：为不同参数数量、返回类型和 middleware 组合生成一个封闭枚举。

**为什么不行**：组合空间开放且无限；任何用户自定义 Service 都会迫使框架修改枚举。

**证据**：`HandlerService` 保留静态泛型，进入路由表后由 `Route` 在 `routing/route.rs:31` 做 trait-object 擦除，开放扩展与可控二进制体积同时成立。

## Layer 插入位置

| API | 包裹范围 | 坐标 |
| --- | --- | --- |
| `Router::layer` | 已注册的全部路由与 fallback | `routing/mod.rs:302-332` |
| `Router::route_layer` | 已注册的路由，不包 fallback | `routing/mod.rs:332-370` |
| `MethodRouter::layer` | 当前方法路由中的 endpoints | `routing/method_routing.rs:992-1038` |
| `Handler::layer` | 单个 handler | `handler/mod.rs:190-218` |

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| 在注册路由前调用 `layer` | 后加路由没有 middleware | layer 只变换当前服务树 | 最后统一 layer，或用 builder 固化顺序 |
| 内层 Service 返回任意错误 | 服务器无法形成响应 | Hyper 连接要求请求错误被处理 | 使用 `HandleErrorLayer` 转响应 |
| 自定义 Service 不可 Clone | 无法装入路由 | 路由分支和连接需要克隆 | 外包 `Arc` 或提供 Clone handle |
| 把 `poll_ready` 当业务限流 | Axum 路由通常始终 Ready | 背压不在这一层表达 | 使用 Tower concurrency/load-shed layer |

## 可迁移知识

“静态泛型留在叶子、动态擦除放在聚合边界”适用于插件系统、命令总线和编译器 pass 管线：叶子保留优化空间，容器只统一最小协议。

> **面试锚点**
> - Handler 如何变成 Tower Service？
> - `Route` 为什么要做类型擦除？
> - `layer` 与 `route_layer` 有什么差异？

## Related

- [Axum 整体架构](/notes/source/rust/axum/architecture/)
- [Handler 泛型分派](/notes/source/rust/axum/handler/)
- [中间件与错误边界](/notes/source/rust/axum/middleware-errors/)
