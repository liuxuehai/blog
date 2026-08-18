---
title: Extractor 类型级管线
description: FromRequestParts、FromRequest、tuple 展开、拒绝类型与请求体单次消费约束。
category: Backend
tags: [Source Reading, Axum, Extractor, Type System]
order: 22
updatedDate: 2026-08-17
difficulty: advanced
status: stable
lastReviewed: 2026-08-17
draft: false
sidebar:
  order: 22
---

Extractor 把“从请求中取值并验证”编码进 handler 参数类型。它不是运行时参数名绑定，而是一条由 trait 和 tuple 宏在编译期拼出的提取管线。

<!-- more -->

## 两阶段模型

```text
Request<Body>
  -> split into Parts + Body
  -> FromRequestParts: Path / Query / State / Header...
  -> FromRequest: Json / Form / Bytes / Request...
  -> tuple -> Handler::call
```

`FromRequestParts<S>` 定义在 `axum-core/src/extract/mod.rs:53-70`，只拿 `&mut Parts`；`FromRequest<S>` 位于 `extract/mod.rs:79-96`，接收完整 `Request`。tuple 实现放在 `axum-core/src/extract/tuple.rs`，前面的参数走 parts，最后一个参数可以消费 body。

## 典型提取器

| 类型 | 协议 | 关键坐标 | 失败结果 |
| --- | --- | --- | --- |
| `Path<T>` | `FromRequestParts` | `axum/src/extract/path/mod.rs:153-186` | 路径反序列化 rejection |
| `Query<T>` | `FromRequestParts` | `axum/src/extract/query.rs:41-63` | query 反序列化 rejection |
| `State<S>` | `FromRequestParts` | `axum/src/extract/state.rs:301-324` | 通常是 `Infallible` |
| `Json<T>` | `FromRequest` | `axum/src/json.rs:97-137` | content-type、语法、数据错误 |
| `Extension<T>` | `FromRequestParts` | `axum/src/extension.rs:72-104` | extension 缺失 |
| `DefaultBodyLimit` | Layer/extractor 辅助 | `axum-core/src/extract/default_body_limit.rs:77-96` | body 超限 |

`Json<T>` 先检查 JSON content type，再通过 `Bytes::from_request` 收集 body，最后交给 `serde_path_to_error`（`axum/src/json.rs:99-137`）。`Path<T>` 则从 extensions 中取得路由阶段写入的 URL 参数（`extract/path/mod.rs:157-186`）。

## 顺序为什么是类型错误而不是运行时错误

body 只能被一个提取器完整消费。Axum 通过 handler tuple 实现要求“前 N 个实现 `FromRequestParts`，最后一个实现 `FromRequest`”，让两个 body extractor、或把 body extractor 放在中间，尽量在编译期失败。

### 为什么不把所有提取器都设计成 `&Request`

**替代方案**：所有参数只拿不可变请求引用，需要 body 时内部缓存。

**为什么不行**：会隐藏 body buffering、复制与大小上限，流式 body 也难表达所有权转移。

**证据**：两个 trait 明确分离 `&mut Parts` 与拥有所有权的 `Request`（`axum-core/src/extract/mod.rs:53`、`:79`），资源消费边界直接体现在签名中。

## Rejection 是正常控制流

每个 extractor 有关联类型 `Rejection: IntoResponse`。提取失败不需要抛异常；tuple 管线立即把 rejection 转响应。需要统一错误格式时，应包装自定义 extractor 或实现 rejection 到领域错误的映射，而不是在每个 handler 重复 match。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| `Json` 不是最后一个参数 | Handler trait 不满足 | body 所有权已被消费 | parts extractor 放前，body extractor 放最后 |
| 大 body 被整体收集 | 内存峰值升高 | `Json`/`Bytes` 是聚合式提取 | 设置 limit；大上传改 streaming/multipart |
| `State` 类型推导失败 | 编译器无法确定子状态 | `FromRef` 路径不唯一或缺失 | 显式 state 类型并实现 `FromRef` |
| 可选参数吞掉真实错误 | 业务误判为缺失 | `Option<T>` 会改变 rejection 语义 | 区分 optional 与 invalid |

## 可迁移知识

把解析、验证、鉴权前置为带错误类型的参数转换，可让业务函数只接收已验证值。关键是把“只借用元数据”和“消费数据流”的能力拆成不同 trait，以类型系统约束副作用。

> **面试锚点**
> - `FromRequestParts` 与 `FromRequest` 为什么分开？
> - 为什么 body extractor 必须放最后？
> - Rejection 如何变成 HTTP 响应？

## Related

- [Handler 泛型分派](/notes/source/rust/axum/handler/)
- [路由与状态共享](/notes/source/rust/axum/routing-state/)
- [Serde 反序列化访问协议](/notes/source/rust/serde/deserializer/)
