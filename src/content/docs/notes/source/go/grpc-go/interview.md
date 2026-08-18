---
title: grpc-go 面试专题
description: grpc-go 源码级面试题、设计取舍和连接、流控、重试排障清单。
category: Backend
tags: [Source Reading, gRPC, Go, Interview]
order: 48
updatedDate: 2026-08-17
difficulty: advanced
status: stable
lastReviewed: 2026-08-17
draft: false
sidebar:
  order: 48
---

## 核心问题

### 1. ClientConn 为什么不是一条连接？

`ClientConn` 同时持有 resolver、balancer、Picker 和多个 `addrConn`：`clientconn.go:668-735`。它表示到逻辑 target 的 channel；具体 TCP/HTTP2 连接可能随地址、负载策略和故障切换而增减。

### 2. 一次 RPC 如何选到连接？

resolver 发布地址和 service config，balancer 创建 SubConn 并基于连接状态发布 Picker。`pickerWrapper.pick` 在调用热路径选择 Ready SubConn，并根据 fail-fast 或 wait-for-ready 决定错误还是等待：`picker_wrapper.go:105-205`。

### 3. grpc-go 如何复用一条 HTTP/2 连接？

每个 RPC 对应独立 stream ID；reader goroutine 分派入站帧，业务 goroutine把写操作送入 control buffer，`loopyWriter` 串行写帧并执行连接级/stream 级流控：`internal/transport/controlbuf.go:522-650`。

### 4. 为什么 unary RPC 也使用 clientStream？

`invoke` 创建一个双方都不 streaming 的 `StreamDesc`，依次 SendMsg、CloseSend、RecvMsg：`call.go:67-95`。这样 unary 与 streaming 共享 metadata、Picker、transport、状态和重试机制。

### 5. gRPC 重试为什么需要提交点？

逻辑 RPC 只有在尚未观察到确定响应、且操作仍可重放时才能切换 attempt。`commitAttemptLocked` 选定 attempt 并释放重试缓存：`stream.go:750-790`；提交后的失败不能再透明隐藏。

### 6. GracefulStop 为什么可能永远不返回？

它停止接收新连接并 drain transport，但会等待活跃 stream：`server.go:1658-1738`。长期双向流或不退出的 handler 会阻塞关闭，因此应用层需要超时后调用 `Stop`。

## 排障清单

| 现象 | 优先检查 |
| --- | --- |
| RPC 一直等待 | deadline、wait-for-ready、Picker 是否为空 |
| channel 反复 TransientFailure | resolver 地址、TLS authority、退避与网络 |
| 单连接吞吐低 | stream/connection window、RTT、消息消费速度 |
| 请求执行多次 | service config 重试、业务幂等、客户端自定义重试 |
| stream 内存增长 | 未 RecvMsg、重试缓冲、大消息与并发数 |
| 优雅退出卡住 | 长流、handler context、GracefulStop 超时兜底 |
| metadata 丢失 | outgoing context、interceptor 包装、header/trailer 时机 |

## 设计评价

grpc-go 的强项是边界清楚：生成代码提供类型入口，ClientConn 管控制面，Picker 保持调用热路径轻量，transport 专注 HTTP/2 状态机。代价是排障必须同时观察 resolver、balancer、SubConn、transport 和 RPC status，单看 TCP 或单个错误通常不足以定位问题。

## 迁移建议

阅读其他 RPC 框架时，先找五个坐标：逻辑 channel、地址解析、连接子通道、请求选择器、协议 stream。再确认 deadline、重试提交点和优雅停机由哪一层负责。

## Related

- [grpc-go 整体架构](/notes/source/go/grpc-go/architecture/)
- [Resolver 与 Balancer](/notes/source/go/grpc-go/resolver-balancer/)
- [Kratos 面试专题](/notes/source/go/kratos/interview/)
- [go-zero 面试专题](/notes/source/go/go-zero/interview/)
