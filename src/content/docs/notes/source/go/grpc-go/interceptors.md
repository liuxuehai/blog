---
title: grpc-go 拦截器链
description: grpc-go client/server unary/stream 拦截器的签名、组装顺序和执行边界。
category: Backend
tags: [Source Reading, gRPC, Go, Interceptor]
order: 45
updatedDate: 2026-08-24
difficulty: advanced
status: stable
lastReviewed: 2026-08-24
draft: false
sidebar:
  order: 45
---

grpc-go 提供 client/server 与 unary/stream 的四类拦截器。它们共享洋葱式组合思想，但观测边界不同：unary 包住一次请求响应，stream 拦截器默认只包住 stream 的创建和 handler，逐条消息需要包装 `ClientStream` 或 `ServerStream`。

<!-- more -->

## 先给答案：grpc-go 提供 client/server 与 unary/stream 的四类拦截器

grpc-go 提供 client/server 与 unary/stream 的四类拦截器。它们共享洋葱式组合思想，但观测边界不同：unary 包住一次请求响应，stream 拦截器默认只包住 stream 的创建和 handler，逐条消息需要包装 ClientStream 或 ServerStream。 正文沿“四类签名 -> 组装与顺序 -> Stream 的特殊边界”展开：先确认入口和状态归属，再跟踪控制流或数据流的推进，最后落到对外可观察的结果。

主要失效边界集中在“stream interceptor 返回时，RPC 往往尚未结束”这些场景。它们破坏的是容量、顺序、并发或生命周期前提；排查时应先确认状态是否仍由正确对象持有，再核对推进条件和清理路径。

## 四类签名

| 位置 | unary | stream |
| --- | --- | --- |
| client | `UnaryClientInterceptor` | `StreamClientInterceptor` |
| server | `UnaryServerInterceptor` | `StreamServerInterceptor` |

类型定义位于 `interceptor.go:25-108`。client unary 接收最终 `UnaryInvoker`，stream 接收最终 `Streamer`；server unary 接收 `UnaryHandler`，stream 接收 `StreamHandler`。

## 组装与顺序

```text
interceptor A
  -> interceptor B
       -> interceptor C
            -> final invoker/handler
```

客户端在创建 `ClientConn` 时合并单个 interceptor 和 chain options：`clientconn.go:518-574`。服务端在 `NewServer` 后构建链：`server.go:1197-1265`。链按配置顺序从外到内执行，返回路径相反。

## Stream 的特殊边界

stream interceptor 返回时，RPC 往往尚未结束。若要统计整个流的耗时、消息数或逐消息鉴权，需要返回一个包装后的 stream，并覆写 `SendMsg`/`RecvMsg`；只在 interceptor 函数前后计时，只覆盖建流阶段。

同理，server stream interceptor 包住的是业务 `StreamHandler`，但 context 和消息读写来自 `ServerStream`。需要改变 context 时，应包装其 `Context()`，不能替换调用参数中的独立 context。

## 关键取舍

**替代方案**：把重试、认证、日志都硬编码进 transport。

**问题**：协议状态机与业务策略耦合，无法按 client/server 或 unary/stream 精确组合。

**设计**：transport 保持通用，横切逻辑围绕 invoker、streamer 和 handler 组合。

## 边界与踩坑

| 场景 | 风险 | 处理 |
| --- | --- | --- |
| recovery 放在内层 | 外层 interceptor panic 未捕获 | 明确链顺序，recovery 通常置外层 |
| stream 只记录建流 | 指标严重偏短 | 包装 stream 或 handler 全生命周期 |
| interceptor 重复重试 | 与 grpc 内建重试叠加 | 统一重试责任和幂等语义 |
| 修改 metadata 原 map | 跨调用数据竞争 | 使用 copy/AppendToOutgoingContext |

## 可迁移知识

中间件抽象不仅要定义函数签名，还必须定义包围的生命周期。长连接和流式 API 中，“创建成功”与“调用完成”是两个不同事件。

> **面试锚点**
> - 四类 interceptor 的差异是什么？
> - 为什么 stream interceptor 前后计时不等于 RPC 总耗时？
> - 多个 interceptor 的执行顺序如何确定？

## Related

- [RPC Stream 与重试](/notes/source/go/grpc-go/stream-rpc/)
- [Kratos Middleware 链](/notes/source/go/kratos/middleware/)
- [Gin Context 与 middleware](/notes/source/go/gin/context-pool/)
