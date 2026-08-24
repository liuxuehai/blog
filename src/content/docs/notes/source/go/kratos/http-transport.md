---
title: Kratos HTTP 传输
description: Kratos HTTP server、Context、路由、编解码和服务发现客户端。
category: Backend
tags: [Source Reading, Kratos, Go, HTTP]
order: 32
updatedDate: 2026-08-24
difficulty: advanced
status: stable
lastReviewed: 2026-08-24
draft: false
sidebar:
  order: 32
---

Kratos 的 HTTP 层在标准库 `http.Server` 外包了一层路由、请求绑定、响应编码、operation middleware 和 discovery client。它保留 net/http 的可组合性，同时提供 RPC 风格的统一上下文。

<!-- more -->

## 先给答案：Kratos 的 HTTP 层在标准库 http.Server 外包了一层路由、请求绑定、响应编码、ope…

Kratos 的 HTTP 层在标准库 http.Server 外包了一层路由、请求绑定、响应编码、operation middleware 和 discovery client。它保留 net/http 的可组合性，同时提供 RPC 风格的统一上下文。 正文沿“Server 组装 -> Context 边界 -> Client 与 discovery”展开：先确认入口和状态归属，再跟踪控制流或数据流的推进，最后落到对外可观察的结果。

主要失效边界集中在“HTTP Context 统一了 Vars、Query、Form、Bind、Returns 和多种响应方法：transport/http/context.go:20-42”这些场景。它们破坏的是容量、顺序、并发或生命周期前提；排查时应先确认状态是否仍由正确对象持有，再核对推进条件和清理路径。

## Server 组装

```text
NewServer(opts)
   |
   +-> mux.Router
   +-> request decoders
   +-> response/error encoders
   +-> matcher middleware
   +-> FilterChain(router)
   |
Start -> listenAndEndpoint -> http.Server.Serve
```

默认值和组装在 `transport/http/server.go:150-197`：tcp、`:0`、超时、decoder、encoder 和严格斜杠都在构造期固定。服务 middleware 按 operation 由 `Use` 写入 matcher：`:200-206`。

## Context 边界

HTTP `Context` 统一了 `Vars`、`Query`、`Form`、`Bind`、`Returns` 和多种响应方法：`transport/http/context.go:20-42`。wrapper 通过 `transport.FromServerContext` 获得 operation，并按路由选择 middleware：`:93-102`。

这使生成代码可以面向 Kratos Context 编程，同时仍能访问原始 request/response。`responseWriter` 延迟写入状态码，避免 encoder 之前无法修改响应状态：`:44-59`。

## Client 与 discovery

`NewClient` 先解析 endpoint，再根据 `discovery://` 选择 resolver：`transport/http/client.go:161-208`。调用时编码 request、写入 header、创建 `Transporter` context，再进入 middleware 和真正的 HTTP 请求：`:211-256`。

## 设计取舍

**替代方案**：只暴露原生 `http.Handler`，让每个项目自行实现绑定和错误编码。
**问题**：服务端与客户端的 operation、metadata 和错误协议无法统一。
**设计**：在标准库之上增加薄 Context，保留 `Handle`、`HandleFunc`、`WalkRoute` 等原生能力。

## 边界与踩坑

| 场景 | 风险 | 处理 |
| --- | --- | --- |
| `:0` 端口 | 注册前地址未知 | 让 server Endpoint 推导真实监听地址 |
| 先写 body 后写 status | 状态码已发送 | 使用 `Result`/encoder 统一输出 |
| discovery 无实例 | 客户端无节点 | resolver 保留旧状态或返回错误 |
| 自定义 Filter | 与 service middleware 顺序混淆 | 区分 HTTP filter 和 operation middleware |

## 可迁移知识

协议适配层最好只做语义归一化，把业务 handler 与底层 header、body、连接对象隔离开。

> **面试锚点**
> - Kratos HTTP Context 为什么不直接替代 `context.Context`？
> - HTTP filter 与 middleware 的职责如何区分？
> - discovery client 何时建立 watcher？

## Related

- [gRPC 传输](/notes/source/go/kratos/grpc-transport/)
- [Middleware 链](/notes/source/go/kratos/middleware/)
- [Gin Context 与 middleware](/notes/source/go/gin/context-pool/)
