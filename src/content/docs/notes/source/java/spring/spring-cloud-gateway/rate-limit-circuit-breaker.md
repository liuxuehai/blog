---
title: 限流与熔断
description: RequestRateLimiter、Redis 令牌桶与 Spring Cloud CircuitBreaker 回退。
category: Backend
tags: [Source Reading, Spring Cloud Gateway, Rate Limit, Circuit Breaker]
order: 55
updatedDate: 2026-08-19
difficulty: advanced
status: stable
lastReviewed: 2026-08-19
draft: false
sidebar:
  order: 55
---

Gateway 把限流和熔断实现成普通路由过滤器，因此它们可以参与统一排序、异常传播和 fallback，而不是另起一套请求生命周期。

<!-- more -->

## 先给答案：限流控制“请求能不能进入”，熔断控制“失败服务是否继续被调用”

Redis 限流通常在请求真正转发前根据 key 和窗口消耗配额；熔断器则根据一段时间内的失败或慢调用状态，在 Open 状态快速失败，Half-Open 时放少量探测请求。两者都能返回 fallback，却处在不同的时间和状态边界。

限流过严会拒绝健康请求，熔断过早会放大短暂抖动；fallback 也不等于成功，只是把失败转换成可控响应。排查时要区分配额耗尽、下游连接失败、超时和熔断状态迁移。


## 流程

```text
请求
 |
 +-- KeyResolver -> RateLimiter#isAllowed
 |                  +-- Redis Lua token bucket
 |
 +-- CircuitBreaker#run
       +-- 成功 -> 下游响应
       +-- 失败/状态码 -> fallback route
```

## Redis 限流

`RateLimiter.java:30-57` 定义统一的 `Mono<Response>` 契约和剩余 token/header 结果；`RequestRateLimiterGatewayFilterFactory.java:111-151` 解析 route、调用 `KeyResolver` 和 `RateLimiter`；允许时继续 chain，不允许时按配置抛出 429 异常或结束请求。

`RedisRateLimiter.java:57-72` 保存 Redis template、脚本和初始化状态；`160-176` 用 route 和 key 生成带 hash tag 的 token/timestamp 两个 key，使 Redis Cluster 的两个 key 落在同一 slot。`245-286` 读取 replenish rate、burst capacity、requested tokens，并通过 `redisTemplate.execute` 原子执行 Lua 脚本。

脚本结果的第一个值表示 allowed，第二个值表示剩余 token，`RedisRateLimiter.java:269-282` 转换为 `RateLimiter.Response` 和响应头。Redis 调用异常时，`287-305` 采用 fail-open，允许流量但记录错误。

## 熔断与 fallback

`SpringCloudCircuitBreakerFilterFactory.java:92-107` 创建 reactive circuit breaker，并把 `chain.filter(exchange)` 放入 `cb.run`。`107-112` 还能把指定 HTTP 状态码视为失败。

有 fallback 时，`SpringCloudCircuitBreakerFilterFactory.java:113-153` 重置响应、构造 fallback URI、写入 `GATEWAY_REQUEST_URL_ATTR` 并重新交给 dispatcher；无 fallback 则继续传播异常。

## 为什么这么设计

**替代方案**：在网关外单独部署限流和熔断代理。
**为什么不行**：路由级 key、状态码规则、fallback URI 与网关上下文分离后，需要重复传递配置，无法复用过滤器顺序。
**证据**：两类能力都通过 `GatewayFilterFactory.apply` 生成 `GatewayFilter`，见 `RequestRateLimiterGatewayFilterFactory.java:111-151` 和 `SpringCloudCircuitBreakerFilterFactory.java:92-158`。

## 参数与调优

| 参数 | 含义 | 风险 |
| --- | --- | --- |
| `replenishRate` | 每秒补充 token 数 | 过低造成稳态吞吐不足 |
| `burstCapacity` | 桶最大容量 | 过大导致突发压垮下游 |
| `requestedTokens` | 单请求消耗 token | 可按请求成本加权 |
| `KeyResolver` | 限流维度 | IP 可能受代理头伪造影响 |

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| Redis 不可用 | 流量仍被放行 | 实现选择 fail-open | 监控错误率，敏感接口改 fail-closed |
| fallback 再次匹配原路由 | fallback 循环 | URI 指向自身 | 使用独立 fallback route |
| 令牌参数过大 | 结果精度异常 | Lua 数字精度上限 | 遵守 `2^53-1` 限制 |

## 可迁移知识

限流是“共享状态 + 原子决策”，熔断是“错误分类 + 状态隔离 + 回退路径”。将两者包装为装饰器，能插入任意异步调用链。

> **面试锚点**
> - Gateway RedisRateLimiter 为什么用 Lua？
> - Redis 失败时默认是 fail-open 还是 fail-closed？
> - 熔断器如何把指定 HTTP 状态码视为失败？

## Related

- [GatewayFilter 链](/notes/source/java/spring/spring-cloud-gateway/gateway-filter-chain/)
- [Route 与 Predicate](/notes/source/java/spring/spring-cloud-gateway/route-predicate/)
- [Sentinel 源码解析](/notes/backend/sentinel/)
