---
title: grpc-go Status、Metadata 与 Credentials
description: grpc-go 状态码、metadata 上下文传播、TLS transport credentials 与 per-RPC credentials。
category: Backend
tags: [Source Reading, gRPC, Go, Security]
order: 47
updatedDate: 2026-08-17
difficulty: advanced
status: stable
lastReviewed: 2026-08-17
draft: false
sidebar:
  order: 47
---

RPC 的跨进程语义不只包含 protobuf 消息。grpc-go 还需要稳定传递结构化状态、请求头/响应头/trailer、deadline、peer 身份和认证材料，并把这些信息映射到 HTTP/2 headers 与 trailers。

<!-- more -->

## Status

`status.Status` 封装 gRPC code、message 和 protobuf details。`New`、`Error`、`FromError` 位于 `status/status.go:48-135`。业务错误应转换成有限的 gRPC code；任意 Go error 穿越进程后不再保留本地类型语义。

```text
Go error
  -> status.Status {Code, Message, Details}
  -> HTTP/2 trailers: grpc-status / grpc-message
  -> peer status.FromError
```

context cancellation/deadline 会映射为 `Canceled`/`DeadlineExceeded`，transport 错误则由运行时归一化。details 适合机器可读的错误补充信息，不应把内部堆栈直接暴露给客户端。

## Metadata

`metadata.MD` 是 `map[string][]string`，key 会规范为小写：`metadata/metadata.go:46-105`。incoming/outgoing metadata 通过 context 传播，相关入口位于 `metadata/metadata.go:205-295`。

metadata map 和 value slice 不是自动深拷贝的共享可变对象。跨 goroutine 或追加字段时，应使用 `Copy`、`Join` 或 `AppendToOutgoingContext`，避免修改其他调用正在读取的数据。

## Credentials

```text
TransportCredentials
  -> TCP connection handshake
  -> TLS / peer AuthInfo / security level

PerRPCCredentials
  -> each RPC metadata
  -> token / request credential
```

两类接口位于 `credentials/credentials.go:38-58`、`:152-190`。TLS 客户端握手根据 authority 设置 ServerName，校验证书并检查 ALPN：`credentials/tls.go:112-165`；服务端握手位于 `:168-210`。

## 边界与踩坑

| 场景 | 风险 | 处理 |
| --- | --- | --- |
| 用 Unknown 表示所有错误 | 客户端无法决策 | 建立业务错误到 code 的映射 |
| metadata 放大对象 | header 限制与内存压力 | 只传小型上下文信息 |
| token 走明文连接 | 凭证泄漏 | PerRPCCredentials 要求 transport security |
| authority 配错 | TLS 主机名校验失败 | 对齐 target、SNI 与证书 SAN |

## 可迁移知识

跨进程错误和认证必须收敛到稳定协议模型：本地异常类型、可变 context 数据和连接身份不能原样跨越网络边界。

> **面试锚点**
> - status code 与普通 Go error 的边界是什么？
> - incoming/outgoing metadata 为什么放在 context 中？
> - TransportCredentials 和 PerRPCCredentials 有什么区别？

## Related

- [RPC Stream 与重试](/notes/source/go/grpc-go/stream-rpc/)
- [Kratos 错误、Metadata 与编码](/notes/source/go/kratos/errors-metadata/)
- [Spring Security 认证管理](/notes/source/java/spring/spring-security/authentication/)

