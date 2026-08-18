---
title: Hyper 面试专题
description: Hyper HTTP/1/2 状态机、Body 背压、单连接 API 与运行时抽象的源码级高频题。
category: Backend
tags: [Source Reading, Hyper, Rust, Interview]
order: 39
updatedDate: 2026-08-17
difficulty: advanced
status: stable
lastReviewed: 2026-08-17
draft: false
sidebar:
  order: 39
---

Hyper 面试应把协议、连接、Body 和运行时分开回答。把 Hyper 说成“Rust Web 框架”通常意味着没有读到它的边界。

<!-- more -->

## 1. Hyper 的定位是什么

它是 HTTP 协议库：把异步字节流驱动成 Request/Response 与 Body frame，并用 Service 调业务。路由、模板、鉴权和高层连接池不属于核心。

## 2. HTTP/1 状态机由谁推进

`Conn` 保存解析、读写、keep-alive 等协议状态，`Dispatcher::poll_inner` 同时推进读 head、service callback、写 body 和 flush。源码：`proto/h1/conn.rs:38`、`proto/h1/dispatch.rs:143-245`。

## 3. 为什么不能一次 read 就当成一个请求

TCP 是字节流，会出现半包和多条消息共存；HTTP body 还有 Content-Length、chunked、close-delimited 等 framing。Hyper 在 read buffer 上增量解析。

## 4. Body 为什么不是 `Vec<u8>`

为了流式传输、trailer、错误和端到端背压。`Incoming::poll_frame` 在 `body/incoming.rs:186-275` 根据 HTTP/1 channel 或 h2 stream 逐 frame 产出数据。

## 5. 不消费 body 为什么影响连接复用

HTTP/1 必须读到本条消息边界，才能确认后续字节属于下一响应；未 drain 时把连接回池会造成协议错位。HTTP/2 虽按 stream 隔离，也会影响 flow-control window。

## 6. handshake 为什么返回 `SendRequest` 和 `Connection`

前者是应用提交请求的 handle，后者是必须持续 poll 的 IO driver。分离后业务与连接状态机可在不同 task 上运行。源码：`client/conn/http1.rs:555-586`。

## 7. Hyper 1.x 的连接池在哪里

不在核心。`src/client/mod.rs` 明确只提供单连接 API；高层池与 connector 通常在 `hyper-util`。回答时不要套用 0.14 的 `hyper::Client` 结构。

## 8. HTTP/2 多路复用是否消除了队头阻塞

消除了 HTTP/1 应用层流水线的队头阻塞，但 TCP 丢包仍会让同连接 stream 一起等待；连接级和 stream 级 flow control 也可能产生资源竞争。

## 9. 为什么 Hyper 自定义 Read/Write/Executor/Timer

避免锁定 Tokio，并支持自定义 runtime、测试 IO 与 FFI。接口只覆盖协议状态机需要的最小能力。源码：`rt/io.rs:74`、`:94`、`rt/mod.rs:45`、`rt/timer.rs:70`。

## 10. HTTP/1 CPU 空转怎么排查

```text
poll 循环是否反复 Ready 但无进展
  -> IO 实现错误唤醒？
  -> body producer 自唤醒风暴？
  -> flush 一直返回零进展？
  -> 半关闭/解析错误状态未收敛？
```

结合 poll 次数、read/write 字节、wake 数、Dispatcher 状态和系统调用追踪定位。

## 11. 连接偶发 `incomplete message` 的常见原因

对端提前关闭、Content-Length 与真实 body 不符、代理截断、超时取消、复用未 drain 的连接，或 upgrade/half-close 处理错误。需要同时看协议日志与连接池生命周期。

## 12. 一句话总结 Hyper

Hyper 用显式协议状态机驱动 HTTP/1，用 h2 crate 驱动 HTTP/2，用 pull-based Body 传播背压，并通过最小 rt trait 与具体异步运行时解耦。

## Related

- [Hyper 整体架构](/notes/source/rust/hyper/architecture/)
- [HTTP/1 状态机](/notes/source/rust/hyper/http1-state-machine/)
- [Body 与背压](/notes/source/rust/hyper/body/)
