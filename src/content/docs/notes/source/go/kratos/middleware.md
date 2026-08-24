---
title: Kratos Middleware 链
description: Kratos handler 链、operation selector、HTTP/gRPC 上下文和中间件顺序。
category: Backend
tags: [Source Reading, Kratos, Go, Middleware]
order: 34
updatedDate: 2026-08-24
difficulty: advanced
status: stable
lastReviewed: 2026-08-24
draft: false
sidebar:
  order: 34
---

Kratos middleware 的核心是一个极小的函数类型：`Middleware func(Handler) Handler`。复杂能力来自组合顺序、transport context 和 operation selector，而不是来自一个庞大的基类体系。

<!-- more -->

## 先给答案：Kratos middleware 的核心是一个极小的函数类型：Middleware func(Handl…

Kratos middleware 的核心是一个极小的函数类型：Middleware func(Handler) Handler。复杂能力来自组合顺序、transport context 和 operation selector，而不是来自一个庞大的基类体系。 正文沿“Chain 顺序 -> Selector -> 为什么需要 operation”展开：先确认入口和状态归属，再跟踪控制流或数据流的推进，最后落到对外可观察的结果。

主要失效边界集中在“chain 顺序写反、selector 编译 regex 失败、缺少 Transporter”这些场景。它们破坏的是容量、顺序、并发或生命周期前提；排查时应先确认状态是否仍由正确对象持有，再核对推进条件和清理路径。

## Chain 顺序

```text
Chain(A, B, C)(endpoint)
       |
       v
 A(B(C(endpoint)))
       |
request -> A -> B -> C -> endpoint
response <- C <- B <- A
```

`Chain` 在 `middleware/middleware.go:7-20` 从尾到头包装 handler，因此调用顺序与参数书写顺序一致，返回路径反向展开。

## Selector

`middleware/selector` 支持 prefix、regex、exact path 和自定义 Match：`selector.go:28-89`。匹配时从 server/client context 取 `Transporter`，以 operation 判断：`:92-123`。命中后才执行内部 chain，否则直接放行：`:125-134`。

## 为什么需要 operation

HTTP path 和 gRPC full method 都可以映射为 operation，但它们的底层请求对象不同。`Transporter` 统一提供 Kind、Endpoint、Operation、request/reply header：`transport/transport.go:36-58`，让日志、鉴权和 tracing 不需要绑定协议。

## 设计取舍

**替代方案**：每种协议各自实现一套 middleware API。
**问题**：日志、恢复、限流等基础能力重复实现，顺序也容易漂移。
**设计**：业务 middleware 只依赖通用 handler 和 context，协议层负责把它接到 interceptor 或 HTTP handler。

## 边界与踩坑

| 场景 | 风险 | 处理 |
| --- | --- | --- |
| chain 顺序写反 | 鉴权或恢复失效 | 明确外层到内层的调用顺序 |
| selector 编译 regex 失败 | 规则被静默忽略 | 启动期校验配置和测试覆盖 |
| 缺少 Transporter | selector 不匹配 | 确保协议适配层先注入 context |
| middleware 修改 request | 并发数据竞争 | 只通过 context 传递请求级状态 |

## 可迁移知识

函数式 middleware 的价值在于可组合和可测试；路由条件应独立于业务逻辑，形成可复用的选择器。

> **面试锚点**
> - `Chain` 为什么从后往前遍历？
> - selector 如何同时支持 HTTP 和 gRPC？
> - middleware 与 transport context 的边界在哪里？

## Related

- [HTTP 传输](/notes/source/go/kratos/http-transport/)
- [gRPC 传输](/notes/source/go/kratos/grpc-transport/)
- [go-zero 自适应限流](/notes/source/go/go-zero/adaptive-limit/)
