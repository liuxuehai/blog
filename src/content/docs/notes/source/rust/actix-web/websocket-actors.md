---
title: WebSocket Actor 集成
description: Actix Web 的 HTTP 升级、WebSocket codec、WebsocketContext、StreamHandler 与 mailbox 边界。
category: Backend
tags: [Source Reading, Actix Web, Actor, WebSocket]
order: 45
updatedDate: 2026-08-24
difficulty: advanced
status: stable
lastReviewed: 2026-08-24
draft: false
sidebar:
  order: 45
---

Actor 模型在 Actix Web 中最典型的落点是 WebSocket：HTTP 负责握手升级，`actix-http` 负责 frame codec，`actix-web-actors` 把入站 frame stream 和 Actor context 连接起来。

<!-- more -->

## 先给答案：Actor 模型在 Actix Web 中最典型的落点是 WebSocket：HTTP 负责握手升级，ac…

Actor 模型在 Actix Web 中最典型的落点是 WebSocket：HTTP 负责握手升级，actix-http 负责 frame codec，actix-web-actors 把入站 frame stream 和 Actor context 连接起来。 正文沿“升级链路 -> Actor 解决什么 -> StreamHandler”展开：先确认入口和状态归属，再跟踪控制流或数据流的推进，最后落到对外可观察的结果。

主要失效边界集中在“heartbeat 不处理 Pong、Actor handler 阻塞、无界广播到慢客户端”这些场景。它们破坏的是容量、顺序、并发或生命周期前提；排查时应先确认状态是否仍由正确对象持有，再核对推进条件和清理路径。

## 升级链路

```text
HTTP Request + Payload
  -> ws::start(actor, req, stream)
  -> validate handshake
  -> HttpResponse Switching Protocols
  -> WebsocketContext actor stream
  -> Codec decode Message
  -> StreamHandler::handle
  -> ctx.text/binary/ping/close
```

公开 `start` 位于 `actix-web-actors/src/ws.rs:303-320`，带地址返回的 `start_with_addr` 在 `:323-341`，协议协商版本在 `:344` 之后。builder 的 `start` / `start_with_addr` 分别在 `ws.rs:255-299`。

`WebsocketContext<A>` 定义于 `ws.rs:454-460`，实现 `ActorContext`（`:462-477`）、`AsyncContext`（`:479-653`）和 `AsyncContextParts`（`:655` 之后）。底层 WebSocket `Message` 与 `Codec` 位于 `actix-http/src/ws/codec.rs:15-34`、`:71-90`。

## Actor 解决什么

每条 WebSocket 连接有长生命周期状态、定时 heartbeat、入站 frame stream、出站消息与可能的外部 mailbox 消息。Actor context 把这些事件串行化到同一个逻辑实体，减少显式锁。

但普通短 HTTP handler 不经过 mailbox；只有显式使用 actor integration 的连接才进入这套模型。

## `StreamHandler`

WebSocket 入站 frame 被作为 stream item 注入 actor，业务实现 `StreamHandler<Result<ws::Message, ProtocolError>>` 处理 Text/Binary/Ping/Pong/Close。Actor context 同时可调度 interval、future 与 message handler，因此需要避免单次 handler 做长阻塞。

### 为什么 WebSocket actor 仍需要背压意识

**替代方案**：actor 收到业务消息后无限调用 `ctx.text`，假设网络会自行吸收。

**为什么不行**：慢客户端会让出站缓冲增长，mailbox 和应用消息也可能持续积压。

**证据**：底层是异步 WebSocket codec 和 body stream，不是无限容量 socket；actor 串行只解决共享状态，不自动解决容量控制。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| heartbeat 不处理 Pong | 健康连接被断开 | 活跃时间未刷新 | 明确 ping/pong 状态机 |
| Actor handler 阻塞 | 单连接事件停顿 | context 串行执行 | 异步 future/offload |
| 无界广播到慢客户端 | 内存上涨 | 出站没有业务级限流 | 限制 mailbox/队列，丢弃或断开 |
| 忘记 Close 握手 | 对端看到异常断开 | 直接 stop context | 发送 close frame 后收敛 |

## 可迁移知识

Actor 适合“每实体串行状态机”，例如长连接、会话、设备影子；它不等于自动高性能。仍需单独设计 mailbox 上限、网络背压和关闭协议。

> **面试锚点**
> - 普通 Actix Web HTTP 请求是否经过 Actor？
> - WebSocket Actor 如何接收 frame？
> - Actor 串行化为什么不能替代背压？

## Related

- [Actix Web 整体架构](/notes/source/rust/actix-web/architecture/)
- [Hyper 运行时与 IO 抽象](/notes/source/rust/hyper/runtime-io/)
- [Tokio 同步原语与背压](/notes/source/rust/tokio/sync-primitives/)
