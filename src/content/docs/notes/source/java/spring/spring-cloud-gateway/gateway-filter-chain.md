---
title: GatewayFilter 链
description: 全局过滤器、路由过滤器、排序责任链与 Netty 请求转发。
category: Backend
tags: [Source Reading, Spring Cloud Gateway, Filter Chain, Netty]
order: 54
updatedDate: 2026-08-15
difficulty: advanced
status: stable
lastReviewed: 2026-08-15
draft: false
sidebar:
  order: 54
---

Gateway filter 是围绕 `ServerWebExchange` 的响应式责任链。过滤器既可以在下游调用前修改请求，也可以在 `chain.filter(exchange)` 返回后处理响应。

<!-- more -->

## 责任链

```text
FilteringWebHandler
  +-- sort(GlobalFilter adapters + Route filters)
      +-- Filter[0]
          +-- Filter[1]
              +-- RouteToRequestUrlFilter
                  +-- NettyRoutingFilter
                      +-- response filters unwind
```

## 合并与推进

`FilteringWebHandler.java:99-124` 合并全局过滤器和路由过滤器，使用 `AnnotationAwareOrderComparator` 排序。`127-156` 的 `DefaultGatewayFilterChain` 每次创建 index 加一的新链节点，并用 `Mono.defer` 延迟调用。

`GatewayFilter.java:34-60` 是路由级契约；`GlobalFilter.java:35-44` 是匹配路由后的全局契约。`FilteringWebHandler.java:168-175` 将 `GlobalFilter` 适配成 `GatewayFilter`，执行器只需要一种链模型。

## URL 与代理

`RouteToRequestUrlFilter.java:39-95` 读取 route URI，生成 `GATEWAY_REQUEST_URL_ATTR`，不负责网络 IO。`NettyRoutingFilter.java:74-107` 检查 scheme 和 already-routed 标记，避免重复代理。

`NettyRoutingFilter.java:108-128` 过滤请求 header、处理 Host 并发送 body；`129-169` 保存下游 response/connection 到 exchange 属性。响应超时处理位于 `NettyRoutingFilter.java:171-178`。

## 为什么这么设计

**替代方案**：把每种路由 filter 直接写成 Servlet Filter 或全局 WebFilter。
**为什么不行**：路由条件和默认 filter 无法自然绑定，代理前后的顺序也难以统一。
**证据**：`FilteringWebHandler.java:107-124` 把两类 filter 合并成一个排序列表，让路由级和系统级策略共享责任链。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| 忘记调用 chain | 请求提前结束 | filter 主动截断责任链 | 明确终止型或装饰型 |
| already routed 残留 | 自定义 filter 不再转发 | exchange 属性表示已路由 | 不要复制错误属性 |
| Host 被清洗 | 下游虚拟主机失败 | 默认移除 Host | 明确 preserveHostHeader |

## 可迁移知识

响应式责任链的关键是“前置动作 + 委托 + 后置动作”：异常、超时、指标和资源释放都应围绕委托形成对称结构。

> **面试锚点**
> - GlobalFilter 如何进入 GatewayFilter 链？
> - Gateway 为什么拆出 RouteToRequestUrlFilter？
> - NettyRoutingFilter 如何避免重复路由？

## Related

- [整体架构](/notes/source/java/spring/spring-cloud-gateway/architecture/)
- [限流与熔断](/notes/source/java/spring/spring-cloud-gateway/rate-limit-circuit-breaker/)
- [Spring Security 过滤器链](/notes/source/java/spring/spring-security/)