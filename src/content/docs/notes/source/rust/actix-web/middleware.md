---
title: 中间件管线
description: Transform 初始化、Service 调用、from_fn、Next、Logger 与响应 body 类型变化。
category: Backend
tags: [Source Reading, Actix Web, Middleware, Service]
order: 44
updatedDate: 2026-08-17
difficulty: advanced
status: stable
lastReviewed: 2026-08-17
draft: false
sidebar:
  order: 44
---

Actix Web 中间件有两阶段：`Transform` 在 worker 初始化时包裹内层 Service，生成真正处理请求的 middleware Service；热路径只调用后者。

<!-- more -->

## 两阶段模型

```text
startup:
Transform::new_transform(inner Service)
  -> MiddlewareService

request:
MiddlewareService::call(req)
  -> before
  -> inner.call(req).await
  -> after / map body
```

`Service`、`ServiceFactory`、`Transform` 从 `actix-service` 重导出于 `actix-web/src/dev.rs:16-21`。`App::wrap` 在 `app.rs:345-410` 改变 endpoint factory 类型；Scope 和 Resource 分别在 `scope.rs:297-338`、`resource.rs:259-300` 支持局部包裹。

## Logger 示例

`Logger` 保存格式配置并使用 `Rc<Inner>`（`middleware/logger.rs:87-95`）。它实现 `Transform<S, ServiceRequest>`（`logger.rs:269-287`），初始化出 `LoggerMiddleware<S>`（`:305-308`）；请求调用位于 `:310-352`，返回的 `LoggerResponse` Future 在 `:359` 之后记录状态、大小和耗时。

这展示了为什么要分两阶段：格式解析与配置构建只做一次，而每请求只保存必要的开始时间与 service future。

## `from_fn`

简单中间件可用 `from_fn`（`middleware/from_fn.rs:83-87`）。`MiddlewareFn` 的 Transform 实现在 `:96-117`，带 extractor 参数的 Service 实现由宏在 `:145-215` 生成。`Next<B>` 定义在 `:220-241`，拥有剩余 service，并通过 `call` 继续链路。

## Body 类型问题

中间件若在不同分支返回不同 body 类型，常需 `EitherBody` 或 boxed body。原因是 Service 的 `Response` 是关联类型，所有分支必须统一。性能敏感路径可保留具体 body，边界复杂时再装箱。

### 为什么 Transform 不直接等于 Service

**替代方案**：一个对象同时负责初始化配置和处理请求。

**为什么不行**：异步初始化、每 worker 实例化、内层 Service 类型与局部状态难表达，昂贵工作也容易落入热路径。

**证据**：Logger 的 `Transform::new_transform` 返回 ready future 和 `LoggerMiddleware`（`logger.rs:269-308`），请求期只调用 middleware service。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| wrap 顺序误判 | 日志/鉴权顺序反了 | 后 wrap 往往在外层 | 画洋葱图并写顺序测试 |
| 分支 body 类型不同 | 编译错误 | Response 关联类型必须统一 | `map_into_left/right_body` 或 boxed |
| 持 `RefCell` borrow 跨 await | 运行时 panic/编译受限 | 可变借用生命周期过长 | await 前释放借用 |
| middleware 做阻塞工作 | worker 请求排队 | 本地 runtime 被占用 | 异步化或 offload |

## 可迁移知识

中间件最好拆为“初始化期工厂”和“请求期服务”。这允许每执行单元拥有局部缓存与非线程安全状态，同时把昂贵配置解析移出热路径。

> **面试锚点**
> - Transform 与 Service 的区别是什么？
> - `wrap` 为什么会改变 App 的泛型类型？
> - 中间件为何经常遇到 body 类型不一致？

## Related

- [ServiceFactory 与路由树](/notes/source/rust/actix-web/service-routing/)
- [Axum 中间件与错误边界](/notes/source/rust/axum/middleware-errors/)
- [HttpServer 与 Worker](/notes/source/rust/actix-web/server-worker/)
