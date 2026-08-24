---
title: Kratos gRPC 传输
description: Kratos gRPC server/client 的拦截器、健康检查、反射和服务发现 resolver。
category: Backend
tags: [Source Reading, Kratos, Go, gRPC]
order: 33
updatedDate: 2026-08-24
difficulty: advanced
status: stable
lastReviewed: 2026-08-24
draft: false
sidebar:
  order: 33
---

Kratos gRPC 层尽量复用 grpc-go 的生命周期和拦截器模型，只在外层补充 transport context、按 operation 的 middleware、健康检查、反射和 registry resolver。

<!-- more -->

## 先给答案：Kratos gRPC 层尽量复用 grpc-go 的生命周期和拦截器模型，只在外层补充 transpor…

Kratos gRPC 层尽量复用 grpc-go 的生命周期和拦截器模型，只在外层补充 transport context、按 operation 的 middleware、健康检查、反射和 registry resolver。 正文沿“Server 组装 -> Middleware 注入 -> Client 与 resolver”展开：先确认入口和状态归属，再跟踪控制流或数据流的推进，最后落到对外可观察的结果。

主要失效边界集中在“GracefulStop 卡住、关闭 health 太早、stream middleware”这些场景。它们破坏的是容量、顺序、并发或生命周期前提；排查时应先确认状态是否仍由正确对象持有，再核对推进条件和清理路径。

## Server 组装

```text
NewServer
  |
  +-> unaryServerInterceptor
  +-> streamServerInterceptor
  +-> TLS / custom options
  +-> health server
  +-> reflection
  +-> admin
  |
Start -> listen -> health.Resume -> Serve
Stop  -> admin clean -> health.Shutdown -> GracefulStop
```

构造流程位于 `transport/grpc/server.go:123-192`，启动与停止在 `:215-246`。默认会注册 health、reflection 和 admin；可通过 `CustomHealth`、`DisableReflection` 和 `Options` 改变行为。

## Middleware 注入

Kratos 把自己的 middleware 包装为 gRPC unary/stream interceptor。client 的 unary interceptor 在 `transport/grpc/client.go:200-231` 创建 `Transporter`、设置 timeout、注入 peer，再用 `middleware.Chain` 包裹 invoker。server 侧则以 operation matcher 选择服务级 middleware。

## Client 与 resolver

`NewClient` 默认安装负载均衡 service config、unary/stream middleware，并依据 TLS 选择 credentials：`transport/grpc/client.go:139-197`。提供 Discovery 时，通过 `discovery.NewBuilder` 注册 resolver：`:174-183`。

## 设计取舍

**替代方案**：把 Kratos middleware 改写成独立的业务拦截器体系。
**问题**：无法复用 grpc-go 的 stream、metadata 和连接管理语义。
**设计**：middleware 只负责统一业务 handler，最终仍落到 grpc interceptor/invoker。

## 边界与踩坑

| 场景 | 风险 | 处理 |
| --- | --- | --- |
| GracefulStop 卡住 | 连接无法退出 | Stop context 到期后调用 `Server.Stop` |
| 关闭 health 太早 | 新请求仍进入 | 退出时先 Shutdown health 再停止服务 |
| stream middleware | 只覆盖 unary | 分别配置 stream middleware/interceptor |
| resolver 空地址 | grpc 状态被清空 | resolver 拒绝写入空 endpoint 集合 |

## 可迁移知识

适配成熟协议栈时，扩展点应放在 interceptor、resolver 和 context 边界，避免重新实现协议状态机。

> **面试锚点**
> - Kratos 如何把统一 middleware 接入 gRPC unary 和 stream？
> - 为什么 resolver 不应把空地址更新给 grpc？
> - health.Resume/Shutdown 在服务生命周期中解决什么问题？

## Related

- [HTTP 传输](/notes/source/go/kratos/http-transport/)
- [客户端与一致性读取](/notes/source/go/etcd/client/)
