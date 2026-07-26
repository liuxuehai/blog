---
title: 流控规则
description: Sentinel 流量控制的 QPS 模式、线程数模式、流控效果与关联模式。
category: Backend
tags:
  - Sentinel
  - Flow Control
  - Rate Limiting
order: 541
updatedDate: 2026-07-26
difficulty: advanced
status: stable
lastReviewed: 2026-07-26
draft: false
sidebar:
  order: 541
---

流量控制是 Sentinel 的核心能力——根据系统处理能力对请求进行调控，将随机请求调整为合适的形状。

<!-- more -->

## 三个控制角度

| 角度 | 说明 |
|------|------|
| **资源调用关系** | 调用链路、资源间关系（关联模式） |
| **运行指标** | QPS、线程数等实时指标 |
| **控制效果** | 直接限流、冷启动、排队等待 |

## 流控模式

### 直接模式

当资源的 QPS 或并发线程数超过阈值时，直接拒绝请求。

```java
FlowRule rule = new FlowRule();
rule.setResource("orderService");
rule.setGrade(RuleConstant.FLOW_GRADE_QPS); // QPS 模式
rule.setCount(100);                          // 阈值 100 QPS
rule.setControlBehavior(RuleConstant.CONTROL_BEHAVIOR_DEFAULT); // 直接拒绝
FlowRuleManager.loadRules(Collections.singletonList(rule));
```

### 关联模式

当关联资源的 QPS 超过阈值时，限制当前资源的访问。用于保护优先级较高的资源。

```java
FlowRule rule = new FlowRule();
rule.setResource("orderQuery");
rule.setGrade(RuleConstant.FLOW_GRADE_QPS);
rule.setCount(50);
rule.setStrategy(RuleConstant.STRATEGY_RELATE);
rule.setRefResource("orderCreate"); // 关联资源
// 当 orderCreate 的 QPS 超过阈值时，限制 orderQuery
```

**应用场景：** 当写接口（orderCreate）压力大时，限制读接口（orderQuery），保障写接口优先。

### 链路模式

只统计从指定入口进来的资源调用，精确到调用链路。

```java
FlowRule rule = new FlowRule();
rule.setResource("orderService");
rule.setGrade(RuleConstant.FLOW_GRADE_QPS);
rule.setCount(100);
rule.setStrategy(RuleConstant.STRATEGY_CHAIN);
rule.setRefResource("createFromWeb"); // 只统计从 Web 入口的调用
```

## 流控效果

### 直接拒绝（Default）

超过阈值的请求直接返回 `BlockException`，客户端收到限流响应。

```java
rule.setControlBehavior(RuleConstant.CONTROL_BEHAVIOR_DEFAULT);
```

特点：简单粗暴，适合对延迟敏感的场景。

### Warm Up（预热）

系统冷启动时，请求阈值从一个较低的值逐步升高到设定值，避免冷系统被大量请求击垮。

```java
rule.setControlBehavior(RuleConstant.CONTROL_BEHAVIOR_WARM_UP);
rule.setWarmUpPeriodSec(10); // 预热时长 10 秒
```

**原理：** 阈值从 `count / coldFactor`（默认 3）逐步升高到 `count`。默认冷加载因子为 3，即从阈值的 1/3 开始，经过预热时长后达到完整阈值。

**应用场景：**

- 刚启动的服务，JVM 还未充分预热
- 数据库连接池刚建立，连接数有限
- 缓存还没热起来，大量请求会穿透到 DB

### 排队等待（Rate Limiter）

严格控制请求以匀速通过，超出的请求排队等待，超时则拒绝。

```java
rule.setControlBehavior(RuleConstant.CONTROL_BEHAVIOR_RATE_LIMITER);
rule.setMaxQueueingTimeMs(500); // 最大排队等待时间 500ms
```

**原理：** 以固定间隔放行请求（如 100 QPS 则每 10ms 放行一个），超出的请求进入队列等待。

**应用场景：**

- 消息队列的消费速率控制
- 调用第三方 API 的速率限制
- 需要平滑流量的场景

### 三种流控效果对比

| 效果 | 超限行为 | 延迟 | 适用场景 |
|------|----------|------|----------|
| 直接拒绝 | 返回 BlockException | 无 | 通用场景、对延迟敏感 |
| Warm Up | 预热期间逐步放量 | 无 | 冷启动、缓存预热 |
| 排队等待 | 排队，超时拒绝 | 有（可控） | 平滑流量、速率限制 |

## 流控规则字段

| 字段 | 说明 | 类型 | 默认值 |
|------|------|------|--------|
| `resource` | 资源名 | String | — |
| `grade` | 限流阈值类型（QPS / 并发线程数） | int | QPS |
| `count` | 限流阈值 | double | — |
| `strategy` | 流控模式（直接 / 关联 / 链路） | int | 直接 |
| `refResource` | 关联资源名 | String | — |
| `controlBehavior` | 流控效果（拒绝 / Warm Up / 排队） | int | 直接拒绝 |
| `warmUpPeriodSec` | 预热时长（秒） | int | 10 |
| `maxQueueingTimeMs` | 最大排队等待时间（毫秒） | int | 500 |

## QPS vs 线程数

| 维度 | QPS 模式 | 线程数模式 |
|------|----------|------------|
| 统计指标 | 每秒请求数 | 并发处理线程数 |
| 限流时机 | 请求进入时 | 请求进入时 |
| 适用场景 | 整体流量控制 | 慢接口保护 |
| 效果 | 限制请求速率 | 限制并发处理能力 |

**线程数模式应用场景：** 当接口响应时间长（如调用外部慢服务），用线程数限制可以防止线程堆积：

```java
FlowRule rule = new FlowRule();
rule.setResource("slowService");
rule.setGrade(RuleConstant.FLOW_GRADE_THREAD); // 线程数模式
rule.setCount(10); // 最多 10 个并发线程
```

## 注解方式配置

```java
@SentinelResource(value = "orderService",
    blockHandler = "orderServiceBlockHandler",
    fallback = "orderServiceFallback")
public OrderVO createOrder(OrderDTO dto) {
    // 业务逻辑
}

// 限流处理
public OrderVO orderServiceBlockHandler(OrderDTO dto, BlockException ex) {
    throw new RuntimeException("系统繁忙，请稍后重试");
}

// 降级处理
public OrderVO orderServiceFallback(OrderDTO dto, Throwable ex) {
    return OrderVO.builder().message("服务降级").build();
}
```
