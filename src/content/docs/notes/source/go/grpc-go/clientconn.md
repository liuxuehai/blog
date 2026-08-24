---
title: grpc-go ClientConn 与连接状态机
description: grpc-go ClientConn 的 target 解析、idle、SubConn、连接建立、退避重连与关闭。
category: Backend
tags: [Source Reading, gRPC, Go, ClientConn]
order: 42
updatedDate: 2026-08-22
difficulty: advanced
status: stable
lastReviewed: 2026-08-22
draft: false
sidebar:
  order: 42
---

`ClientConn` 是逻辑 channel，不等于一条 TCP 连接。它持有 resolver、balancer、Picker、多个 `addrConn`、服务配置和连接状态，并允许底层 transport 在地址变化或故障后重建。

<!-- more -->

## 先给答案：ClientConn 是一个持续收敛的连接状态机，不是一次 Dial 的结果

Dial 创建的是逻辑连接管理器。Resolver 产生地址，Balancer 创建或更新 SubConn，SubConn 再建立具体 transport；请求通过 picker 选择当前 Ready 的子连接。地址变化、连接失败和重试都会让这条链反复更新，但业务侧仍持有同一个 ClientConn。

因此排查“RPC 偶发失败”要区分 resolver 没更新、balancer 没选出 Ready、transport 建连失败、picker 暂无可用连接和请求已发出后响应丢失。只看 `ClientConn` 是否非空，无法说明调用链已经可用。

## 创建与首次连接

```text
NewClient(target, options)
  +-> parse target / choose resolver
  +-> chain interceptors
  +-> validate credentials
  +-> init authority / channelz / picker
  +-> enter idle

first RPC or Connect
  +-> exitIdleMode
  +-> start resolver
  +-> build balancer
  +-> SubConn.Connect
  +-> addrConn.createTransport
```

`NewClient` 默认只完成 channel 初始化，并不立即建立连接：`clientconn.go:183-257`。target 按 URI scheme 选择 resolver；无 scheme 或 scheme 未注册时回退默认 scheme：`:1822-1858`。`Connect` 只触发退出 idle，并要求现有 SubConn 发起连接：`:737-750`。

## addrConn 状态机

`addrConn` 是 balancer 所见的 SubConn 实现，字段位于 `clientconn.go:1241-1295`。连接失败后 `resetTransportAndUnlock` 在 `Connecting -> TransientFailure -> Idle` 间转换并执行退避：`:1325-1420`；`tryAllAddrs` 依次尝试地址：`:1448-1484`。

真正拨号和创建 HTTP/2 transport 的入口是 `createTransport`：`clientconn.go:1489-1560`。连接关闭回调会清空 transport、请求重新解析，并回到 Idle，等待负载均衡策略决定下一次连接。

## 配置更新与关闭

resolver 状态先解析 service config，再交给 balancer wrapper：`clientconn.go:807-910`。`Close` 会取消 channel context、关闭 resolver/balancer、Picker 和所有 `addrConn`：`:1190-1238`。

## 关键取舍

**替代方案**：连接断开后由每个 RPC 同步重拨。

**问题**：请求延迟承担 DNS、退避和握手成本，且并发请求会制造拨号风暴。

**设计**：连接状态由长生命周期 channel 异步维护，调用通过 Picker 等待或快速失败。

## 边界与踩坑

| 场景 | 风险 | 处理 |
| --- | --- | --- |
| 创建 ClientConn 后不复用 | 反复解析和握手 | 按目标长期复用 channel |
| 把 Idle 当故障 | 空闲回收被误报警 | 区分 Idle、TransientFailure、Shutdown |
| 使用阻塞 Dial 依赖旧语义 | 初始化路径难控制 | 优先 `NewClient`，显式 health/readiness |
| Close 后继续调用 | 永久失败 | 明确 ClientConn 所有权和生命周期 |

## 可迁移知识

客户端连接池的关键不是“缓存 socket”，而是把地址变化、连接退避、健康状态和请求选择组织成可收敛的状态机。

> **面试锚点**
> - `NewClient` 为什么默认不拨号？
> - `ClientConn`、SubConn、addrConn、transport 分别是什么？
> - 连接失败为什么先进入 TransientFailure 再回 Idle？

## Related

- [Resolver 与 Balancer](/notes/source/go/grpc-go/resolver-balancer/)
- [RPC Stream 与重试](/notes/source/go/grpc-go/stream-rpc/)
- [go-zero zrpc 服务治理](/notes/source/go/go-zero/zrpc/)
