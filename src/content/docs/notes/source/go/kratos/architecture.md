---
title: Kratos 整体架构
description: Kratos 根包、transport、middleware、registry 与基础设施的模块边界。
category: Backend
tags: [Source Reading, Kratos, Go, Architecture]
order: 30
updatedDate: 2026-08-16
difficulty: advanced
status: stable
lastReviewed: 2026-08-16
draft: false
sidebar:
  order: 30
---

Kratos 的核心不是一个大型运行时，而是一组围绕统一接口拼装的基础模块。根包只负责应用生命周期，具体协议交给 transport，治理能力通过 registry、selector 和 middleware 注入。

<!-- more -->

## 主链路

```text
kratos.New(options)
       |
       v
build ServiceInstance <- server.Endpoint()
       |
       v
server.Start(ctx) -> HTTP/gRPC request -> middleware -> endpoint
       |                                      |
       +-> Registrar.Register                 +-> client transport
       |
 signal / Stop -> Deregister -> server.Stop
```

`App` 的字段把 context、servers、registrar、hooks 和 instance 集中在 `app.go:29-36`；构造和默认信号位于 `app.go:38-59`、`options.go:17-39`。底层服务只需要实现 `transport.Server`：`transport/transport.go:16-24`。

## 依赖方向

```text
application code
   |
   +--> kratos.App
   +--> transport/http or transport/grpc
   +--> middleware
   +--> registry adapter
   +--> config/log
```

框架通过接口反向依赖应用适配器：注册中心实现 `registry.Registrar`/`Discovery`，配置源实现 `config.Source`，日志输出只需要提供 slog handler 或 writer。这样业务代码不必绑定某一个注册中心或配置中心。

## 关键取舍

**替代方案**：把注册、配置、RPC 和生命周期全部做成一个中心容器。
**问题**：测试和替换成本高，协议细节会污染应用生命周期。
**设计**：用小接口组合能力，`App` 只编排，不持有 HTTP/gRPC 实现细节。

## 边界与踩坑

| 场景 | 风险 | 处理 |
| --- | --- | --- |
| 未提供 Endpoint | 注册信息为空 | 从实现 `Endpointer` 的 server 推导 |
| server 启动失败 | 应用仍可能尝试注册 | `Run` 通过 errgroup 汇总错误 |
| 自定义 registry | 生命周期遗漏 | 同时实现 Register、Deregister |
| 混用 HTTP/gRPC | operation 语义不同 | 通过 `Transporter.Kind` 区分 |

## 可迁移知识

框架的扩展性主要来自“稳定的生命周期接口 + 可替换的边缘适配器”，而不是来自更多全局配置。

> **面试锚点**
> - Kratos 的 App 为什么不直接管理 HTTP/gRPC 细节？
> - `Transporter` 在 middleware 中解决了什么问题？
> - 注册发现和负载选择为什么拆成两个包？

## Related

- [App 生命周期](/notes/source/go/kratos/app-lifecycle/)
- [etcd 整体架构](/notes/source/go/etcd/architecture/)
- [go-zero 整体架构](/notes/source/go/go-zero/architecture/)
