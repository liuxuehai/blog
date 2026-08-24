---
title: 客户端单连接与连接复用
description: Hyper 1.x handshake、SendRequest、Connection driver、HTTP/1 独占与连接池边界。
category: Backend
tags: [Source Reading, Hyper, Client, Connection Pool]
order: 34
updatedDate: 2026-08-24
difficulty: advanced
status: stable
lastReviewed: 2026-08-24
draft: false
sidebar:
  order: 34
---

Hyper 1.x 核心 client API 面向单条已建立连接。DNS、TCP/TLS 连接、按 origin 选连接和空闲池淘汰属于更高层职责，通常由 `hyper-util` 实现。

<!-- more -->

## 先给答案：Hyper 1.x 核心 client API 面向单条已建立连接

Hyper 1.x 核心 client API 面向单条已建立连接。DNS、TCP/TLS 连接、按 origin 选连接和空闲池淘汰属于更高层职责，通常由 hyper-util 实现。 正文沿“HTTP/1 handshake -> HTTP/2 handshake -> HTTP/1 与 HTTP/2 复用差异”展开：先确认入口和状态归属，再跟踪控制流或数据流的推进，最后落到对外可观察的结果。

主要失效边界集中在“Connection Future 未 spawn、未先 ready() 就发送、HTTP/1 body 未消费就回池”这些场景。它们破坏的是容量、顺序、并发或生命周期前提；排查时应先确认状态是否仍由正确对象持有，再核对推进条件和清理路径。

## HTTP/1 handshake

```text
connected IO
  -> http1::handshake
      -> SendRequest<B>
      -> Connection<T, B> driver

application task --request--> dispatch channel --driver--> socket
```

HTTP/1 `SendRequest` 定义于 `src/client/conn/http1.rs:23-29`，连接 Future 在 `:61-73`，Builder 在 `:127-147`，handshake 在 `:555-586`。`SendRequest::poll_ready` 位于 `:164-177`，发送入口在 `:228-271`。

应用必须持续 poll `Connection`；只保留 handle 会让 dispatch channel 中的请求无人写入 socket。`poll_without_shutdown`（`client/conn/http1.rs:94-111`）用于 upgrade 等需要取回底层 IO 的场景。

## HTTP/2 handshake

HTTP/2 对应类型在 `client/conn/http2.rs:24-60`，Builder 在 `:67-80`，handshake 在 `:565-589`。`SendRequest` 可 clone，并允许多个并发 stream；发送路径在 `:161-205`。

## HTTP/1 与 HTTP/2 复用差异

| 维度 | HTTP/1 | HTTP/2 |
| --- | --- | --- |
| 同连接并发 | 通常一个 in-flight 请求 | 多 stream 并发 |
| handle | 顺序 dispatch | 可 clone/send 多请求 |
| body 未消费 | 阻断消息边界与复用 | 影响该 stream/流控 |
| 池 key | scheme/authority/TLS 等 | 还要考虑协商协议与共连能力 |

## 连接池为什么不在 Hyper 核心

**替代方案**：核心 crate 内置 connector、DNS、TLS 与连接池。

**为什么不选**：这些策略变化快且依赖环境；代理、Unix socket、自定义 DNS、不同 TLS 栈会放大 feature 与依赖矩阵。

**证据**：`src/client/mod.rs` 明确说明 Hyper 提供单连接 HTTP，连接主机和池化属于外部；核心公开 API 只暴露 `client::conn`。

## 高层池的正确性条件

把连接放回 idle pool 前至少要确认：

1. connection driver 仍健康；
2. HTTP/1 上一响应 body 已到边界；
3. 没有 upgrade 或 close 语义；
4. origin、TLS、ALPN 与连接 key 匹配；
5. idle timeout 与最大空闲数满足策略。

并发 checkout 还要处理“连接建立与空闲连接同时可用”的竞态，输掉的健康连接可回池，而不是直接浪费。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| Connection Future 未 spawn | 请求永远 Pending | 无 driver 推进 IO | handshake 后立即驱动 connection |
| 未先 `ready()` 就发送 | 遇到关闭/背压 | handle 未确认容量 | 遵循 poll_ready/ready 协议 |
| HTTP/1 body 未消费就回池 | 下一请求失败 | 字节流边界未清 | drain 或关闭连接 |
| 把所有 host 共用一池 | 证书/Host 错误 | pool key 不完整 | key 包含 scheme、authority、TLS 属性 |

## 可迁移知识

把“单连接协议正确性”与“多连接资源策略”分开：底层只证明一条连接如何驱动，高层池负责 key、健康检查、竞争与淘汰。分层后两者都更容易测试。

> **面试锚点**
> - Hyper 1.x 为什么没有高层 `Client` 池？
> - handshake 为什么返回两个对象？
> - 连接什么时候可以回池？

## Related

- [HTTP/1 状态机](/notes/source/rust/hyper/http1-state-machine/)
- [运行时与 IO 抽象](/notes/source/rust/hyper/runtime-io/)
- [grpc-go ClientConn](/notes/source/go/grpc-go/clientconn/)
