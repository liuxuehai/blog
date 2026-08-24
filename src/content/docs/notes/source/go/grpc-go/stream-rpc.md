---
title: grpc-go RPC Stream 与重试
description: grpc-go unary/stream 统一调用模型、消息编解码、Picker、重试缓冲与提交点。
category: Backend
tags: [Source Reading, gRPC, Go, Stream]
order: 44
updatedDate: 2026-08-24
difficulty: advanced
status: stable
lastReviewed: 2026-08-24
draft: false
sidebar:
  order: 44
---

grpc-go 在客户端把 unary RPC 也实现成“发送一条消息、关闭发送端、接收一条响应”的特殊 stream。这样 metadata、压缩、Picker、transport、状态和重试逻辑可以共享。

<!-- more -->

## 先给答案：grpc-go 在客户端把 unary RPC 也实现成“发送一条消息、关闭发送端、接收一条响应”的特殊 …

grpc-go 在客户端把 unary RPC 也实现成“发送一条消息、关闭发送端、接收一条响应”的特殊 stream。这样 metadata、压缩、Picker、transport、状态和重试逻辑可以共享。 正文沿“统一调用路径 -> 一次 attempt -> 提交点”展开：先确认入口和状态归属，再跟踪控制流或数据流的推进，最后落到对外可观察的结果。

主要失效边界集中在“非幂等写开启重试、流式请求持续发送、WaitForReady 无截止时间”这些场景。它们破坏的是容量、顺序、并发或生命周期前提；排查时应先确认状态是否仍由正确对象持有，再核对推进条件和清理路径。

## 统一调用路径

```text
ClientConn.Invoke
  +-> newClientStream(unary StreamDesc)
  +-> SendMsg(request)
  +-> CloseSend
  +-> RecvMsg(response)
  +-> RecvMsg -> trailers / EOF

streaming stub
  +-> NewStream
  +-> SendMsg / RecvMsg ...
```

unary 入口位于 `call.go:63-95`，它直接复用 `newClientStream`。stream 创建先校验 outgoing metadata、等待首次解析结果并读取 method config：`stream.go:289-385`；之后通过 Picker 取得 SubConn 和 transport，再创建底层 HTTP/2 stream。

## 一次 attempt

一次逻辑 RPC 可以包含多个 attempt：

```text
logical clientStream
  +-> attempt 1: pick -> transport.NewStream -> send
  +-> attempt 2: replay buffered ops
  +-> commit: 后续不再切换 attempt
```

发送和接收入口分别是 `stream.go:1040-1110`、`:1111-1165`。`withRetry` 包装可重放操作，失败后依据 retry policy、节流器和 RPC 状态决定是否新建 attempt：`:884-980`。

## 提交点

重试不是任意时刻都安全。`commitAttemptLocked` 会选定当前 attempt、释放重试缓冲并执行 commit 回调：`stream.go:750-790`。收到有效响应头、缓冲超限或某些不可重试结果后，RPC 被提交，之后的错误直接返回调用方。

透明重试解决“服务端明确未处理”的 transport 失败；策略重试则依赖 service config 的状态码、次数和 backoff。两者都受 context deadline 约束。

## 边界与踩坑

| 场景 | 风险 | 处理 |
| --- | --- | --- |
| 非幂等写开启重试 | 服务端可能重复执行 | 使用幂等键或禁用策略重试 |
| 流式请求持续发送 | 重试缓冲增长 | 关注 buffer limit 与提交时机 |
| WaitForReady 无截止时间 | 调用长期等待 Picker | 必须设置 deadline |
| 只看最终状态 | 看不到多次 attempt | 接入 stats/metrics 观察重试 |

## 可迁移知识

可靠重试需要定义“请求是否被处理”和“结果何时提交”，而不只是捕获网络错误后再调用一次。

> **面试锚点**
> - unary RPC 为什么可以复用 stream 实现？
> - transparent retry 与 configured retry 有什么区别？
> - 哪些事件会让 client stream 提交、不能再重试？

## Related

- [HTTP/2 Transport 与流控](/notes/source/go/grpc-go/http2-transport/)
- [Resolver 与 Balancer](/notes/source/go/grpc-go/resolver-balancer/)
- [etcd Watch 事件流](/notes/source/go/etcd/watch/)

