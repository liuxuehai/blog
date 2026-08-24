---
title: zrpc 服务治理
description: zrpc 的 gRPC 装配、拦截器、健康检查、服务发现与优雅停机。
category: Backend
tags: [Source Reading, go-zero, Go, RPC]
order: 26
updatedDate: 2026-08-24
difficulty: advanced
status: stable
lastReviewed: 2026-08-24
draft: false
sidebar:
  order: 26
---

`zrpc` 对 gRPC 的主要增量不是重新实现传输协议，而是把默认治理能力变成可配置的 server/client 装配流程。

<!-- more -->

## 先给答案：zrpc 对 gRPC 的主要增量不是重新实现传输协议，而是把默认治理能力变成可配置的 server/cl…

zrpc 对 gRPC 的主要增量不是重新实现传输协议，而是把默认治理能力变成可配置的 server/client 装配流程。 正文沿“服务端链路 -> 健康与停机 -> 客户端”展开：先确认入口和状态归属，再跟踪控制流或数据流的推进，最后落到对外可观察的结果。

主要失效边界集中在“默认 blocking dial、只配 server breaker、健康探针未接入 LB”这些场景。它们破坏的是容量、顺序、并发或生命周期前提；排查时应先确认状态是否仍由正确对象持有，再核对推进条件和清理路径。

## 服务端链路

```text
RpcServerConf
  └─ NewServer
      ├─ choose local / Etcd published server
      ├─ trace, recover, stat, prometheus
      ├─ breaker, shedding, timeout
      ├─ auth interceptors
      └─ Start ─► grpc.NewServer ─► register ─► health ─► Serve
```

`NewServer` 根据 `HasEtcd` 选择 `NewRpcPubServer` 或 `NewRpcServer`：`zrpc/server.go:29-49`；鉴权需要创建 Redis authenticator 后再追加 unary/stream interceptor：`zrpc/server.go:112-129`。

## 健康与停机

底层 server 监听 TCP、把 interceptor slice 交给 `grpc.Chain*Interceptor`，然后注册业务服务：`zrpc/internal/rpcserver.go:47-59`。健康服务注册后调用 `Resume`，探针标记 ready：`zrpc/internal/rpcserver.go:60-67`。shutdown listener 先关闭健康状态，再执行 `GracefulStop`：`zrpc/internal/rpcserver.go:69-78`。

## 客户端

`NewClient` 保存 middleware 配置后进入 `dial`：`zrpc/internal/client.go:49-60`。默认设置 insecure credentials、可选 blocking dial，并挂载 unary/stream chain：`zrpc/internal/client.go:66-88`。目标地址通过已注册 resolver 解析：`zrpc/internal/client.go:22-24`；拨号超时为 3 秒并转换为带服务名的诊断信息：`zrpc/internal/client.go:122-141`。

## 为什么把健康状态纳入生命周期

**替代方案**：端口监听成功就认为服务 ready。
**为什么不行**：监听成功只代表 socket 可用，业务注册、依赖初始化和流量接收状态可能还没完成。
**证据**：源码在注册健康服务并 `Resume` 后才 `MarkReady`，关闭时又先 `Shutdown` 再 `GracefulStop`：`zrpc/internal/rpcserver.go:60-75`。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| 默认 blocking dial | 启动卡在依赖不可用 | `grpc.WithBlock` 配合拨号超时 | 明确选择 non-block 或重试 |
| 只配 server breaker | 下游调用仍压垮客户端 | 客户端没有调用前保护 | 同时打开 client breaker |
| 健康探针未接入 LB | 实例下线仍收流量 | 外部系统看不到状态 | 接入 gRPC health 状态 |
| interceptor 顺序随意 | 统计与错误口径不一致 | chain 是顺序执行 | 固定顺序并写集成测试 |

## 可迁移知识

运行时装配要把启动成功、可接流量、停止接流量、完全退出拆成状态，而不是用一个布尔值代表生命周期。

> **面试锚点**
> - zrpc 相比原生 grpc.Server 增加了哪些治理能力？
> - 为什么 graceful stop 前要先关闭健康状态？
> - client 的 resolver 和 interceptor 分别解决什么问题？

## Related

- [整体架构](/notes/source/go/go-zero/architecture/)
- [自适应熔断](/notes/source/go/go-zero/adaptive-breaker/)
- [goctl 代码生成](/notes/source/go/go-zero/goctl/)
