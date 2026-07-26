---
title: 业务规则放置策略
description: 不同类型的业务规则应该放在值对象、聚合根、领域服务还是应用服务中。
category: Architecture
tags:
  - DDD
  - Business Rules
  - Design Principles
order: 31
updatedDate: 2026-07-26
difficulty: advanced
status: stable
lastReviewed: 2026-07-26
draft: false
sidebar:
  order: 31
---

业务约束最终应该成为可执行的业务代码，而不只是写在文档里的规则。但不代表所有规则都塞进一个模型类。

核心原则是：**规则放在最了解这些数据、最有能力保证规则不被绕过的位置。**

<!-- more -->

## 规则放置决策表

| 规则类型 | 推荐位置 | 示例 |
|----------|----------|------|
| 单个值的合法性 | 值对象 | 金额不能为负、币种不能为空 |
| 聚合内部必须始终成立的规则 | 聚合根 / 实体 | 核销金额不能超过应收余额 |
| 单个对象状态规则 | 对应聚合 | 已完全核销的应收不能再次核销 |
| 涉及多个聚合的规则 | 领域服务 / 领域策略 | 收款单和应收账款能否进行核销 |
| 需要查询数据库的规则 | 领域服务 + Repository | 同一业务单据不能重复生成应收 |
| 流程编排、事务、调用外部系统 | 应用服务 | 加载收款单、核销应收、保存、发消息 |
| 最终唯一性保障 | 数据库约束 | 业务来源类型 + 业务单号唯一索引 |

## 示例：应收核销规则拆解

### 聚合内部规则——应收账款自己能判断

```java
public class Receivable {

    private Money outstandingAmount;
    private ReceivableStatus status;

    public void verify(Money amount) {
        if (status == ReceivableStatus.VERIFIED) {
            throw new DomainException("应收账款已经完全核销");
        }

        if (amount.isGreaterThan(outstandingAmount)) {
            throw new DomainException("核销金额不能超过应收余额");
        }

        outstandingAmount = outstandingAmount.subtract(amount);

        if (outstandingAmount.isZero()) {
            status = ReceivableStatus.VERIFIED;
        }
    }
}
```

这样外部代码不能随意修改余额：

```java
// 不推荐
receivable.setOutstandingAmount(newAmount);

// 推荐
receivable.verify(amount);
```

模型表达的是"核销"这一业务行为，同时确保余额和状态一起正确变化。

### 跨对象规则——不要硬塞进聚合

"已作废收款单不能参与核销"涉及收款单和应收账款，可以由领域服务处理：

```java
public class VerificationDomainService {

    public void verify(
            Receivable receivable,
            CollectionOrder collection,
            Money amount) {

        if (!collection.canBeUsedForVerification()) {
            throw new DomainException("当前收款单不能参与核销");
        }

        if (amount.isGreaterThan(collection.availableAmount())) {
            throw new DomainException("核销金额不能超过收款单可用金额");
        }

        receivable.verify(amount);
        collection.occupy(amount);
    }
}
```

应用服务负责调用和事务编排：

```java
@Transactional
public void verify(VerificationCommand command) {
    Receivable receivable =
            receivableRepository.get(command.receivableId());

    CollectionOrder collection =
            collectionRepository.get(command.collectionId());

    verificationDomainService.verify(
            receivable,
            collection,
            command.amount());

    receivableRepository.save(receivable);
    collectionRepository.save(collection);
}
```

### 查询类规则——不能只靠模型

"同一业务单据不能重复生成应收"需要查询历史数据，单个应收对象无法判断。因此应在领域服务或应用服务中检查，并增加数据库唯一索引兜底：

```java
if (receivableRepository.existsByBusinessSource(source)) {
    throw new DomainException("该业务单据已经生成应收");
}
```

数据库同时设置：

```sql
UNIQUE KEY uk_business_source (source_type, source_order_no)
```

仅在 Java 中先查再插入会有并发问题，所以数据库唯一约束仍然必要。
