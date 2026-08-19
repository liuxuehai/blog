---
title: Spring Cloud OpenFeign
description: 声明式 HTTP 客户端的源码解析：接口注册、子上下文、代理组装、契约编解码、负载均衡与熔断。
category: Backend
tags:
  - Source Reading
  - Spring Cloud OpenFeign
  - HTTP Client
  - Proxy
order: 6
updatedDate: 2026-08-19
difficulty: advanced
status: stable
lastReviewed: 2026-08-19
draft: false
sidebar:
  order: 6
---

Spring Cloud OpenFeign 把一个带 `@FeignClient` 的 Java 接口变成可注入的 HTTP 客户端代理。源码阅读的主线是：注册 BeanDefinition，按客户端创建隔离上下文，再由 `FeignClientFactoryBean` 组装 Feign Builder 与目标代理。

<!-- more -->

## 本册问题地图

OpenFeign 的源码主线是“接口声明如何变成一次带契约、编码、负载均衡和容错的 HTTP 调用”：

1. `@FeignClient` 如何被扫描成 FactoryBean？
2. FactoryBean 如何为每个客户端创建代理和独立配置上下文？
3. Spring MVC 注解如何变成 HTTP method、path、header 和 body？
4. 代理调用经过哪些 InvocationHandler、Client 和 decoder？
5. 负载均衡、重试、熔断和 fallback 分别位于哪一层？


## 版本快照

| 项 | 值 |
| --- | --- |
| 仓库 | `spring-cloud/spring-cloud-openfeign` |
| 本地路径 | `E:\source\java\spring\spring-cloud-openfeign` |
| 分支 | `main` |
| Commit | `6a0b6f29090f022dbe2d281847c52864dcbee516`（2026-08-04） |
| 最近 tag | `v5.0.2` |

> 本册坐标均基于上述 commit，上游演进后行号可能漂移。

## 它解决什么问题

- 把 HTTP 请求的 URL、方法、参数和返回类型从业务代码中抽离到接口契约。
- 为每个客户端提供独立的编码器、解码器、超时、重试和拦截器配置。
- 在同一个声明式代理上接入服务发现、负载均衡、重试、观测和熔断。

## 模块地图

| 模块 | 职责 | 关键类 |
| --- | --- | --- |
| `spring-cloud-openfeign-core` | 注册、上下文、代理和配置 | `FeignClientsRegistrar`、`FeignClientFactoryBean` |
| `support` | Spring MVC 注解、消息转换和参数编解码 | `SpringMvcContract`、`SpringEncoder`、`SpringDecoder` |
| `loadbalancer` | 服务实例选择、重试和请求转换 | `FeignBlockingLoadBalancerClient` |
| `security` / `encoding` | OAuth2、压缩等横切能力 | `OAuth2AccessTokenInterceptor` |
| `spring-cloud-starter-openfeign` | Starter 依赖聚合 | Maven starter 模块 |

## 读码入口顺序

1. `EnableFeignClients` → `FeignClientsRegistrar#registerFeignClients`：接口如何进入 BeanFactory。
2. `FeignAutoConfiguration#feignContext`：全局工厂和客户端子上下文如何建立。
3. `FeignClientFactoryBean#getObject`：一次代理实例的完整组装。
4. `FeignClientFactoryBean#feign`：Builder 如何取得 Contract、Encoder、Decoder 和 Capability。
5. `SpringMvcContract#parseAndValidateMetadata`：接口方法如何变成 Feign `MethodMetadata`。
6. `Targeter`、`FeignBlockingLoadBalancerClient`、`FeignCircuitBreakerInvocationHandler`：调用如何进入下游。

## 本册目录

- [整体架构](/notes/source/java/spring/spring-cloud-openfeign/architecture/)：启动装配、客户端上下文与请求主流程
- [接口注册与代理](/notes/source/java/spring/spring-cloud-openfeign/client-registration/)：`@EnableFeignClients` 到 `FeignClientFactoryBean`
- [契约与编解码](/notes/source/java/spring/spring-cloud-openfeign/contract-codec/)：Spring MVC 注解、消息转换和类型元数据
- [客户端配置隔离](/notes/source/java/spring/spring-cloud-openfeign/client-context/)：`NamedContextFactory` 与按客户端覆盖配置
- [负载均衡与重试](/notes/source/java/spring/spring-cloud-openfeign/load-balancing-retry/)：实例选择、请求重建和状态码重试
- [熔断与回退](/notes/source/java/spring/spring-cloud-openfeign/circuit-breaker-fallback/)：`Targeter`、CircuitBreaker 和 fallback
- [面试专题](/notes/source/java/spring/spring-cloud-openfeign/interview/)：源码级回答与排障题

## 横向对照

| 对象 | 相似点 | 关键差异 |
| --- | --- | --- |
| Spring `RestClient` | 都复用消息转换和 HTTP 客户端 | OpenFeign 以接口代理和契约解析为中心 |
| Spring Cloud Gateway | 都接入负载均衡、重试和熔断 | Gateway 面向入站请求；Feign 面向出站调用 |
| JDK 动态代理 | 都把方法调用转成运行时分派 | Feign 还要先解析方法元数据并构建请求模板 |

> **面试锚点**
> - `@FeignClient` 为什么不是普通 `@Component`，而是 `FactoryBean`？
> - 为什么每个 Feign 客户端需要独立上下文？
> - 负载均衡和熔断分别位于调用链的什么位置？

## Related

- [Spring Cloud Gateway](/notes/source/java/spring/spring-cloud-gateway/)
- [Spring Boot 自动装配](/notes/source/java/spring/spring-boot/)
- [Spring Security 过滤器链](/notes/source/java/spring/spring-security/)
