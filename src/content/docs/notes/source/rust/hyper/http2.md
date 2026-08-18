---
title: HTTP/2 与 h2
description: Hyper 如何适配 h2 crate，管理多 stream、流控、执行器、ping 与 graceful shutdown。
category: Backend
tags: [Source Reading, Hyper, HTTP2, Flow Control]
order: 32
updatedDate: 2026-08-17
difficulty: advanced
status: stable
lastReviewed: 2026-08-17
draft: false
sidebar:
  order: 32
---

Hyper 不重复实现 HTTP/2 frame codec，而是在 `h2` crate 之上完成 HTTP 类型、Body、Service 与运行时的适配。核心变化是：一个连接上同时存在多个独立 stream。

<!-- more -->

## 连接与 stream

```text
TCP connection
  -> h2::Connection
       +-> stream 1: Request / Response / flow control
       +-> stream 3: Request / Response / flow control
       +-> stream 5: Request / Response / flow control
  -> GOAWAY / ping / graceful shutdown
```

客户端公开连接类型在 `src/client/conn/http2.rs:50-60`，Builder 在 `:67-80`，handshake 在 `:565-589`。服务端连接类型在 `src/server/conn/http2.rs:29-37`，Builder 在 `:42-55`。底层客户端 handshake 最终进入 `src/proto/h2/client.rs`，服务端进入 `src/proto/h2/server.rs`。

## 客户端分派

HTTP/2 `SendRequest` 的 `poll_ready` 主要检查连接是否关闭（`client/conn/http2.rs:101-109`），发送入口在 `:161-205`。协议 task 从 dispatch channel 取请求，等待 h2 send stream ready，再调用 `send_request` 建立新 stream；关键逻辑位于 `proto/h2/client.rs:680-760`。

与 HTTP/1 不同，ready 不代表连接一次只接收一个请求；并发上限由 HTTP/2 settings、h2 内部 stream capacity 与流控共同决定。

## 服务端分派

h2 connection 接受新 stream 后，把 `Request<Incoming>` 交给 Service；每个响应 Future 需要执行器驱动，因此 HTTP/2 Builder 必须持有 `Executor`。公开 Builder 的执行器类型参数 `E` 体现在 `server/conn/http2.rs:42`，通用执行协议在 `src/rt/mod.rs:45-48`。

## Body 与流控

发送 DATA 前必须取得 stream capacity；接收端消费 DATA 后释放 capacity。Hyper 的 `Incoming` 把 h2 `RecvStream` 包装为 `Body`，在 `src/body/incoming.rs:56-85` 的 `Kind::H2` 分支保存流与 ping recorder，`poll_frame` 在 `incoming.rs:186-275` 推进数据和 trailer。

### 为什么 HTTP/2 仍然需要背压

**替代方案**：既然多路复用，就把所有响应 body 一次性写入连接缓冲。

**为什么不行**：单个慢消费者会耗尽连接内存和 flow-control window，并拖累其他 stream。

**证据**：发送路径在 h2 stream 上等待 capacity，接收路径只有在应用 poll `Incoming` 时才继续消费 frame；背压贯穿 Body 与协议层。

## graceful shutdown

优雅关闭先停止接受新 stream，发送 GOAWAY，再等待已存在 stream 完成。HTTP/2 的关闭是连接级与 stream 级状态的组合，不等于直接 drop socket。ping 逻辑独立在 `src/proto/h2/ping.rs`，可用于 keepalive 与 BDP 估计。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| Executor 不再调度响应 Future | stream 卡住 | 每个 stream 的 service future 无人 poll | 提供可靠 executor |
| 大 body 忽视流控 | 其他 stream 延迟 | 占满连接窗口 | 按 frame 流式发送并尊重 capacity |
| 把 GOAWAY 当全部失败 | 重试放大 | 低编号 stream 可能已被处理 | 根据 last-stream-id 与幂等性决策 |
| HTTP/2 keepalive 太激进 | 对端断链 | ping 策略不兼容 | 按代理/LB 约束配置 |

## 可迁移知识

多路复用协议需要“连接级控制 + 子流级状态 + 公平流控”。共享底层并不取消背压，反而要求更细粒度地隔离慢流。

> **面试锚点**
> - Hyper 为什么依赖 h2 crate？
> - HTTP/2 `poll_ready` 与 HTTP/1 有何不同？
> - GOAWAY 后哪些请求可以重试？

## Related

- [Body 与背压](/notes/source/rust/hyper/body/)
- [运行时与 IO 抽象](/notes/source/rust/hyper/runtime-io/)
- [grpc-go HTTP/2 Transport](/notes/source/go/grpc-go/http2-transport/)
