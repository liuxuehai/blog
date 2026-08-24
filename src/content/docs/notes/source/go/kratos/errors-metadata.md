---
title: Kratos 错误、Metadata 与编码
description: Kratos Error 状态模型、HTTP/gRPC 映射、Metadata 传播和编码边界。
category: Backend
tags: [Source Reading, Kratos, Go, Errors, Metadata]
order: 37
updatedDate: 2026-08-24
difficulty: advanced
status: stable
lastReviewed: 2026-08-24
draft: false
sidebar:
  order: 37
---

跨协议调用最容易失去语义的是错误和 metadata。Kratos 用带 code/reason/message/metadata 的 Error 作为稳定模型，再把它映射到 HTTP status 或 gRPC status details。

<!-- more -->

## 先给答案：跨协议调用最容易失去语义的是错误和 metadata

跨协议调用最容易失去语义的是错误和 metadata。Kratos 用带 code/reason/message/metadata 的 Error 作为稳定模型，再把它映射到 HTTP status 或 gRPC status details。 正文沿“错误路径 -> Metadata -> 为什么需要独立模型”展开：先确认入口和状态归属，再跟踪控制流或数据流的推进，最后落到对外可观察的结果。

主要失效边界集中在“原地修改 metadata、普通 error、gRPC details 缺失”这些场景。它们破坏的是容量、顺序、并发或生命周期前提；排查时应先确认状态是否仍由正确对象持有，再核对推进条件和清理路径。

## 错误路径

```text
business error
      |
      v
kratos.Error(code, reason, message, metadata)
      |
      +--> HTTP status / response body
      +--> gRPC status + ErrorInfo details
      |
client FromError <- wrapped error / grpc status
```

`Error`、`New`、`WithCause` 和 `GRPCStatus` 位于 `errors/errors.go:22-80`。`GRPCStatus` 将 HTTP code 转为 gRPC code，并把 reason、metadata 放入 `errdetails.ErrorInfo`：`:57-64`。`FromError` 支持 Kratos error、gRPC status 和普通 error：`:126-151`。

## Metadata

`metadata.Metadata` 是 `map[string][]string`，写入时统一 key 小写，支持 Add、Set、Get、Clone：`metadata/metadata.go:10-75`。client/server context 分别保存 metadata：`:78-101`；追加 metadata 时先 Clone，避免修改父 context 中的 map：`:104-125`。

## 为什么需要独立模型

HTTP header、gRPC metadata 和业务错误的字段结构不同。如果 handler 直接依赖某个协议，跨协议网关就必须写大量转换代码。Kratos 把错误语义和请求 metadata 提升到 transport 之上，协议层只负责编码。

## 设计取舍

**替代方案**：所有服务直接返回 `status.Error` 或 `http.Error`。
**问题**：reason、业务 code 和 metadata 在协议间丢失，错误链也难以保留。
**设计**：Error 实现 `Unwrap`/`Is`，Metadata 采用 clone-on-write，再由 HTTP/gRPC 适配层完成最终编码。

## 边界与踩坑

| 场景 | 风险 | 处理 |
| --- | --- | --- |
| 原地修改 metadata | 父请求数据被污染 | 使用 Clone 后再写 |
| 普通 error | code 语义丢失 | `FromError` 统一转 Unknown |
| gRPC details 缺失 | reason/metadata 丢失 | 约定使用 ErrorInfo |
| 错误包装 | `errors.Is` 失效 | 保留 cause 并使用 `Unwrap` |

## 可迁移知识

跨协议错误模型必须同时保留机器可判断字段、用户可读 message 和可扩展 metadata；只传一段字符串无法支撑治理和排障。

> **面试锚点**
> - Kratos Error 如何在 HTTP 和 gRPC 之间保持语义？
> - Metadata 为什么采用 clone-on-write？
> - `FromError` 如何处理普通 error 和 gRPC status？

## Related

- [HTTP 传输](/notes/source/go/kratos/http-transport/)
- [gRPC 传输](/notes/source/go/kratos/grpc-transport/)
- [Spring Cloud OpenFeign 契约与编解码](/notes/source/java/spring/spring-cloud-openfeign/contract-codec/)
