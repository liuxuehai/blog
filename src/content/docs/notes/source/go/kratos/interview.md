---
title: Kratos 面试专题
description: Kratos 源码级面试题、设计取舍和常见排障场景。
category: Backend
tags: [Source Reading, Kratos, Go, Interview]
order: 38
updatedDate: 2026-08-24
difficulty: advanced
status: stable
lastReviewed: 2026-08-24
draft: false
sidebar:
  order: 38
---

<!-- more -->

## 先给答案：Kratos 源码级面试题、设计取舍和常见排障场景

Kratos 源码级面试题、设计取舍和常见排障场景。 正文沿“核心问题 -> 排障清单 -> 设计评价”展开：先确认入口和状态归属，再跟踪控制流或数据流的推进，最后落到对外可观察的结果。

主要失效边界集中在“注册中心没有实例、HTTP client 无节点、gRPC 请求不带 metadata”这些场景。它们破坏的是容量、顺序、并发或生命周期前提；排查时应先确认状态是否仍由正确对象持有，再核对推进条件和清理路径。

## 核心问题

### 1. App 为什么要先启动 server 再注册？

`Run` 在 `app.go:100-126` 等待 server 启动 goroutine 进入运行态后才调用 `Registrar.Register`。这样服务发现拿到的 endpoint 已经具备接收请求的条件；退出时顺序相反，先注销再取消和停止 server。

### 2. Middleware 如何跨 HTTP/gRPC 复用？

核心签名只有 `Handler` 和 `Middleware`：`middleware/middleware.go:7-20`。HTTP wrapper 和 gRPC interceptor 都把协议请求转换为统一 handler，再通过 `Transporter` context 提供 operation、endpoint 和 header。

### 3. Registry、resolver、selector 的区别？

Registry 负责控制面接口和 watcher；resolver 把服务实例转换成 HTTP 节点或 gRPC 地址；selector 负责数据面选择和 Done 反馈。拆分后可以替换注册中心而不改变负载均衡算法。

### 4. 配置 watch 如何避免无效通知？

watcher 的原始 KeyValue 先 Merge、Resolve，再与 cached Value 比较类型和值。只有解析后的值真的变化时才更新 Value 和调用 observer：`config/config.go:58-89`。

### 5. gRPC 优雅停止为什么要强制兜底？

`Stop` 启动 `GracefulStop`，同时等待 context；超时后调用 `Server.Stop`：`transport/grpc/server.go:226-246`。否则长连接或异常 handler 可能让进程永远无法退出。

## 排障清单

| 现象 | 优先检查 |
| --- | --- |
| 注册中心没有实例 | `Endpoint()`、Register 超时、Deregister 是否误调用 |
| HTTP client 无节点 | discovery scheme、watcher 首次 Next、subset/filter |
| gRPC 请求不带 metadata | client interceptor 是否读取 Transporter header |
| middleware 没生效 | operation 值、selector prefix/regex、注入时机 |
| 配置热更新无回调 | Value 类型、Resolve、observer key 是否一致 |
| 退出卡住 | StopTimeout、server.Stop、长连接和 health 状态 |

## 设计评价

Kratos 的核心优势是接口小、协议复用自然、控制面和数据面边界清楚。代价是很多行为依赖适配器实现质量：注册中心 watcher 的可靠性、resolver 的空地址处理和 middleware 顺序都不能只靠框架核心兜底。

## 迁移建议

阅读其他 Go 微服务框架时，可以先寻找四个坐标：生命周期 manager、统一 transport context、middleware chain、registry-to-balancer bridge。它们通常决定框架的主要扩展边界。

## Related

- [Kratos 整体架构](/notes/source/go/kratos/architecture/)
- [App 生命周期](/notes/source/go/kratos/app-lifecycle/)
- [go-zero 面试专题](/notes/source/go/go-zero/interview/)
