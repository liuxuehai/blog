---
title: Reactor 与 WebFlux 基础
description: Gateway 如何用 Mono、Flux 和 ServerWebExchange 组织非阻塞请求处理。
category: Backend
tags: [Source Reading, Spring Cloud Gateway, Reactor, WebFlux]
order: 52
updatedDate: 2026-08-15
difficulty: advanced
status: stable
lastReviewed: 2026-08-15
draft: false
sidebar:
  order: 52
---

Gateway 的“异步”不是把同步代码包进线程池，而是让路由 predicate、过滤器和下游代理都返回响应式 publisher，并在订阅时推进处理。

<!-- more -->

## 调用链

```text
WebFlux DispatcherHandler
  +-- HandlerMapping#getHandler
      +-- Mono<Route> lookupRoute
          +-- Mono<WebHandler>
              +-- Mono<Void> filter chain
                  +-- Flux<DataBuffer> request body
```

## 实现拆解

`RoutePredicateHandlerMapping.java:80-105` 使用 `Mono.deferContextual`，把 Reactor Context 保存到 exchange 属性，匹配逻辑直到订阅时执行。`lookupRoute` 位于 `131-151`，使用 `filterWhen`，每条路由的 predicate 可以异步返回 `Mono<Boolean>`。

`AsyncPredicate.java:34-49` 提供 `and`、`or`、`negate`；`56-74`、`97-127` 组合响应式结果。`RouteDefinitionRouteLocator.java:199-234` 将配置 predicate 用 `AsyncPredicate::and` 归约。

`GatewayFilterChain.java:31-38` 只返回 `Mono<Void>`；`FilteringWebHandler.java:148-156` 用 `Mono.defer` 创建下一节点，因此没有订阅就不会执行过滤器。

请求 body 是 `Flux<DataBuffer>`。`NettyRoutingFilter.java:122-128` 将 body 映射成 Netty `ByteBuf` 并发送；响应通过 `NettyRoutingFilter.java:129-169` 的 `responseConnection` 接收。

## 背压与资源

响应式链把数据生产节奏交给订阅者。网关仍需注意 `DataBuffer` 生命周期，代理过滤器不应随意缓存 body，否则会把流式 IO 变成内存聚集。

## 为什么这么设计

**替代方案**：每个请求分配阻塞工作线程，调用传统 HTTP client。
**为什么不行**：高并发下线程、栈内存和上下文切换成本随连接数增长，慢下游还会占住线程。
**证据**：`NettyRoutingFilter.java:101-171` 以 `Mono`/`Flux` 连接请求、响应和下一过滤器，没有显式阻塞等待。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| filter 中调用 `block()` | EventLoop 卡顿 | 非阻塞链被重新阻塞 | 使用 `flatMap`、`then`、`onErrorResume` |
| 重复读取 body | 下游拿到空 body | body 是一次性流 | 使用缓存 body 机制并控制大小 |
| 忽略取消信号 | 下游连接仍占用 | publisher 未传播取消 | 使用 Reactor/Netty 原生 client |

## 可迁移知识

把业务步骤表达为惰性 publisher，可以统一成功、失败、取消和超时路径，适合异步 RPC、批处理流水线和事件消费。

> **面试锚点**
> - `Mono.defer` 和直接调用方法有什么区别？
> - Gateway 为什么允许 predicate 返回 `Mono<Boolean>`？
> - WebFlux 读取 request body 的最大坑是什么？

## Related

- [整体架构](/notes/source/java/spring/spring-cloud-gateway/architecture/)
- [GatewayFilter 链](/notes/source/java/spring/spring-cloud-gateway/gateway-filter-chain/)
- [Netty](/notes/source/java/base/netty/)