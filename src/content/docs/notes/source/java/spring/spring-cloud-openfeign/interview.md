---
title: 面试专题
description: Spring Cloud OpenFeign 源码级面试题：注册、代理、契约、隔离、负载均衡、重试与熔断。
category: Backend
tags: [Source Reading, Spring Cloud OpenFeign, Interview]
order: 69
updatedDate: 2026-08-24
difficulty: advanced
status: stable
lastReviewed: 2026-08-24
draft: false
sidebar:
  order: 69
---

本篇把前面几篇的源码坐标串成面试回答。回答顺序建议是“先给调用链，再讲关键抽象，最后补边界和源码证据”。

<!-- more -->

## 先给答案：从接口代理追到最终 Client

`@FeignClient` 先由 Registrar 注册 FactoryBean，实例化时从命名子上下文组装 Builder、Contract、编解码器和 Client，再由 Targeter 生成代理。方法调用则把 Spring MVC 注解解析出的元数据转成 RequestTemplate，经直连地址或负载均衡选择后发出请求。

面试中的关键边界是配置隔离与失败语义：`contextId` 决定客户端级组件，重试和负载均衡会改变实际尝试次数，熔断 fallback 不等于事务回滚。涉及写请求时，必须继续回答幂等键、超时层级和远端结果不确定性。

## 1. `@FeignClient` 如何变成代理

**基础回答**：`@EnableFeignClients` 导入 `FeignClientsRegistrar`，注册器扫描接口并注册 `FeignClientFactoryBean`。容器需要接口实例时调用 `getObject()`，工厂 Bean 组装 Builder，最后由 `Targeter` 生成目标代理。

**源码加分**：注册阶段见 `FeignClientsRegistrar:152-218`；实例化见 `FeignClientFactoryBean#getObject:460-518`。所以注册的是“代理工厂定义”，不是提前生成的代理对象。

## 2. 为什么每个客户端有子上下文

**基础回答**：`FeignClientFactory` 继承 `NamedContextFactory`，以 `contextId` 为键隔离 Encoder、Decoder、超时、拦截器和自定义配置。

**追问回答**：父上下文保存共享基础设施，子上下文覆盖客户端局部策略。`getInstanceWithoutAncestors` 等方法控制是否继承父上下文，避免不同下游互相污染。

## 3. Spring MVC 注解如何影响请求

`SpringMvcContract#parseAndValidateMetadata:205-207` 把接口方法解析成 Feign `MethodMetadata`，参数注解由 `processAnnotationsOnParameter:326` 处理。调用时 Feign 用元数据填充 `RequestTemplate`，Encoder 再通过 `HttpMessageConverter` 写请求体。

## 4. 负载均衡发生在哪里

它发生在 Feign `Client.execute`，不是接口代理的业务方法中。`FeignBlockingLoadBalancerClient#execute:79-135` 从 URI 的 host 取 serviceId，调用 `LoadBalancerClient#choose:91`，把 URL 重写后委托底层 Client。这样固定 URL、服务发现和不同 HTTP Client 可以共享同一契约层。

## 5. 为什么默认不启用 Feign 原生重试

`FeignClientsConfiguration#feignRetryer:138-142` 返回 `Retryer.NEVER_RETRY`。Spring Cloud 需要避免透明重试非幂等请求，并把服务实例重选、重试次数和状态码判断交给 LoadBalancer 或显式配置。

## 6. 熔断如何接入

自动配置根据条件选择 `DefaultTargeter` 或 `FeignCircuitBreakerTargeter`，后者在 `target:46-60` 处理 fallback。每次代理调用进入 `FeignCircuitBreakerInvocationHandler#invoke:79-115`，由 `CircuitBreaker#run` 执行 supplier，并在失败时调用 fallback function。

## 7. 高难追问

### 追问：固定 URL 为什么可以绕过服务发现？

`FeignClientFactoryBean#resolveTarget:538-568` 优先解析 refreshable 或硬编码 URL；只有没有固定 URL 时才保留服务名目标。因此配置 `url` 后不要再期待注册中心选择实例。

### 追问：重试为什么要包住 choose？

因为第一次失败后原实例可能已经不可用。`RetryableFeignBlockingLoadBalancerClient#execute:99-170` 将选择实例、请求转换和 delegate 执行放在同一重试模板内，下一次尝试才有机会选择新实例。

### 追问：fallback 为什么必须实现接口

代理方法返回类型和方法集合由客户端接口定义。`FeignCircuitBreakerTargeter#getFromContext:76-107` 做可赋值校验，避免 fallback 只能在运行时某个分支才暴露类型错误。

## 排障清单

| 现象 | 优先检查 |
| --- | --- |
| Bean 找不到 | `@EnableFeignClients` 扫描范围、接口是否被注册 |
| 配置不生效 | `contextId`、客户端配置是否误进入父上下文 |
| 404/参数错误 | `SpringMvcContract`、路径变量命名、Content-Type |
| 请求未负载均衡 | 是否配置了固定 `url`、LoadBalancer Client 是否存在 |
| fallback 不触发 | 熔断开关、`CircuitBreakerFactory`、fallback Bean 类型 |
| 请求重复 | Feign Retryer 与 LoadBalancer Retry 是否同时开启 |

## 一句话总结

OpenFeign 是“声明式契约 + 工厂式代理 + 命名子上下文 + Client 装饰器 + InvocationHandler 容错”的组合，而不是单一的 JDK 动态代理。

> **面试锚点**
> - `FactoryBean`、`NamedContextFactory`、`Targeter` 分别解决什么问题？
> - Contract、Encoder、Decoder 的调用时机如何区分？
> - 重试、负载均衡、熔断的顺序如何影响语义？

## Related

- [整体架构](/notes/source/java/spring/spring-cloud-openfeign/architecture/)
- [接口注册与代理](/notes/source/java/spring/spring-cloud-openfeign/client-registration/)
- [契约与编解码](/notes/source/java/spring/spring-cloud-openfeign/contract-codec/)
- [客户端配置隔离](/notes/source/java/spring/spring-cloud-openfeign/client-context/)
- [负载均衡与重试](/notes/source/java/spring/spring-cloud-openfeign/load-balancing-retry/)
- [熔断与回退](/notes/source/java/spring/spring-cloud-openfeign/circuit-breaker-fallback/)
