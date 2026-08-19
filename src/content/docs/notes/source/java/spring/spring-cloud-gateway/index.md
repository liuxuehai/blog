---
title: Spring Cloud Gateway
description: 基于 Spring WebFlux 的响应式网关：路由匹配、过滤器链、代理转发、限流与熔断。
category: Backend
tags:
  - Source Reading
  - Spring Cloud Gateway
  - WebFlux
  - Gateway
order: 5
updatedDate: 2026-08-19
difficulty: advanced
status: stable
lastReviewed: 2026-08-19
draft: false
sidebar:
  order: 5
---

Spring Cloud Gateway 把请求接入、路由选择、跨切面处理和下游代理组合成一条 WebFlux 链。阅读重点不是配置项，而是 `ServerWebExchange` 如何携带路由状态并穿过有序过滤器。

<!-- more -->

## 本册问题地图

Spring Cloud Gateway 的核心是把“请求是否属于某条路由、经过哪些过滤器、最终如何转发”变成 Reactor 链：

1. WebFlux 的非阻塞执行模型如何约束 Gateway 过滤器？
2. Route、Predicate 和 Filter 如何从配置变成可执行链？
3. 全局过滤器、路由过滤器和排序如何共同决定请求顺序？
4. URL 重写、负载转发和响应提交分别发生在哪个阶段？
5. Redis 限流和熔断 fallback 如何处理异步失败与资源释放？


## 版本快照

| 项 | 值 |
| --- | --- |
| 仓库 | `spring-cloud/spring-cloud-gateway` |
| 本地路径 | `E:\source\java\spring\spring-cloud-gateway` |
| 分支 | `main` |
| Commit | `b0d6a5228cbc517002cd64010486e94ed9eb9bf5`（2026-08-11） |
| 最近 tag | `v5.0.2` |

> 本册坐标均基于上述 commit，上游演进后行号可能漂移。

## 它解决什么问题

- 把“请求是否属于某个路由”和“请求如何被改写、限流、转发”拆成可组合扩展点。
- 用响应式 `Mono`/`Flux` 支撑高并发代理，避免每个下游连接占用阻塞线程。
- 允许全局过滤器、路由过滤器和外部 `RouteLocator` 共同参与一次请求。

## 模块地图

| 模块 | 职责 | 关键类 |
| --- | --- | --- |
| `spring-cloud-gateway-server-webflux` | WebFlux 网关核心 | `GatewayAutoConfiguration`、`RoutePredicateHandlerMapping` |
| `route` | 路由模型与路由来源 | `Route`、`RouteDefinitionRouteLocator` |
| `handler` | 路由匹配与过滤器执行 | `FilteringWebHandler`、`AsyncPredicate` |
| `filter` | URL 转换、Netty 代理、全局过滤器 | `RouteToRequestUrlFilter`、`NettyRoutingFilter` |
| `filter.factory` | 配置驱动的路由过滤器 | `RequestRateLimiterGatewayFilterFactory` |

## 读码入口顺序

1. `GatewayAutoConfiguration`：确认 Bean 装配和 WebFlux 入口。
2. `RouteDefinitionRouteLocator#convertToRoute`：看配置如何变成路由对象。
3. `RoutePredicateHandlerMapping#lookupRoute`：看异步 predicate 如何选路由。
4. `FilteringWebHandler#handle`：看过滤器如何合并排序。
5. `RouteToRequestUrlFilter` → `NettyRoutingFilter`：看目标 URI 和下游代理。

## 本册目录

- [整体架构](/notes/source/java/spring/spring-cloud-gateway/architecture/)：组件关系、启动装配与请求主流程
- [Reactor 与 WebFlux 基础](/notes/source/java/spring/spring-cloud-gateway/reactor-webflux/)：响应式链、背压与 `ServerWebExchange`
- [Route 与 Predicate](/notes/source/java/spring/spring-cloud-gateway/route-predicate/)：路由构建、异步匹配和权重选择
- [GatewayFilter 链](/notes/source/java/spring/spring-cloud-gateway/gateway-filter-chain/)：全局过滤器、路由过滤器和代理转发
- [限流与熔断](/notes/source/java/spring/spring-cloud-gateway/rate-limit-circuit-breaker/)：Redis 令牌桶与响应式熔断回退
- [面试专题](/notes/source/java/spring/spring-cloud-gateway/interview/)：源码级回答与排障题

## 横向对照

| 对象 | 相似点 | 关键差异 |
| --- | --- | --- |
| Spring Security | 都以有序过滤器链承载横切逻辑 | Gateway 围绕路由和代理；Security 围绕认证授权 |
| Netty | 都以事件循环承载网络 IO | Gateway 把 Netty 封装成 WebFlux/Exchange 抽象 |
| Nginx | 都可做反向代理和流量治理 | Gateway 的路由与过滤器可由 Spring Bean 组合 |

> **面试锚点**
> - Gateway 如何从 `RouteDefinition` 找到目标路由？
> - 全局过滤器和路由过滤器如何合并、排序？
> - `RouteToRequestUrlFilter` 与 `NettyRoutingFilter` 为什么要分开？

## Related

- [Spring WebFlux](/notes/source/java/spring/spring-framework/)
- [Netty](/notes/source/java/base/netty/)
- [Spring Security](/notes/source/java/spring/spring-security/)
