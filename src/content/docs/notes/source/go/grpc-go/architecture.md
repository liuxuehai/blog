---
title: grpc-go 整体架构
description: grpc-go 从生成代码到 ClientConn、transport、Server 和业务 handler 的模块边界。
category: Backend
tags: [Source Reading, gRPC, Go, Architecture]
order: 40
updatedDate: 2026-08-17
difficulty: advanced
status: stable
lastReviewed: 2026-08-17
draft: false
sidebar:
  order: 40
---

grpc-go 的核心不是“远程函数调用”这一层语法糖，而是把服务描述、连接治理和 HTTP/2 流状态机分开。生成代码只负责类型安全入口，运行时负责把一次调用送到可用连接并维护跨进程语义。

<!-- more -->

## 模块地图

```text
generated *.pb.go
  |
  +-> ServiceDesc / MethodDesc -> grpc.Server
  |
  +-> ClientConnInterface -> grpc.ClientConn
                              |
            +-----------------+------------------+
            |                 |                  |
         resolver          balancer          interceptor
            |                 |
          State      SubConn + Picker
                              |
                       internal/transport
                              |
                           HTTP/2
```

服务端以 `Server` 保存 listener、transport 连接、服务描述和拦截器：`server.go:126-177`；注册入口是 `RegisterService`：`server.go:756-800`。客户端的长生命周期 channel 是 `ClientConn`：`clientconn.go:668-735`，底层连接由 `addrConn` 和 `ClientTransport` 承担。

## 分层边界

| 层 | 负责 | 不负责 |
| --- | --- | --- |
| 生成代码 | 方法签名、序列化类型、ServiceDesc | 连接管理 |
| `ClientConn` | resolver/balancer、状态和调用配置 | HTTP/2 帧细节 |
| balancer | 管理 SubConn、发布 Picker | 直接发送 RPC |
| transport | stream、帧、流控、keepalive | 业务路由 |
| Server | 服务查找、拦截器、handler 调用 | 服务发现 |

`ClientTransport` 与 `ServerTransport` 的接口位于 `internal/transport/transport.go:610-694`；resolver 和 balancer 的核心接口分别位于 `resolver/resolver.go:232-329`、`balancer/balancer.go:139-365`。

## 关键取舍

**替代方案**：每次 RPC 独立解析地址、拨号并关闭连接。

**问题**：无法复用 HTTP/2 连接，解析和握手成本进入请求热路径，也无法维护持续的连接状态与负载反馈。

**设计**：`ClientConn` 作为长生命周期 channel，控制面持续更新 Picker，数据面只在调用时选连接并创建 stream。

## 边界与踩坑

| 场景 | 风险 | 处理 |
| --- | --- | --- |
| 把 ClientConn 当单连接 | 误判连接数和状态 | 它可能管理多个 SubConn/transport |
| 在 handler 中处理协议帧 | 业务与 HTTP/2 耦合 | 使用 stream/status/metadata API |
| 生成代码版本漂移 | ServiceDesc 约定不匹配 | protobuf 与 grpc 插件版本配套 |
| 只观察 TCP 成功 | RPC 仍可能无可用 Picker | 同时观察 channel、SubConn 和 RPC 状态 |

## 可迁移知识

高性能 RPC 运行时通常要把控制面与数据面拆开：解析和连接状态异步收敛，调用热路径只做配置匹配、节点选择和流创建。

> **面试锚点**
> - `ClientConn` 为什么不是一条物理连接？
> - 生成代码、Server 和 transport 的职责如何分离？
> - resolver 与 balancer 为什么不直接参与帧收发？

## Related

- [Server 生命周期](/notes/source/go/grpc-go/server-lifecycle/)
- [ClientConn 与连接状态机](/notes/source/go/grpc-go/clientconn/)
- [Kratos 整体架构](/notes/source/go/kratos/architecture/)

