---
title: 整体架构
description: Spring Cloud Gateway 的自动装配、路由匹配、过滤器链与 Netty 代理主流程。
category: Backend
tags: [Source Reading, Spring Cloud Gateway, Architecture]
order: 51
updatedDate: 2026-08-24
difficulty: advanced
status: stable
lastReviewed: 2026-08-24
draft: false
sidebar:
  order: 51
---

Gateway 的核心是一个“先选路由、再执行有序过滤器、最后代理”的 WebFlux `WebHandler`。路由对象和请求状态都通过 `ServerWebExchange` 属性连接起来。

<!-- more -->

## 先给答案：路由先确定状态，过滤器再按序推进代理

Gateway 先把 RouteDefinition 编译为 Route，由 predicate 选择第一条匹配路由并写入 exchange 属性；随后合并全局与路由过滤器、统一排序，最终由路由过滤器改写目标地址并交给 Netty 代理。

`ServerWebExchange` 是整条链的共享状态载体，filter order 则决定前置和回程逻辑的嵌套关系。阻塞 EventLoop、错误缓存请求体、重试非幂等请求或让 fallback 再次命中原路由，都可能把正常过滤链变成资源泄漏或调用环。

## 分层

```text
配置 / Java DSL / Discovery
          |
          v
RouteDefinitionRouteLocator -> Route
          | predicate + filters
          v
RoutePredicateHandlerMapping
          | GATEWAY_ROUTE_ATTR
          v
FilteringWebHandler
          | sorted GlobalFilter + GatewayFilter
          v
RouteToRequestUrlFilter -> NettyRoutingFilter
          |
          v
下游 HTTP 服务
```

| 层 | 核心抽象 | 作用 |
| --- | --- | --- |
| 装配层 | `GatewayAutoConfiguration` | 创建 locator、handler、内置 filter |
| 路由层 | `RouteLocator` / `Route` | 提供 predicate、URI、metadata、filters |
| 匹配层 | `RoutePredicateHandlerMapping` | 异步测试路由并选第一条匹配项 |
| 执行层 | `FilteringWebHandler` | 合并、排序并递归推进过滤器链 |
| 代理层 | `NettyRoutingFilter` | 将请求发往下游并保存响应 |

## 核心抽象

`Route` 的 builder 位于 `spring-cloud-gateway-server-webflux/src/main/java/org/springframework/cloud/gateway/route/Route.java:70-103`，最终构建位于 `Route.java:253-259`。配置路由由 `RouteDefinitionRouteLocator.java:106-135` 转换。

`GlobalFilter` 接口位于 `filter/GlobalFilter.java:35-44`，`GatewayFilter` 位于 `filter/GatewayFilter.java:34-60`，二者都通过 `GatewayFilterChain.java:31-38` 委托后续处理。

## 主流程一：启动装配

```text
Spring Boot
   |
   +-- GatewayAutoConfiguration#routeDefinitionRouteLocator
   +-- GatewayAutoConfiguration#cachedCompositeRouteLocator
   +-- GatewayAutoConfiguration#filteringWebHandler
   +-- GatewayAutoConfiguration#routePredicateHandlerMapping
   +-- GatewayAutoConfiguration#routeToRequestUrlFilter / NettyRoutingFilter
```

`GatewayAutoConfiguration.java:264` 创建配置路由定位器，`275` 组合多个 locator，`289` 创建过滤器执行器，`309` 创建 handler mapping，`429` 创建 URL 转换过滤器，`901-907` 注册 Netty 路由过滤器。

## 主流程二：请求处理

```text
请求
 |
 v
RoutePredicateHandlerMapping#getHandlerInternal
 | lookupRoute -> route.getPredicate().apply
 v
FilteringWebHandler#handle
 | global + route filters -> order sort
 v
RouteToRequestUrlFilter#filter
 | GATEWAY_REQUEST_URL_ATTR
 v
NettyRoutingFilter#filter
 | CLIENT_RESPONSE_ATTR / CLIENT_RESPONSE_CONN_ATTR
 v
NettyWriteResponseFilter
```

`RoutePredicateHandlerMapping.java:80-105` 匹配成功后把 `Route` 放入 `GATEWAY_ROUTE_ATTR`；`131-151` 使用 `filterWhen(...).next()`，按 locator 顺序取第一条匹配路由。`FilteringWebHandler.java:99-124` 合并并排序，`127-156` 通过递归链执行。

## 扩展点全景

| 扩展点 | 触发时机 | 典型用途 |
| --- | --- | --- |
| `RouteLocator` | 路由读取时 | 配置中心、服务发现、Java DSL |
| `RoutePredicateFactory` | 路由匹配时 | path、host、method、query |
| `GatewayFilterFactory` | 路由构建时 | rewrite、retry、rate limit |
| `GlobalFilter` | 已匹配请求 | URL 转换、代理、统一审计 |
| `HttpHeadersFilter` | 代理前后 | header 清洗与安全控制 |

## 为什么这么设计

**替代方案**：把路由匹配、URL 改写和下游 IO 写在一个巨大 handler 中。
**为什么不行**：每个功能会与执行顺序、异常回退和扩展配置耦合，无法复用。
**证据**：自动配置分别注册 mapping、handler 和 URL filter，见 `GatewayAutoConfiguration.java:289-319`、`429-431`。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| 没有匹配路由 | 进入空 handler | `lookupRoute().next()` 没有结果 | 提供默认路由或明确 404 |
| filter order 冲突 | 改写/鉴权顺序异常 | 全局与路由 filter 统一排序 | 使用明确 `Ordered` |
| 访问管理端口 | 路由不生效 | mapping 跳过不同管理端口 | 检查管理端口配置 |

## 可迁移知识

把“策略选择”和“策略执行”分离：先用 predicate 选上下文，再把上下文交给有序责任链。规则引擎、消息路由器和任务编排器都可采用。

> **面试锚点**
> - Gateway 启动时最关键的 Bean 是什么？
> - 路由匹配结果如何传给后续过滤器？
> - 为什么 `NettyRoutingFilter` 不是 handler mapping 的一部分？

## Related

- [Route 与 Predicate](/notes/source/java/spring/spring-cloud-gateway/route-predicate/)
- [GatewayFilter 链](/notes/source/java/spring/spring-cloud-gateway/gateway-filter-chain/)
- [限流与熔断](/notes/source/java/spring/spring-cloud-gateway/rate-limit-circuit-breaker/)
