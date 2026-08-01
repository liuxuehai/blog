---
title: Saga 模式
description: Seata Saga 模式的状态机驱动、补偿策略、长事务编排与适用场景。
category: Backend
tags:
  - Seata
  - Saga Mode
  - Distributed Transaction
  - State Machine
order: 533
updatedDate: 2024-08-25
difficulty: advanced
status: stable
lastReviewed: 2025-02-10
draft: false
sidebar:
  order: 533
---

Saga 模式适合长事务和跨系统编排——每个步骤都有对应的补偿操作，失败时按逆序执行补偿，最终回到一致状态。

<!-- more -->

## 工作原理

Saga 将一个长事务拆成多个本地事务，每个本地事务都有一个对应的补偿操作：

```text
T1 → T2 → T3 → T4    （正向操作）

如果 T3 失败：
T4（未执行）→ C3 → C2 → C1    （逆向补偿）
```

### 两种实现方式

| 方式 | 说明 | Seata 采用 |
|------|------|-----------|
| **协同式（Choreography）** | 各服务通过事件自发协调，无中心协调者 | |
| **编排式（Orchestration）** | 由中心调度器按顺序调用各步骤和补偿 | ✅ |

Seata Saga 采用编排式，通过状态机定义正向操作和补偿操作的执行顺序。

## 状态机定义

Seata Saga 使用 JSON 定义状态机，描述每个状态的正向操作和补偿操作：

```json
{
  "Name": "createOrder",
  "StartState": "CreateOrder",
  "States": {
    "CreateOrder": {
      "Type": "ServiceTask",
      "ServiceName": "orderService",
      "ServiceMethod": "create",
      "CompensateState": "CancelOrder",
      "Next": "DeductInventory"
    },
    "DeductInventory": {
      "Type": "ServiceTask",
      "ServiceName": "inventoryService",
      "ServiceMethod": "deduct",
      "CompensateState": "RestoreInventory",
      "Next": "DeductBalance"
    },
    "DeductBalance": {
      "Type": "ServiceTask",
      "ServiceName": "accountService",
      "ServiceMethod": "debit",
      "CompensateState": "RefundBalance",
      "Next": "Succeed"
    },
    "CancelOrder": {
      "Type": "Compensate"
    },
    "RestoreInventory": {
      "Type": "Compensate"
    },
    "RefundBalance": {
      "Type": "Compensate"
    },
    "Succeed": {
      "Type": "Succeed"
    },
    "Fail": {
      "Type": "Fail"
    }
  }
}
```

### 执行流程

```text
正常流程：
CreateOrder → DeductInventory → DeductBalance → Succeed

DeductBalance 失败时：
DeductBalance 失败
  → RestoreInventory（补偿 DeductInventory）
  → CancelOrder（补偿 CreateOrder）
  → Fail
```

## 补偿操作设计原则

### 1. 补偿操作必须是幂等的

补偿操作可能被重试执行，多次执行结果必须一致。

```java
public void cancelOrder(String orderId) {
    Order order = orderMapper.selectById(orderId);
    if (order.getStatus() == OrderStatus.CANCELLED) {
        return; // 幂等：已取消则直接返回
    }
    orderMapper.updateStatus(orderId, OrderStatus.CANCELLED);
}
```

### 2. 补偿操作必须能成功

补偿操作不能依赖外部条件，必须保证最终执行成功。常见策略：

- 重试 + 退避
- 人工介入兜底
- 对账机制

### 3. 补偿操作要处理"目标不存在"的情况

正向操作可能部分成功，补偿时需要处理数据状态：

```java
public void refundBalance(String userId, BigDecimal amount) {
    Account account = accountMapper.selectByUserId(userId);
    if (account == null) {
        // 用户可能已被删除，记录日志并返回
        log.warn("用户不存在，跳过退款: {}", userId);
        return;
    }
    accountMapper.addBalance(userId, amount);
}
```

## Saga vs 其他模式

| 维度 | Saga | AT | TCC |
|------|------|-----|-----|
| 侵入性 | 高（实现正向+补偿） | 低（自动代理） | 高（实现 try/confirm/cancel） |
| 一致性 | 最终一致 | 最终一致 | 强一致 |
| 隔离性 | 无保证 | 读未提交 | 可串行化 |
| 性能 | 高（无全局锁） | 中等 | 高 |
| 事务长度 | 长事务友好 | 短事务 | 短事务 |
| 适用场景 | 跨系统编排、遗留系统 | 通用 CRUD | 资金、库存 |

## 适用场景

| 场景 | 原因 |
|------|------|
| **跨系统集成** | 各系统只暴露正向和补偿接口，无需共享数据库 |
| **遗留系统改造** | 无法改造成 TCC 的接口，只需提供补偿方法 |
| **长事务** | 事务执行时间长，不适合持有全局锁 |
| **业务流程编排** | 订单履约、供应链审批等多步骤流程 |
| **混合技术栈** | 不同服务使用不同数据库或中间件 |

## 局限性

| 局限 | 说明 |
|------|------|
| **无隔离性** | Saga 中间状态对外可见，可能出现脏读 |
| **补偿复杂** | 补偿操作不一定是正向操作的简单逆操作 |
| **最终一致** | 补偿可能延迟，中间状态可能持续一段时间 |
| **调试困难** | 长事务涉及多个服务，问题定位链路长 |

## 解决隔离性问题

Saga 最大的弱点是无隔离性。常见解决方案：

### 1. 语义锁

在业务层面加锁，标记数据为"处理中"：

```java
public void deductInventory(String productId, int count) {
    Product product = productMapper.selectById(productId);
    if (product.getStatus() == ProductStatus.PROCESSING) {
        throw new RuntimeException("商品正在处理中");
    }
    productMapper.updateStatus(productId, ProductStatus.PROCESSING);
    productMapper.deduct(productId, count);
}
```

### 2. 重试读

读取时发现数据处于中间状态，等待并重试。

### 3. 业务层面防重入

用幂等键和状态机防止重复操作。

> Saga 的核心思想是"先做，做错了再补偿"。它不要求资源预留，适合无法改造接口的遗留系统和跨系统长事务编排。代价是无隔离性和补偿的复杂性。
