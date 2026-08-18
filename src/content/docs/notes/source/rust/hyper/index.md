---
title: Hyper
description: Hyper 源码解析总览：HTTP/1 状态机、HTTP/2、Body、单连接 API 与运行时抽象。
category: Backend
tags: [Source Reading, Hyper, Rust, HTTP]
order: 3
updatedDate: 2026-08-17
difficulty: advanced
status: stable
lastReviewed: 2026-08-17
draft: false
sidebar:
  order: 3
---

Hyper 是 Rust HTTP 生态的协议引擎：它负责把异步字节流驱动成 HTTP/1 或 HTTP/2 消息与 body stream，但刻意不包办 DNS、连接建立、连接池和具体异步运行时。Axum 等框架在它之上提供路由与业务抽象。

<!-- more -->

## 版本快照

| 项 | 值 |
| --- | --- |
| 仓库 | `hyperium/hyper` |
| 本地路径 | `E:\source\rust\hyper` |
| 分支 | `master` |
| Commit | `fca07bd3`（2026-08-12） |
| Hyper | `1.11.0`，tag `v1.11.0` |
| Rust MSRV | `1.63` |

> 本册源码坐标均基于该 commit。Hyper 1.x 核心只提供单连接 client API；连接池、legacy client 与 Tokio 适配通常由 `hyper-util` 承担，不能再按 Hyper 0.14 的结构寻找 `Client` 池。

## 主调用链

```text
Async Read/Write
  -> client/server conn Builder
  -> HTTP/1 Dispatcher + Conn
     or HTTP/2 h2 connection
  -> Service<Request>
  -> Response<Body>
  -> frame/data/trailers
```

## 本册目录

- [整体架构](/notes/source/rust/hyper/architecture/)：协议层、运行时抽象与 Service 边界
- [HTTP/1 状态机](/notes/source/rust/hyper/http1-state-machine/)：parse、dispatch、body framing、flush 与 keep-alive
- [HTTP/2 与 h2](/notes/source/rust/hyper/http2/)：stream 并发、流控、执行器和 graceful shutdown
- [Body 与背压](/notes/source/rust/hyper/body/)：Frame、Incoming、channel、size hint 与 trailer
- [客户端单连接与连接复用](/notes/source/rust/hyper/client-connection/)：handshake、SendRequest、driver task 与池化边界
- [运行时与 IO 抽象](/notes/source/rust/hyper/runtime-io/)：Read、Write、Executor、Timer 与升级
- [面试专题](/notes/source/rust/hyper/interview/)：源码级 HTTP 状态机与线上排障题

## Related

- [Rust 源码解析](/notes/source/rust/)
- [Axum 整体架构](/notes/source/rust/axum/architecture/)
- [Tokio IO Driver](/notes/source/rust/tokio/io-driver/)
