---
title: grpc-go Server 生命周期
description: grpc-go Server 的服务注册、Accept 循环、HTTP/2 握手、RPC 分派与优雅停止。
category: Backend
tags: [Source Reading, gRPC, Go, Server]
order: 41
updatedDate: 2026-08-17
difficulty: advanced
status: stable
lastReviewed: 2026-08-17
draft: false
sidebar:
  order: 41
---

`grpc.Server` 负责把静态服务描述和动态网络连接接起来。它先注册 `ServiceDesc`，再在 `Serve` 中接收连接、完成 HTTP/2 transport 初始化，最后按 method 路由到生成代码提供的 handler。

<!-- more -->

## 启动链路

```text
NewServer(options)
  |
RegisterService(ServiceDesc, impl)
  |
Serve(listener)
  +-> Accept
  +-> handleRawConn
       +-> TLS / HTTP2 handshake
       +-> addConn
       +-> serveStreams
            +-> HandleStreams
            +-> handleStream
            +-> interceptor -> generated handler
```

构造位于 `server.go:702-754`，服务必须在 `Serve` 前通过 `RegisterService` 注册：`server.go:756-800`。`Serve` 的 Accept 循环会对临时错误指数退避，并为每个原始连接启动独立 goroutine：`server.go:896-985`。

## 从连接到 RPC

`handleRawConn` 设置握手超时、创建 HTTP/2 transport、登记连接，再启动 stream 处理：`server.go:990-1016`。`serveStreams` 将 transport 解析出的每个 stream 交给 `handleStream`：`server.go:1061-1088`、`:1519-1610`。

当前实现用 `wrapUnaryHandler` 把 unary method 转成统一 `StreamHandler`，因此 unary 和 streaming 可以共享后续处理管线：`server.go:1268-1280`。`processRPC` 统一创建 `serverStream`，挂接 stats、binary log、codec 和 tracing：`:1282-1430`。

## 优雅停止

```text
GracefulStop
  +-> fire quit
  +-> close listeners
  +-> wait Serve goroutines
  +-> send GOAWAY / drain transports
  +-> wait active streams
  +-> close transports
```

`Stop` 与 `GracefulStop` 共用 `stop(graceful bool)`：`server.go:1658-1738`。立即停止直接关闭 transport；优雅停止先 drain，等待活跃 RPC 结束。grpc-go 本身不提供超时参数，调用方若需要硬截止，应在超时后再调用 `Stop`。

## 边界与踩坑

| 场景 | 风险 | 处理 |
| --- | --- | --- |
| Serve 后注册服务 | 并发路由表不一致 | 启动前完成全部注册 |
| 只调用 GracefulStop | 长流让退出永久等待 | 外层增加超时并兜底 Stop |
| Accept 临时错误 | 服务瞬时退出 | 内部退避重试，关注最终非临时错误 |
| handler panic | 进程退出 | 使用 recovery interceptor |

## 可迁移知识

优雅停机不是“关闭 listener”就结束，而是依次阻止新连接、通知现有连接排空、等待活跃请求，再释放 transport。

> **面试锚点**
> - `Serve` 为什么为 raw connection 和 stream 分别起 goroutine？
> - unary RPC 为什么也能走统一 stream 管线？
> - `GracefulStop` 为什么需要业务层超时兜底？

## Related

- [HTTP/2 Transport 与流控](/notes/source/go/grpc-go/http2-transport/)
- [拦截器链](/notes/source/go/grpc-go/interceptors/)
- [Kratos App 生命周期](/notes/source/go/kratos/app-lifecycle/)

