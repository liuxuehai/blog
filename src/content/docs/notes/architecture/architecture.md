---
title: 架构与建模风格
description: DDD 分层架构、贫血模型与充血模型、与传统三层架构的对比。
category: Architecture
tags:
  - DDD
  - Architecture
  - Design Patterns
order: 32
updatedDate: 2024-06-10
difficulty: intermediate
status: stable
lastReviewed: 2025-03-20
draft: false
sidebar:
  order: 32
---

DDD 的分层不是为了好看，而是为了让业务规则和技术细节各归其位。

<!-- more -->

## DDD 分层架构

```text
interfaces / adapter 层
  Controller、MQ Consumer、RPC 接口、DTO

application 应用层
  用例编排、事务、权限、调用领域对象

domain 领域层
  实体、值对象、聚合、领域服务、领域事件、Repository 接口

infrastructure 基础设施层
  DB、Redis、MQ、RPC、Repository 实现、第三方接口
```

**依赖方向：**

```text
interfaces -> application -> domain
infrastructure -> domain
```

领域层尽量不依赖外部技术框架。

## 与传统三层架构的区别

**传统三层：**

```text
Controller -> Service -> DAO
```

常见问题：

- Service 变成上帝类
- 业务规则散落在 Service、SQL、工具类中
- 实体只有 getter/setter，变成贫血模型
- 状态流转缺乏统一入口

**DDD 分层：**

```text
Controller -> Application Service -> Domain Model -> Repository
```

区别：

- 业务规则放在领域对象中
- 应用服务负责编排，不负责业务细节
- 聚合根维护一致性
- Repository 面向聚合，而不是面向单表

## 贫血模型 vs 充血模型

**贫血模型：** 实体只有字段和 getter/setter，业务逻辑都在 Service 中。

**充血模型：** 实体/聚合包含业务行为，状态变更通过领域方法完成。

**不推荐：**

```java
order.setStatus(OrderStatus.PAID);
order.setPayTime(LocalDateTime.now());
orderMapper.update(order);
```

**推荐：**

```java
order.pay(paymentAmount);
orderRepository.save(order);
```

`pay()` 方法内部校验：当前状态是否允许支付、支付金额是否匹配、是否重复支付、状态如何流转、是否产生领域事件。
