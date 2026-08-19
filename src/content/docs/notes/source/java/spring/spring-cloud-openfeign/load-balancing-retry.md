---
title: 负载均衡与重试
description: Feign 请求如何从服务名解析实例、重建 URL，并在 Spring Cloud LoadBalancer 中执行重试。
category: Backend
tags: [Source Reading, Spring Cloud OpenFeign, Load Balancing, Retry]
order: 65
updatedDate: 2026-08-19
difficulty: advanced
status: stable
lastReviewed: 2026-08-19
draft: false
sidebar:
  order: 65
---

OpenFeign 的负载均衡不是代理层的另一个装饰，而是 Feign `Client` 的实现替换：代理照常生成请求，执行时由包装客户端根据服务名选择实例并重写 URL。

<!-- more -->

## 先给答案：负载均衡选择实例，重试决定是否再次发起请求，两者不能混成一个“可靠性开关”

负载均衡在服务名到具体实例之间做选择；重试在调用失败后决定是否换实例或再次发送。GET 等幂等请求和带副作用的 POST 对重试的安全性不同，网络超时还可能意味着服务端已经执行成功。

因此重试边界必须结合请求方法、异常类型、超时阶段和业务幂等键。只增加次数会放大下游压力；更换实例也不能修复所有错误，配置错误、序列化错误和业务异常不应盲目重试。


## 执行链

```text
Feign proxy
  └─► Client.execute(request)
       ├─ serviceId = URI host
       ├─ LoadBalancerClient.choose(serviceId)
       ├─ transform URI to instance host:port
       ├─ lifecycle callbacks
       └─ delegate.execute(newRequest)
```

`FeignBlockingLoadBalancerClient:57` 实现 Feign `Client`，`execute:79-135` 从请求 URI 提取 serviceId，调用 `loadBalancerClient.choose:91`，再把请求转换为选中实例的地址并交给 delegate。

## 为什么在 Client 层接入

**替代方案**：在 `InvocationHandler` 中先选实例，再把目标 URL 传给 Feign Builder。

**为什么不行**：Feign 的重试、请求拦截器和底层 HTTP 客户端都围绕 `Client.execute` 工作；把实例选择放在代理层会复制请求执行逻辑，并让缓存、fallback 和普通 URL 模式产生不同语义。

**设计取舍**：Client 装饰器保留了 Feign 的上层契约，同时让服务发现成为可替换执行策略。

## 可重试客户端

当启用 Spring Cloud LoadBalancer 重试时，`RetryableFeignBlockingLoadBalancerClient:74` 在 `execute:99-170` 中通过 `RetryTemplate` 包住“选择实例 + 执行请求”的整体过程。重试不能只重复底层 TCP 请求，因为下一次尝试可能需要重新选择健康实例。

请求转换器位于 `RetryableFeignBlockingLoadBalancerClient:190-199` 附近，允许在服务实例确定后补充或修改请求头。生命周期处理器则在选择、开始、完成和异常路径上接收事件，便于指标和追踪。

## 重试边界

```text
业务调用
  └─► attempt 1: choose A -> HTTP
        ├─ success -> return
        └─ retryable failure
             └─► attempt 2: choose B -> HTTP
```

OpenFeign 默认 `Retryer.NEVER_RETRY`，见 `FeignClientsConfiguration:138-142`；这并不等于 LoadBalancer 永不重试，而是区分 Feign 层异常重试和服务治理层重试。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| POST 被自动重试 | 重复写入 | 请求非幂等 | 只对幂等操作重试，或使用幂等键 |
| 连接超时与读超时混淆 | 重试次数异常 | 不同异常被不同策略分类 | 分开设置 connect/read timeout |
| 实例已下线仍被选中 | 间歇性 5xx | 注册中心和负载均衡缓存存在延迟 | 配置健康检查、短缓存和重试上限 |
| 固定 URL 仍期待服务发现 | 请求直达固定地址 | `resolveTarget` 已选择硬编码目标 | 使用服务名模式并提供 LoadBalancer |

## 可迁移知识

“策略包住执行，而不是把策略散落在业务代理中”适用于数据库路由、对象存储 endpoint 选择和消息生产者分区。重试单位应包含所有会影响结果的决策步骤，例如实例选择和认证令牌刷新。

> **面试锚点**
> - Feign 负载均衡为什么实现为 `Client` 装饰器？
> - 重试时为什么要重新选择实例？
> - Feign 原生重试和 LoadBalancer 重试有什么边界？

## Related

- [整体架构](/notes/source/java/spring/spring-cloud-openfeign/architecture/)
- [契约与编解码](/notes/source/java/spring/spring-cloud-openfeign/contract-codec/)
- [Spring Cloud Gateway 限流与熔断](/notes/source/java/spring/spring-cloud-gateway/rate-limit-circuit-breaker/)
