---
title: 热点参数限流
description: Sentinel 热点参数限流的原理、参数类型、阈值控制与特例配置。
category: Backend
tags:
  - Sentinel
  - Hotspot
  - Rate Limiting
order: 543
updatedDate: 2026-07-26
difficulty: advanced
status: stable
lastReviewed: 2026-07-26
draft: false
sidebar:
  order: 543
---

热点参数限流是 Sentinel 的精细化限流能力——对包含热点参数的资源调用进行限流，精确到参数级别。

<!-- more -->

## 为什么需要热点参数限流

普通流控对资源整体限流，但实际场景中：

- 某个商品 ID 的访问量远高于其他商品
- 某个用户的请求量远高于其他用户
- 某个门店的订单量远高于其他门店

这些"热点参数"会导致后端某些分片（如某个商品的缓存、某个用户的数据库记录）压力过大。热点参数限流可以精确到参数级别进行控制。

## 工作原理

```text
请求进入 → Sentinel 拦截 → 提取参数值 → 按参数值统计 QPS
  ↓
参数值 QPS 超过阈值 → 限流该参数值的请求
其他参数值的请求 → 不受影响
```

## 使用示例

```java
// 定义资源，index=0 表示第一个参数为热点参数
@SentinelResource(value = "getProduct",
    blockHandler = "getProductBlockHandler")
public ProductVO getProduct(Long productId) {
    return productService.getById(productId);
}
```

配置热点参数规则：

```java
ParamFlowRule rule = new ParamFlowRule("getProduct")
    .setParamIdx(0)                    // 参数索引（从 0 开始）
    .setGrade(RuleConstant.FLOW_GRADE_QPS)
    .setCount(100);                    // 每个参数值的 QPS 阈值 100

ParamFlowRuleManager.loadRules(Collections.singletonList(rule));
```

效果：任意一个 `productId` 的 QPS 超过 100 时被限流，其他 productId 不受影响。

## 参数类型支持

| 类型 | 说明 |
|------|------|
| `int` / `Integer` | 基本类型 / 包装类 |
| `long` / `Long` | 基本类型 / 包装类 |
| `String` | 字符串 |
| `char` / `Character` | 字符类型 |

## 特例配置

可以对特定参数值设置不同的限流阈值：

```java
ParamFlowRule rule = new ParamFlowRule("getProduct")
    .setParamIdx(0)
    .setGrade(RuleConstant.FLOW_GRADE_QPS)
    .setCount(100);  // 默认阈值

// 特例：热门商品 ID=8888 的阈值更严格
ParamFlowItem item = new ParamFlowItem()
    .setObject(String.valueOf(8888L))  // 参数值
    .setClassType(Long.class.getName())
    .setCount(50);                     // 特例阈值 50 QPS

rule.setParamFlowItemList(Collections.singletonList(item));
```

效果：

- `productId=8888`：QPS 阈值 50
- 其他 `productId`：QPS 阈值 100

## 热点参数限流 vs 普通流控

| 维度 | 普通流控 | 热点参数限流 |
|------|----------|-------------|
| 统计粒度 | 资源级别 | 参数值级别 |
| 限流对象 | 整个资源 | 特定参数值 |
| 适用场景 | 整体流量控制 | 热点数据保护 |
| 特例配置 | 不支持 | 支持对特定参数值设不同阈值 |

## 典型应用场景

### 1. 热点商品保护

```java
@SentinelResource(value = "getProductDetail")
public ProductDetailVO getProductDetail(Long productId) {
    // 热点商品走本地缓存，普通商品走 Redis
    return productService.getDetail(productId);
}
```

配置：每个商品 QPS 阈值 200，热门商品 ID=12345 阈值 50。

### 2. 用户级限流

```java
@SentinelResource(value = "getUserOrders")
public List<OrderVO> getUserOrders(Long userId) {
    return orderService.getByUserId(userId);
}
```

配置：每个用户 QPS 阈值 10，VIP 用户阈值 50。

### 3. 接口防刷

```java
@SentinelResource(value = "sendSms")
public void sendSms(String phoneNumber) {
    smsService.send(phoneNumber);
}
```

配置：每个手机号 QPS 阈值 1（每秒最多发 1 条短信）。

## 与热点探测框架的配合

热点参数限流与京东 hotkey 等热点探测框架可以配合使用：

| 组件 | 职责 |
|------|------|
| **hotkey** | 自动探测热点 key，推送到本地缓存 |
| **Sentinel 热点参数限流** | 对热点参数精确限流，保护后端 |

```text
请求 → hotkey 判断是否热 key
  ├─ 热 key → 走本地缓存 + Sentinel 限流保护
  └─ 普通 key → 走 Redis
```

> 热点参数限流是 Sentinel 区别于其他流控组件的核心能力之一。它解决了"整体不超限但局部过热"的问题。
