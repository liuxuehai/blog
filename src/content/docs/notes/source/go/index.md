---
title: Go 源码解析
description: Gin、go-zero、etcd、Kratos 与 grpc-go 的源码解析索引。
category: Backend
tags: [Source Reading, Go]
order: 3
updatedDate: 2026-08-17
difficulty: advanced
status: learning
lastReviewed: 2026-08-17
draft: false
sidebar:
  order: 3
---

Go 分组聚焦 HTTP 框架、服务治理、共识存储、依赖注入和 RPC 传输层的实现取舍。

<!-- more -->

## 分册

| 仓库 | 主题 | 状态 |
| --- | --- | --- |
| [Gin](/notes/source/go/gin/) | Radix 树路由、Context 池化、中间件链、参数绑定 | ✅ 7 篇 |
| [go-zero](/notes/source/go/go-zero/) | 熔断、限流、缓存一致性、zrpc 与代码生成 | ✅ 9 篇 |
| [etcd](/notes/source/go/etcd/) | Raft、WAL、MVCC、Watch 与 Lease | ✅ 9 篇 |
| [kratos](/notes/source/go/kratos/) | 分层、App 生命周期、传输抽象与 middleware | ✅ 9 篇 |
| [grpc-go](/notes/source/go/grpc-go/) | HTTP/2、流控、拦截器、名字解析与负载均衡 | ✅ 9 篇 |

## 阅读顺序

先读 Gin，建立“HTTP 请求进入路由、Context 和 middleware”的基础；再读 go-zero 的服务治理和 etcd 的一致性存储，最后对照 Kratos 的框架抽象与 grpc-go 的 RPC 运行时。

## Related

- [源码解析总览](/notes/source/)
- [Java 源码解析](/notes/source/java/)
