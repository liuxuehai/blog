---
title: 熔断与回退
description: FeignCircuitBreakerTargeter 如何把普通代理切换为熔断 InvocationHandler，并校验 fallback 类型。
category: Backend
tags: [Source Reading, Spring Cloud OpenFeign, Circuit Breaker, Fallback]
order: 66
updatedDate: 2026-08-15
difficulty: advanced
status: stable
lastReviewed: 2026-08-15
draft: false
sidebar:
  order: 66
---

OpenFeign 将熔断接入点放在 `Targeter`，因此接口契约、编码器和服务发现仍然复用；只有最终的代理分派被替换为带 CircuitBreaker 的 `InvocationHandler`。

<!-- more -->

## Targeter 分叉

```text
FeignAutoConfiguration
  ├─ circuit breaker disabled -> DefaultTargeter -> feign.target
  └─ circuit breaker enabled -> FeignCircuitBreakerTargeter
       ├─ no fallback -> builder.target
       ├─ fallback -> target(target, fallback)
       └─ fallbackFactory -> target(target, factory)
```

默认 Targeter 在 `FeignAutoConfiguration:150-157` 创建 `DefaultTargeter`；熔断配置在 `:163-194` 条件化创建 `FeignCircuitBreakerTargeter`。后者的 `target:46-60` 依据 Builder 类型和 fallback 属性选择最终目标。

## 每次调用的状态边界

`FeignCircuitBreakerInvocationHandler#invoke:79-115` 为方法解析熔断器名称，创建 `CircuitBreaker`，再把真正的 Feign supplier 放进 `circuitBreaker.run`。有 fallback 时，异常会进入 fallback function，并把异常原因传给 `FallbackFactory`。

**替代方案**：在业务 Service 外层再写一个统一的 `@CircuitBreaker` 包装器。

**为什么不行**：包装器只能看到 Service 方法，无法自然区分同一 Feign 接口的不同方法、目标客户端和 fallback 类型；同时会让代理、指标和异常映射分散到业务层。

**设计证据**：`FeignCircuitBreakerTargeter` 保持 Feign Builder 不变，只把 fallback 交给 `builder.target`；`FeignCircuitBreakerInvocationHandler` 将断路状态包在每次方法调用外。

## fallback 与 fallbackFactory

| 机制 | 输入 | 适用场景 |
| --- | --- | --- |
| `fallback` | 一个实现接口的固定实例 | 返回固定降级结果 |
| `fallbackFactory` | 每次失败携带异常创建/选择回退 | 需要记录失败原因或按异常分类 |

`targetWithFallback:70-74` 从客户端上下文取 fallback 实例；`targetWithFallbackFactory:63-68` 取 `FallbackFactory`。`getFromContext:76-107` 同时做存在性和可赋值类型校验，避免把错误类型拖到第一次请求才暴露。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| fallback 未注册 | 创建代理失败 | 子上下文找不到目标 Bean | 在客户端配置中注册 fallback |
| fallback 类型不匹配 | `IllegalStateException` | 实现没有实现客户端接口 | 让 fallback 精确实现接口 |
| 把业务异常都当熔断 | 正常 4xx 触发降级 | 异常分类策略过宽 | 区分业务拒绝、网络失败和超时 |
| fallback 访问同一故障下游 | 降级再次超时 | 回退路径仍依赖故障资源 | 使用本地缓存、默认值或独立依赖 |

## 可迁移知识

熔断适配器最好位于“稳定的调用接口”和“易变的执行策略”之间。目标对象、异常回退和观测应由同一个 InvocationHandler 统一承载，避免在每个业务方法里重复实现状态机。

> **面试锚点**
> - 熔断为什么放在 Targeter/InvocationHandler，而不是 Encoder？
> - fallback 和 fallbackFactory 的差异是什么？
> - 如何避免降级逻辑把故障放大？

## Related

- [整体架构](/notes/source/java/spring/spring-cloud-openfeign/architecture/)
- [负载均衡与重试](/notes/source/java/spring/spring-cloud-openfeign/load-balancing-retry/)
- [Spring Cloud Gateway 限流与熔断](/notes/source/java/spring/spring-cloud-gateway/rate-limit-circuit-breaker/)