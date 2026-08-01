---
title: TCC 模式
description: Seata TCC 模式的 Try-Confirm-Cancel 原理、空回滚、幂等、悬挂问题与解决方案。
category: Backend
tags:
  - Seata
  - TCC Mode
  - Distributed Transaction
order: 532
updatedDate: 2024-08-18
difficulty: advanced
status: stable
lastReviewed: 2025-02-10
draft: false
sidebar:
  order: 532
---

TCC（Try-Confirm-Cancel）模式是一种高性能的分布式事务方案，业务需要自己实现资源的预留、确认和释放，但换来的是更细粒度的控制和更好的性能。

<!-- more -->

## 工作原理

TCC 将每个分支事务拆成三个阶段：

| 阶段 | 作用 | 说明 |
|------|------|------|
| **Try** | 资源预留 | 检查业务可行性，冻结/预留资源，但不真正扣减 |
| **Confirm** | 确认提交 | 使用 Try 阶段预留的资源，完成真正的业务操作 |
| **Cancel** | 释放回滚 | 释放 Try 阶段预留的资源，恢复到事务前状态 |

### 流程图

```text
TM 发起全局事务
  ↓
各 RM 执行 Try
  ├─ 检查业务条件
  ├─ 冻结/预留资源
  └─ 向 TC 注册分支
  ↓
TC 汇总所有 Try 结果
  ├─ 全部成功 → 逐个执行 Confirm → 释放全局锁
  └─ 有失败   → 逐个执行 Cancel → 释放全局锁
```

## 业务示例：扣减账户余额

### Try 阶段——冻结金额

```java
@Component
public class AccountTccAction {

    @TwoPhaseBusinessAction(name = "accountDeduct",
        commitMethod = "confirm",
        rollbackMethod = "cancel")
    public boolean tryDeduct(
            BusinessActionContext context,
            @BusinessActionContextParameter(paramName = "userId") String userId,
            @BusinessActionContextParameter(paramName = "amount") BigDecimal amount) {

        // 检查余额是否充足
        Account account = accountMapper.selectByUserId(userId);
        if (account.getAvailable().compareTo(amount) < 0) {
            throw new RuntimeException("余额不足");
        }

        // 冻结金额：available -= amount, frozen += amount
        accountMapper.freeze(userId, amount);
        return true;
    }

    public boolean confirm(BusinessActionContext context) {
        // 确认扣减：frozen -= amount
        String userId = context.getActionContext("userId").toString();
        BigDecimal amount = new BigDecimal(context.getActionContext("amount").toString());
        accountMapper.confirmDeduct(userId, amount);
        return true;
    }

    public boolean cancel(BusinessActionContext context) {
        // 释放冻结：frozen -= amount, available += amount
        String userId = context.getActionContext("userId").toString();
        BigDecimal amount = new BigDecimal(context.getActionContext("amount").toString());
        accountMapper.cancelDeduct(userId, amount);
        return true;
    }
}
```

### 账户表设计

```sql
CREATE TABLE `account` (
  `user_id` varchar(64) NOT NULL,
  `total` decimal(20,2) NOT NULL COMMENT '总余额',
  `frozen` decimal(20,2) NOT NULL DEFAULT 0.00 COMMENT '冻结金额',
  `available` decimal(20,2) GENERATED ALWAYS AS (`total` - `frozen`) STORED COMMENT '可用余额',
  PRIMARY KEY (`user_id`)
);
```

Try 阶段 `frozen += amount`；Confirm 阶段 `total -= amount, frozen -= amount`；Cancel 阶段 `frozen -= amount`。

## 三个必须解决的问题

TCC 模式在工程实现中必须处理三个经典问题，否则在异常场景下会出现数据不一致。

### 1. 空回滚

**问题：** Try 还没执行，Cancel 先到了（比如 Try 超时，TC 发起回滚）。此时 Cancel 需要识别出"没有对应的 Try"，直接返回成功，不做任何操作。

**解决：** 用事务 ID 记录 Try 是否执行过。

```java
public boolean cancel(BusinessActionContext context) {
    String xid = context.getXid();
    // 检查 Try 是否执行过
    if (!tryRecordMapper.exists(xid)) {
        // 空回滚，直接返回
        return true;
    }
    // 正常回滚逻辑
    accountMapper.cancelDeduct(userId, amount);
    tryRecordMapper.delete(xid);
    return true;
}
```

### 2. 幂等

**问题：** Confirm 或 Cancel 可能被重复调用（网络重试、TC 重试）。必须保证多次执行结果一致。

**解决：** 用事务 ID 做幂等键，执行后记录状态。

```java
public boolean confirm(BusinessActionContext context) {
    String xid = context.getXid();
    if (confirmRecordMapper.exists(xid)) {
        return true; // 已执行过，幂等返回
    }
    accountMapper.confirmDeduct(userId, amount);
    confirmRecordMapper.insert(xid);
    return true;
}
```

### 3. 悬挂

**问题：** Cancel 先执行完了（空回滚），Try 才到。此时资源已经被 Cancel 释放，Try 又会冻结资源，导致这部分资源永远无法释放。

**解决：** 空回滚时记录标记，Try 执行前检查是否已经空回滚过。

```java
public boolean tryDeduct(BusinessActionContext context, ...) {
    String xid = context.getXid();
    // 检查是否已经空回滚过
    if (cancelRecordMapper.exists(xid)) {
        throw new RuntimeException("事务已回滚，拒绝执行 Try");
    }
    // 正常 Try 逻辑
    ...
}
```

## 三个问题的关联

```text
正常流程：  Try → Confirm
异常流程：  Try 超时 → Cancel（空回滚）→ Try 到达（悬挂）
           Cancel 重复调用（幂等）
           Confirm 重复调用（幂等）
```

> 空回滚、幂等、悬挂是 TCC 的三道必答题，漏掉任何一道都会导致资金不一致。

## TCC 的资源锁定粒度

TCC 相比 AT 的核心优势是**资源锁定粒度可控**：

| 对比 | AT | TCC |
|------|-----|-----|
| 锁定方式 | 全局锁（行级） | 业务自定义（冻结字段） |
| 锁定时间 | 一阶段到二阶段 | Try 到 Confirm/Cancel |
| 锁定范围 | 整行数据 | 只锁定需要的字段/资源 |
| 并发能力 | 受全局锁限制 | 冻结字段无锁竞争 |

## 适用场景

| 场景 | 原因 |
|------|------|
| 资金扣减 | 需要精确冻结，不能多扣也不能少扣 |
| 库存预占 | 预留库存，支付成功后才真正扣减 |
| 积分/优惠券 | 预留资源，确认后才消费 |
| 高并发场景 | AT 的全局锁成为瓶颈时 |

## 局限性

| 局限 | 说明 |
|------|------|
| **侵入性高** | 每个分支事务需要实现三个方法 |
| **设计复杂** | 需要设计冻结字段、处理三个异常问题 |
| **业务耦合** | Try/Confirm/Cancel 的逻辑与业务强绑定 |
| **不适合复杂查询** | TCC 针对写操作设计，查询走其他路径 |

> TCC 的成本在于设计和实现，但它换来的是精确的资源控制和更好的并发能力。资金、库存等核心链路值得投入。
