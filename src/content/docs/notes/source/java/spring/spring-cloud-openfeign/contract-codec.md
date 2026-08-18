---
title: 契约与编解码
description: Spring MVC 注解如何解析为 Feign MethodMetadata，以及 HttpMessageConverter 如何完成请求响应转换。
category: Backend
tags: [Source Reading, Spring Cloud OpenFeign, HTTP, Serialization]
order: 63
updatedDate: 2026-08-15
difficulty: advanced
status: stable
lastReviewed: 2026-08-15
draft: false
sidebar:
  order: 63
---

OpenFeign 的接口方法不是直接反射调用，而是先由 `Contract` 编译成请求元数据，再由编码器和解码器把 Java 对象接到 HTTP 字节流。

<!-- more -->

## 编译契约

```text
Java method + annotations
        │
        ▼
SpringMvcContract
  ├─ HTTP method / path
  ├─ query / header / path variable
  └─ body / return Type
        │
        ▼
Feign MethodMetadata -> RequestTemplate -> Request
```

`SpringMvcContract` 继承 Feign `Contract.BaseContract`，见 `SpringMvcContract:98`。`parseAndValidateMetadata:205-207` 先交给父契约处理，再处理 Spring MVC 注解；参数处理集中在 `processAnnotationsOnParameter:326`。

## 为什么复用 Spring MVC 注解

**替代方案**：重新定义一套 `@FeignGet`、`@FeignBody` 等客户端注解。

**为什么不行**：应用已经用 Spring MVC 的参数语义描述 HTTP，重复定义会造成注解学习成本和语义漂移；复用注解还能直接共享 `ConversionService`、格式化和参数命名规则。

**源码证据**：`FeignClientsConfiguration#feignContract:125-127` 默认创建 `SpringMvcContract`，而不是 Feign 原生 `Contract.Default`。

## 编码与解码

```text
request body
  └─► SpringEncoder#encode
       └─► HttpMessageConverter.write

HTTP response
  └─► SpringDecoder#decode
       └─► HttpMessageConverter.read
            └─► return Type
```

默认 Decoder 在 `FeignClientsConfiguration#feignDecoder:109-113` 组装为 `OptionalDecoder(ResponseEntityDecoder(SpringDecoder))`；Encoder 在 `:118-121` 创建 `SpringEncoder`。`SpringEncoder#encode:90-101` 根据媒体类型和表单场景选择转换器，`SpringDecoder#decode:52-62` 将 Feign `Response` 包装为 Spring `ClientHttpResponse`。

## 类型信息为什么重要

Feign 方法返回值是 Java `Type`，不是简单的 `Class`。泛型集合、`ResponseEntity<T>` 和分页对象都需要保留参数化类型，否则解码器只能得到 `LinkedHashMap` 或原始集合。OpenFeign 把类型元数据保留到 Decoder，是反射契约和消息转换之间的桥。

## 默认重试语义

`FeignClientsConfiguration#feignRetryer:138-142` 默认提供 `Retryer.NEVER_RETRY`。这和 Feign 原生默认重试策略不同，目的是避免 Spring Cloud 在没有显式策略时对业务请求进行不可见重试；服务治理重试应由 LoadBalancer 或业务明确配置。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| 缺少 `Content-Type` | JSON 被当作字符串或表单 | Converter 选择依赖媒体类型 | 显式声明 consumes/headers |
| 返回空体 | 解码异常或得到 null | Decoder 不知道是否允许空响应 | 明确返回 `void` 或处理 204 |
| 泛型被擦除 | 列表元素类型错误 | 只传入原始 Class | 保留方法返回 `Type` |
| 自定义 Converter 顺序不当 | 默认 JSON 解析失效 | Spring Converter 按顺序匹配 | 检查 converter 顺序和媒体类型 |

## 可迁移知识

“先编译声明，再执行 IO”是 RPC、GraphQL 客户端和 SQL Mapper 的共同模式。把参数绑定编译成中间表示，可以降低每次调用的反射成本，并让校验在启动阶段提前失败。

> **面试锚点**
> - `SpringMvcContract` 和 Feign 原生 Contract 的差异是什么？
> - Encoder/Decoder 为什么要复用 `HttpMessageConverter`？
> - OpenFeign 默认为什么关闭 Feign 原生重试？

## Related

- [接口注册与代理](/notes/source/java/spring/spring-cloud-openfeign/client-registration/)
- [负载均衡与重试](/notes/source/java/spring/spring-cloud-openfeign/load-balancing-retry/)
- [Spring Boot 配置绑定](/notes/source/java/spring/spring-boot/)