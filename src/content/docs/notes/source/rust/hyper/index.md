---
title: Hyper
description: Hyper 源码解析总览：HTTP/1 状态机、HTTP/2、Body、单连接 API 与运行时抽象。
category: Backend
tags: [Source Reading, Hyper, Rust, HTTP]
order: 3
updatedDate: 2026-08-22
difficulty: advanced
status: stable
lastReviewed: 2026-08-22
draft: false
sidebar:
  order: 3
---

Hyper 是 Rust HTTP 生态的协议引擎：它负责把异步字节流驱动成 HTTP/1 或 HTTP/2 消息与 body stream，但刻意不包办 DNS、连接建立、连接池和具体异步运行时。Axum 等框架在它之上提供路由与业务抽象。

<!-- more -->

## 本册问题地图

Hyper 要围绕协议状态机和运行时 IO 的边界来读：

1. **HTTP/1 为什么是状态机？** 请求行、headers、body、响应和 keep-alive 的合法顺序必须被逐步验证，解析器不能把整个连接当成一段无结构字节。
2. **Body 为什么是流？** 大响应不必一次性加载到内存，消费者按 poll 获取数据；背压意味着上游只有在下游准备好时继续生产。
3. **HTTP/2 与 HTTP/1 的关键差别是什么？** HTTP/2 在一条连接上复用多个 stream，并引入独立流控；连接级和 stream 级状态都可能阻塞请求。
4. **运行时 IO 如何接入？** Hyper 只依赖 AsyncRead/AsyncWrite 等抽象，具体 reactor、线程模型和唤醒机制由 Tokio 等运行时提供。
5. **连接复用何时失效？** 协议错误、响应 body 未消费、服务端关闭和池策略都会让连接无法回收，不能只看 TCP 是否还活着。

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
