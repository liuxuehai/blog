---
title: 面试专题
description: Spring Cloud Gateway 的路由、响应式过滤器链、代理、限流与熔断源码级面试题。
category: Backend
tags: [Source Reading, Spring Cloud Gateway, Interview]
order: 59
updatedDate: 2026-08-15
difficulty: advanced
status: stable
lastReviewed: 2026-08-15
draft: false
sidebar:
  order: 59
---

Gateway 面试的重点是能沿着 exchange 属性和 filter order 讲清一次请求，而不是只背“路由、断言、过滤器”三个名词。

<!-- more -->

## 高频题

### Gateway 如何找到路由？

**30 秒版**：`RoutePredicateHandlerMapping` 从 `RouteLocator` 获取路由，按顺序异步执行 predicate，取第一条匹配路由，并把它放入 `GATEWAY_ROUTE_ATTR`。入口见 `RoutePredicateHandlerMapping.java:80-105`，匹配见 `131-151`。

**展开**：配置定义先由 `RouteDefinitionRouteLocator` 编译成 `Route`，多个 predicate 用 AND 组合。没有匹配路由时清理 body，不进入过滤器执行器。

**加分项**：`filterWhen(...).next()` 同时表达了异步判断和第一条优先。

**常见错答**：说成所有路由都会执行并合并结果。

### 全局过滤器和路由过滤器如何执行？

**30 秒版**：`FilteringWebHandler` 把全局过滤器适配成 `GatewayFilter`，与路由过滤器合并后统一排序，再由 `DefaultGatewayFilterChain` 按 index 推进。坐标：`FilteringWebHandler.java:107-156`。

**展开**：顺序由 `Ordered` 和 `AnnotationAwareOrderComparator` 决定，过滤器可以在委托前改请求，在返回后改响应。

**加分项**：这让 Netty、限流和自定义 filter 共享同一条异常传播路径。

**常见错答**：认为 GlobalFilter 一定先于所有路由 filter。

### RouteToRequestUrlFilter 做什么？

**30 秒版**：它只依据匹配路由生成 `GATEWAY_REQUEST_URL_ATTR`，不执行网络 IO；真正发请求的是 `NettyRoutingFilter`。坐标：`RouteToRequestUrlFilter.java:63-95`、`NettyRoutingFilter.java:101-171`。

**展开**：拆开后可让 rewrite、负载均衡和不同协议 routing filter 在 URL 生成与网络执行之间插入。

**加分项**：Netty filter 用 already-routed 标记避免重复代理。

**常见错答**：把 URI 改写和 HTTP client 调用当成同一个步骤。

### RedisRateLimiter 为什么用 Lua？

**30 秒版**：令牌桶需要读取 token、按时间补充、判断并写回两个值；Lua 在 Redis 中原子执行，避免并发请求交错。坐标：`RedisRateLimiter.java:245-282`。

**展开**：key 按 route 和 resolver key 区分，并用 hash tag 保证 Cluster 同 slot。响应携带 allowed、剩余 token 和限流参数。

**加分项**：实现考虑 Lua 的 `2^53-1` 安全整数边界。

**常见错答**：以为 Redis 的两次 GET/SET 已经原子。

## 高难追问

### 为什么 predicate 要支持异步？

**30 秒版**：某些判断可能依赖异步缓存、请求 body 或外部状态，`AsyncPredicate` 用 `Mono<Boolean>` 组合它们。关键坐标：`AsyncPredicate.java:34-49`、`RouteDefinitionRouteLocator.java:199-234`。

**展开**：异步接口只提供能力，不保证实现非阻塞；内部 block 仍会阻塞 EventLoop。

**加分项**：`filterWhen` 能让异步 predicate 结果参与路由筛选。

**常见错答**：把异步 predicate 等同于自动多线程。

### 熔断 fallback 怎样重新进入 Gateway？

**30 秒版**：熔断异常后构造 fallback URI，重置 response，把新 URI 写入 exchange，再调用 dispatcher handler。坐标：`SpringCloudCircuitBreakerFilterFactory.java:107-158`。

**展开**：fallback 可以继续复用路由、过滤器和响应式上下文，但指向自身会造成循环。

**加分项**：指定 HTTP 状态码也能在 `doOnSuccess` 中转成熔断失败。

**常见错答**：认为 fallback 只是返回固定字符串。

### 权重路由为什么需要 WebFilter？

**30 秒版**：同组路由需要一次请求只选一个结果，`WeightCalculatorWebFilter` 先按权重选择并写入 exchange，再由 weight predicate 消费。坐标：`WeightCalculatorWebFilter.java:248-284`。

**展开**：把随机选择提前到匹配阶段前，避免多个 predicate 各自随机导致一次请求不一致。

**加分项**：并发测试专门验证该组件线程安全。

**常见错答**：把权重当成每次 predicate 调用重新随机。

## 场景题

### 网关延迟突然升高，如何排查？

先看 EventLoop 是否被 block，再看 predicate 是否有同步 IO，随后检查 Redis 限流延迟、Netty response timeout 和下游连接池。重点坐标为 `NettyRoutingFilter.java:171-178` 与 `RedisRateLimiter.java:269-305`。

### 限流 Redis 故障是否会导致全站不可用？

默认实现会记录异常并 fail-open，未必拒绝流量；但这可能让下游被冲垮。需要按接口风险决定 fail-open/closed，并监控限流器错误率。证据：`RedisRateLimiter.java:287-305`。

## 反向问面试官

- 路由来源是配置文件、服务发现还是自定义 `RouteLocator`？
- 限流 Redis 故障时，业务更关注可用性还是保护下游？
- 自定义 GatewayFilter 是否有明确的 order 和超时预算？

> **面试锚点**
> - 如何解释 Gateway 的完整请求链？
> - 如何定位“路由匹配成功但下游没请求”？
> - 如何设计可观测的限流和熔断策略？

## Related

- [整体架构](/notes/source/java/spring/spring-cloud-gateway/architecture/)
- [GatewayFilter 链](/notes/source/java/spring/spring-cloud-gateway/gateway-filter-chain/)
- [限流与熔断](/notes/source/java/spring/spring-cloud-gateway/rate-limit-circuit-breaker/)