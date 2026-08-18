---
title: Hyper 整体架构
description: Hyper 的协议驱动、Service、Body、运行时接口以及 HTTP/1 与 HTTP/2 分层。
category: Backend
tags: [Source Reading, Hyper, Rust, Architecture]
order: 30
updatedDate: 2026-08-17
difficulty: advanced
status: stable
lastReviewed: 2026-08-17
draft: false
sidebar:
  order: 30
---

Hyper 的核心是“协议状态机 + 异步 IO 抽象”，不是 Web 框架。它既不认识路由，也不要求底层必须是 Tokio socket。

<!-- more -->

## 模块地图

```text
public conn API
  client::conn / server::conn
           |
proto -----+--------------------
  h1: parse + Conn + Dispatcher
  h2: adapter over h2 crate
           |
service::Service<Request>
body::Body / Incoming
           |
rt::Read + Write + Executor + Timer
```

公开模块入口在 `src/lib.rs`；客户端连接模块在 `src/client/conn/mod.rs`，服务端连接模块在 `src/server/conn/mod.rs`。统一服务协议 `Service<Request>` 定义于 `src/service/service.rs:32-44`，运行时执行器位于 `src/rt/mod.rs:45-48`，IO trait 位于 `src/rt/io.rs:74-109`，定时器 trait 位于 `src/rt/timer.rs:70-88`。

## 协议分层

| 层 | HTTP/1 | HTTP/2 |
| --- | --- | --- |
| 公开 Builder | `server/conn/http1.rs:72` | `server/conn/http2.rs:42` |
| 连接 Future | `server/conn/http1.rs:40` | `server/conn/http2.rs:29` |
| 核心驱动 | `proto/h1/dispatch.rs:22` | `proto/h2/server.rs` |
| 编解码 | `proto/h1/role.rs`、`decode.rs`、`encode.rs` | `h2` crate stream/frame |
| body 接入 | `body::Incoming` | `body::Incoming` |

## 一次服务端请求

```text
poll Connection
  -> protocol reads head/frame
  -> build Request<Incoming>
  -> Service::call(request)
  -> poll response future
  -> poll response Body frames
  -> encode/write
  -> keep-alive or shutdown
```

HTTP/1 的主循环由 `Dispatcher::poll_inner` 驱动（`src/proto/h1/dispatch.rs:143-245`），读 head 在 `dispatch.rs:301-354`，写响应在 `dispatch.rs:356-449`。HTTP/2 服务端则由 h2 connection 产出新 stream，再为每个请求调用 service（`src/proto/h2/server.rs`）。

## 关键取舍

**替代方案**：直接依赖 Tokio 的 `AsyncRead/AsyncWrite`、spawn 和 sleep。

**为什么不选**：会把协议库锁死在单一运行时，也让嵌入式、FFI、自定义 executor 与测试 IO 更难接入。

**证据**：Hyper 自定义最小 `Read` / `Write` / `Executor` / `Timer` trait（`rt/io.rs:74`、`:94`、`rt/mod.rs:45`、`rt/timer.rs:70`），具体运行时通过适配器接入。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| 只保留 `SendRequest` 不驱动 Connection | 请求挂起 | IO 状态机 Future 没被 poll | 单独 spawn/await connection driver |
| 不消费 response body | HTTP/1 连接不能安全复用 | framing 未走到消息边界 | drain body 或主动丢弃连接 |
| 把应用错误直接返回连接层 | 连接被关闭 | Service 错误属于协议驱动失败 | 框架层先转成 Response |
| 以为 Hyper 自带高层池 | 找不到 API | 1.x 核心聚焦单连接 | 使用 `hyper-util` 或自行管理 |

## 可迁移知识

协议库应只依赖最小运行时能力，并把业务处理抽象为 request-to-future service。这样同一状态机既可用于客户端、服务端、代理、测试与 FFI，也便于替换运行时。

> **面试锚点**
> - Hyper 为什么不是 Web 框架？
> - HTTP/1 与 HTTP/2 在 Hyper 中共享哪些抽象？
> - 为什么要自定义 rt trait？

## Related

- [HTTP/1 状态机](/notes/source/rust/hyper/http1-state-machine/)
- [HTTP/2 与 h2](/notes/source/rust/hyper/http2/)
- [Axum Tower Service 适配层](/notes/source/rust/axum/tower-service/)
