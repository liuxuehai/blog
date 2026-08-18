---
title: Route 与 Predicate
description: RouteDefinition、Java DSL、AsyncPredicate 组合和权重路由的源码解析。
category: Backend
tags: [Source Reading, Spring Cloud Gateway, Route, Predicate]
order: 53
updatedDate: 2026-08-15
difficulty: advanced
status: stable
lastReviewed: 2026-08-15
draft: false
sidebar:
  order: 53
---

路由是 Gateway 的决策对象：predicate 决定“是否接管请求”，URI 和 filters 决定“接管后怎么处理”。配置 DSL 和配置文件最终都收敛到同一套 `Route`。

<!-- more -->

## 数据流

```text
RouteDefinition / Java DSL
          |
          v
RoutePredicateFactory.applyAsync
          |
          v
AsyncPredicate.and(...)
          |
          v
RoutePredicateHandlerMapping#lookupRoute
          |
          v
GATEWAY_ROUTE_ATTR
```

## 配置转 Route

`RouteDefinitionRouteLocator.java:106-111` 从 `RouteDefinitionLocator` 读取定义；`131-135` 组合 predicate、加载 filters，并用 `Route.async(routeDefinition)` 构造路由。

`RouteDefinitionRouteLocator.java:139-196` 通过 `GatewayFilterFactory` 绑定配置。没有 order 的 filter 会包装成 `OrderedGatewayFilter`，随后排序；默认 filter 和路由 filter 最终进入同一集合。

`RouteDefinitionRouteLocator.java:199-234` 查找 predicate 工厂并调用 `applyAsync`，再用 `AsyncPredicate::and` 归约。没有 predicate 时在 `202-206` 返回恒真 predicate。

## Java DSL

`RouteLocatorBuilder.java:69-82` 提供带 id 和自动 id 两种 route 入口，`91-92` 把 builder 列表转换成 `Flux<Route>`。`PredicateSpec.java:64-70` 支持同步 predicate 转异步 predicate；`151-194`、`217-240`、`308-316` 覆盖 method、path、query、weight。

## 权重路由

`WeightCalculatorWebFilter.java:248-284` 为每个 group 生成随机数，并落到规范化权重区间。权重 predicate 再读取选择结果，使同组路由具有单次选择语义。`Route.java:279-300` 负责把普通 predicate 包装进异步 builder，并在 `Route.java:253-259` 完成最终构建。

## 为什么这么设计

**替代方案**：匹配路由时动态解析配置并构造 predicate。
**为什么不行**：请求路径上会重复做绑定、反射和排序，配置错误也延迟到请求时暴露。
**证据**：`RouteDefinitionRouteLocator.java:131-135` 预先完成 predicate/filter 构建；请求阶段只执行 `route.getPredicate()`。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| 路由顺序不合理 | 兜底路由吞掉精确路由 | `lookupRoute` 取第一条匹配 | 精确路由排在通配路由前 |
| predicate 中阻塞 | 全局延迟升高 | 异步接口不代表实现非阻塞 | predicate 内禁止同步 IO |
| 代理后的 IP 匹配错误 | remoteAddr 误判 | 看到的是代理地址 | 配置可信 resolver |

## 可迁移知识

将外部配置编译成不可变策略对象，运行时只执行策略，是降低热路径复杂度的通用办法，规则引擎和权限决策同样适用。

> **面试锚点**
> - RouteDefinition 怎样编译成 Route？
> - 多个 predicate 是 AND 还是 OR？
> - 权重路由为什么需要 `WeightCalculatorWebFilter`？

## Related

- [整体架构](/notes/source/java/spring/spring-cloud-gateway/architecture/)
- [Reactor 与 WebFlux 基础](/notes/source/java/spring/spring-cloud-gateway/reactor-webflux/)
- [GatewayFilter 链](/notes/source/java/spring/spring-cloud-gateway/gateway-filter-chain/)