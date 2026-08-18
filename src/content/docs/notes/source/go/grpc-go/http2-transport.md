---
title: grpc-go HTTP/2 Transport 与流控
description: grpc-go HTTP/2 client/server transport、帧读写、loopyWriter、窗口与 BDP 调整。
category: Backend
tags: [Source Reading, gRPC, Go, HTTP2]
order: 43
updatedDate: 2026-08-17
difficulty: advanced
status: stable
lastReviewed: 2026-08-17
draft: false
sidebar:
  order: 43
---

transport 层把一条 HTTP/2 连接复用为多个并发 RPC stream。读侧解析帧并更新 stream 状态，写侧通过 control buffer 和单独的 `loopyWriter` 串行写帧，从而避免多个业务 goroutine 直接竞争 socket。

<!-- more -->

## 连接内并发模型

```text
application goroutines
  +-> NewStream / Write
  +-> controlBuffer ------------------+
                                      v
reader goroutine <-> net.Conn <-> loopyWriter goroutine
      |                               |
      +-> HEADERS/DATA/RST            +-> frame batch / flush
      +-> stream state                +-> conn + stream quota
```

client/server transport 接口位于 `internal/transport/transport.go:610-694`。客户端连接初始化在 `http2_client.go:210-430`，服务端握手和 HTTP/2 参数协商在 `http2_server.go:151-350`。

## Stream 与帧

客户端 `NewStream` 分配奇数 stream ID、检查并发上限、编码请求头并放入 control buffer：`http2_client.go:778-900`。服务端 `HandleStreams` 持续读取帧，收到 HEADERS 后创建 `ServerStream`，DATA/WINDOW_UPDATE/RST_STREAM 则更新已有 stream：`http2_server.go:639-735`。

写操作不直接调用 `net.Conn.Write`。`loopyWriter.run` 消费控制项、维护活跃 stream 链表、按连接和 stream 配额调度 DATA，并批量 flush：`internal/transport/controlbuf.go:522-650`。

## 两级流控与 BDP

| 配额 | 作用 |
| --- | --- |
| connection window | 限制整条连接未确认数据 |
| stream window | 防止单个 RPC 独占连接 |
| write quota | 对发送方施加背压 |

基础流控结构位于 `flowcontrol.go:30-168`。动态窗口模式通过 ping 测量往返时间和接收字节，估算带宽时延积并调整窗口：`bdp_estimator.go:49-143`。

## 关键取舍

**替代方案**：每个 stream goroutine 自己写 HTTP/2 帧。

**问题**：帧交错、窗口竞争和批量刷新很难保持一致，还会增加锁竞争与小写操作。

**设计**：业务 goroutine 生产控制项，单 writer goroutine 持有帧序列化和流控状态。

## 边界与踩坑

| 场景 | 风险 | 处理 |
| --- | --- | --- |
| 消费端长期不 RecvMsg | stream 窗口耗尽 | 持续读取或及时取消 |
| 大消息并发 | 连接窗口和内存同时承压 | 限制消息大小与并发流数 |
| 自定义窗口过小 | 吞吐受 RTT 放大 | 保持动态窗口或按链路测试 |
| 忽略 GOAWAY | 新 stream 失败 | 由 ClientConn 迁移到新 transport |

## 可迁移知识

多路复用协议的核心不是共享一条连接，而是用单写循环、每流状态和分层流控保证共享连接仍然公平且可控。

> **面试锚点**
> - grpc-go 为什么使用 loopyWriter？
> - connection window 和 stream window 如何配合？
> - BDP estimator 为什么能提高高带宽高延迟链路吞吐？

## Related

- [RPC Stream 与重试](/notes/source/go/grpc-go/stream-rpc/)
- [Server 生命周期](/notes/source/go/grpc-go/server-lifecycle/)
- [Netty ByteBuf 与池化](/notes/source/java/base/netty/bytebuf-pool/)
