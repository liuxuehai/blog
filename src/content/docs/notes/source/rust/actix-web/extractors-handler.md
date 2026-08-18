---
title: Extractor 与 Handler
description: FromRequest tuple、Payload 所有权、Handler 宏、Responder 与 Data 共享状态。
category: Backend
tags: [Source Reading, Actix Web, Extractor, Handler]
order: 43
updatedDate: 2026-08-17
difficulty: advanced
status: stable
lastReviewed: 2026-08-17
draft: false
sidebar:
  order: 43
---

Actix Web 用 `FromRequest` 把请求转换为 handler 参数，用 `Handler<Args>` 适配函数，用 `Responder` 把返回值转换为响应。与 Axum 不同，它没有公开拆成 parts/body 两个 extractor trait。

<!-- more -->

## 参数管线

```text
HttpRequest + Payload
  -> A::from_request
  -> B::from_request
  -> tuple Future
  -> Handler::call((A, B, ...))
  -> Output: Responder
  -> HttpResponse
```

`FromRequest` 定义于 `actix-web/src/extract.rs:65-93`，输入是 `&HttpRequest` 和 `&mut Payload`。`Option<T>` 与 `Result<T, E>` 的包装实现在 `extract.rs:137-260`。tuple extractor 由宏从 `extract.rs:310` 附近生成，组合多个 future。

`Handler<Args>` 位于 `handler.rs:89-94`，不同参数数量的实现由 `factory_tuple!` 在 `handler.rs:131-145` 生成。返回值通过 `Responder`（`response/responder.rs:39-48`）生成 `HttpResponse`。

## Payload 所有权

所有 extractor 都拿同一个 `&mut Payload`。元数据 extractor 不消费流，JSON/Form/Bytes 等 body extractor 会读取 payload。框架允许更灵活的组合，但多个 body 消费者仍会竞争同一流；应保持一个明确的 body owner。

典型 JSON extractor 定义在 `types/json.rs`，Form 在 `types/form.rs`，Path 在 `types/path.rs`，Query 在 `types/query.rs`。各类型同时承载反序列化与配置查找，例如大小限制和 content-type 策略。

## `Data<T>`

`Data<T>` 是 `Arc<T>` 包装，定义在 `data.rs:90-98`；它的 `FromRequest` 实现在 `data.rs:155-167`，从请求的 app data 容器按类型查找。状态查找是类型键控且有层级：更近的 Scope/Resource 数据可覆盖 App 数据。

### 为什么 extractor 接收 `&HttpRequest` + `&mut Payload`

**替代方案**：每个 extractor 都获得完整 Request 所有权。

**为什么不行**：多个参数无法共同访问 metadata，且请求对象需要在服务链中继续存在。

**证据**：trait 签名将不可变元数据共享与可变 body 流分开（`extract.rs:65-93`），tuple future 可并列创建提取步骤。

## 错误与响应

`FromRequest::Error: Into<Error>`，提取失败进入 Actix 统一 Error，再由 `ResponseError` 决定响应。业务返回可直接使用 `Result<T, E>`，只要成功值是 `Responder`、错误能转为 Error。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| 多个 extractor 读取 body | 后者得到空/错误 payload | 同一流被前者消费 | 每 handler 只设一个 body owner |
| `Data<T>` 找不到 | 500/提取失败 | 注册类型与提取类型不完全一致 | 统一 newtype，检查层级覆盖 |
| body limit 只在业务校验 | 已经分配过多内存 | 聚合发生在校验前 | 配 extractor limit |
| handler future 长期持有借用 | 类型或生命周期复杂 | 请求局部值跨 await | 提取 owned DTO 后再 await |

## 可迁移知识

参数注入系统应把 metadata 借用、stream 消费、错误转协议结果和共享状态查找拆开建模。即使不靠反射，也可用 trait + tuple 宏形成可扩展调用约定。

> **面试锚点**
> - Actix Web 的 FromRequest 如何组合多个参数？
> - 多个 body extractor 会发生什么？
> - `Data<T>` 为什么是 Arc，作用域覆盖如何工作？

## Related

- [ServiceFactory 与路由树](/notes/source/rust/actix-web/service-routing/)
- [Axum Extractor 类型级管线](/notes/source/rust/axum/extractors/)
- [Serde 反序列化访问协议](/notes/source/rust/serde/deserializer/)
