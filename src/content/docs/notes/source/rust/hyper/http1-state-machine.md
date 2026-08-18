---
title: HTTP/1 状态机
description: Hyper HTTP/1 的解析、读写状态、Dispatcher、Body framing、flush 和 keep-alive。
category: Backend
tags: [Source Reading, Hyper, HTTP1, State Machine]
order: 31
updatedDate: 2026-08-17
difficulty: advanced
status: stable
lastReviewed: 2026-08-17
draft: false
sidebar:
  order: 31
---

HTTP/1 看似是文本协议，生产实现却要同时处理增量解析、半包、body framing、Expect、upgrade、流水线、keep-alive 和半关闭。Hyper 把这些状态集中在 `Conn` 与 `Dispatcher`。

<!-- more -->

## 状态关系

```text
read head -> Reading::Body -> Reading::KeepAlive
    |              |                 |
    + parse error  + body eof        + next message

service call -> response head -> Writing::Body -> flush
                                      |
                               keep-alive / close
```

`Conn<I, B, T>` 定义于 `src/proto/h1/conn.rs:38-68`，其读取状态 `Reading` 和写入状态 `Writing` 位于 `conn.rs:974-988`。`Dispatcher<D, Bs, I, T>` 在 `src/proto/h1/dispatch.rs:22-31`，负责协调协议连接与 client/server dispatch。

## 增量解析

`Conn::poll_read_head` 位于 `conn.rs:211-340`：先尝试从已有 read buffer 解析，不够时再 poll IO；解析角色由 `Http1Transaction` 抽象，统一入口在 `src/proto/h1/role.rs:79-130`。Server 请求解析实现从 `role.rs:146` 开始，Client 响应解析从 `role.rs:1028` 开始。

解析完成后，header 决定 body framing：无 body、固定 `Content-Length`、chunked 或 close-delimited。对应解码状态在 `src/proto/h1/decode.rs:37-57`，编码状态在 `src/proto/h1/encode.rs:36-54`。

## Dispatcher 主循环

`Dispatcher::poll_inner`（`dispatch.rs:143-245`）反复推进四件事：

1. 写已有响应与 body；
2. flush 缓冲；
3. 在允许时读取下一消息 head；
4. poll service callback 或 body channel。

读 head 分支位于 `dispatch.rs:301-354`，写 body 位于 `dispatch.rs:356-449`，flush 位于 `dispatch.rs:451-457`。底层 `Buffered<T, B>` 在 `src/proto/h1/io.rs:32-50` 聚合读写缓冲，并在 `io.rs:271-327` 使用 vectored write 或 flatten 路径刷新。

### 为什么读写必须在同一个 poll 循环协调

**替代方案**：一个 task 只读，一个 task 只写，通过 channel 连接。

**为什么不行**：HTTP/1 的消息边界、Expect/upgrade、流水线与关闭决策相互影响；拆 task 会增加同步状态和竞态。

**证据**：`Dispatcher::poll_inner` 同时推进 read、write、flush 与 callback（`dispatch.rs:143-245`），连接状态是单一所有者。

## Keep-alive 的前提

连接是否复用不仅看 header，还要确保本次请求/响应 body 已完整走到边界、没有解析错误、没有 upgrade、对端没有异常关闭。未消费 body 时，高层池不能确认下一个字节属于新响应。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| Content-Length 不符 | 连接报 incomplete/关闭 | 消息边界不可信 | 让 Body size 与 header 一致 |
| response body 未 drain | 连接无法复用 | 尚未到下一个消息边界 | 消费到 EOF 或丢连接 |
| 慢 header 攻击 | 连接长期占资源 | 增量解析等待更多字节 | 配 header read timeout |
| upgrade 后继续由 HTTP 状态机读 | 协议混乱 | 所有权应交给 upgraded IO | 正确 await `OnUpgrade` |

## 可迁移知识

文本协议也应实现成显式读写状态机，而不是“一次 read 一条消息”。状态机必须把 framing、缓冲、业务回调和连接生命周期放进同一推进循环。

> **面试锚点**
> - HTTP/1 body 边界有哪几种？
> - Dispatcher 为什么同时推进读和写？
> - 不消费 body 为什么影响连接复用？

## Related

- [Body 与背压](/notes/source/rust/hyper/body/)
- [客户端单连接与连接复用](/notes/source/rust/hyper/client-connection/)
- [Netty 粘包拆包与编解码](/notes/source/java/base/netty/framing-decoder/)
