---
title: grpc-go
description: grpc-go 源码解析总览：ClientConn、HTTP/2 transport、stream、拦截器、名字解析与负载均衡。
category: Backend
tags: [Source Reading, gRPC, Go, RPC]
order: 5
updatedDate: 2026-08-17
difficulty: advanced
status: stable
lastReviewed: 2026-08-17
draft: false
sidebar:
  order: 5
---

grpc-go 把生成代码暴露的 RPC 调用，落实为名字解析、负载均衡、连接状态机、HTTP/2 多路复用、流控和状态传播。本册沿着“创建 channel、选取 SubConn、建立 transport、创建 stream、收发消息、关闭连接”的主线阅读源码。

<!-- more -->

## 版本快照

| 项 | 值 |
| --- | --- |
| 仓库 | `grpc/grpc-go` |
| 本地路径 | `E:\source\go\grpc-go` |
| 分支 | `master` |
| Commit | `bf9e7cd3`（2026-08-14） |
| 最近 tag | `v1.84.0-dev` |

> 本册源码坐标均基于该 commit；上游演进后行号可能漂移。

## 主调用链

```text
generated stub
    |
    v
ClientConn.Invoke / NewStream
    |
    +-> resolver -> service config -> balancer -> Picker
    +-> SubConn / addrConn -> HTTP/2 ClientTransport
    |
    v
clientStream -> HEADERS / DATA -> server transport
    |
    v
Server.handleStream -> interceptor chain -> generated handler
    |
    v
status + trailers
```

## 本册目录

- [整体架构](/notes/source/go/grpc-go/architecture/)：生成代码、channel、transport 与 handler 的边界
- [Server 生命周期](/notes/source/go/grpc-go/server-lifecycle/)：注册、监听、连接接入与优雅停止
- [ClientConn 与连接状态机](/notes/source/go/grpc-go/clientconn/)：target、idle、SubConn、退避与重连
- [HTTP/2 Transport 与流控](/notes/source/go/grpc-go/http2-transport/)：帧读写、loopyWriter、窗口与 BDP
- [RPC Stream 与重试](/notes/source/go/grpc-go/stream-rpc/)：统一 stream 模型、编解码、提交点与透明重试
- [拦截器链](/notes/source/go/grpc-go/interceptors/)：client/server unary/stream 四类扩展点
- [Resolver 与 Balancer](/notes/source/go/grpc-go/resolver-balancer/)：地址、服务配置、SubConn 和 Picker
- [Status、Metadata 与 Credentials](/notes/source/go/grpc-go/status-metadata-credentials/)：跨进程错误、上下文头和安全边界
- [面试专题](/notes/source/go/grpc-go/interview/)：源码级高频题与排障场景

## Related

- [Go 源码解析](/notes/source/go/)
- [Kratos gRPC 传输](/notes/source/go/kratos/grpc-transport/)
- [etcd 客户端与一致性读取](/notes/source/go/etcd/client/)

