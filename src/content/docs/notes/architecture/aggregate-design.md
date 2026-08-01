---
title: 聚合与聚合根设计
description: 聚合边界划分、聚合根设计原则、跨聚合事务、聚合间引用策略。
category: Architecture
tags:
  - DDD
  - Aggregate Design
  - Consistency
order: 33
updatedDate: 2024-04-02
difficulty: advanced
status: stable
lastReviewed: 2024-09-05
draft: false
sidebar:
  order: 33
---

聚合设计是 DDD 最难的部分——边界画错了，要么一致性出问题，要么性能扛不住。

<!-- more -->

## 聚合是什么

聚合是一组需要共同维护业务一致性的实体和值对象；聚合根是这组对象对外唯一的操作入口。

例如应收聚合：

```text
Receivable 应收账款（聚合根）
├── ReceivableLine 应收明细（实体）
├── Money 金额（值对象）
├── BusinessSource 业务来源（值对象）
└── AccountingPeriod 账期（值对象）
```

外部不能直接修改 ReceivableLine，只能调用聚合根：

```java
receivable.verify(amount);
receivable.reverse(reason);
receivable.adjust(amount);
```

## 聚合根的作用

### 1. 维护业务不变量

无论从哪个接口调用，都必须满足：

- 核销金额不能超过应收余额
- 已关闭应收不能调整
- 已完全核销应收不能再次核销
- 应收余额不能小于 0

### 2. 控制内部对象的修改

禁止外部绕过聚合根直接修改明细：

```java
// 不应该出现
receivableLine.setVerifiedAmount(amount);

// 应该通过聚合根
receivable.verify(lineId, amount);
```

### 3. 定义事务一致性边界

一个聚合内部的状态通常在一个事务中一起提交：应收余额减少 + 核销金额增加 + 应收状态变化 + 产生核销事件。这些操作要么全部成功，要么全部失败。

### 4. 控制生命周期

内部实体通常依附聚合根存在。例如删除应收账款时，应收明细也失去业务意义。

## 聚合根的基本要求

### 1. 具有独立业务标识

```java
private ReceivableId id;
```

标识不能依赖名称、状态等可变属性。

### 2. 必须保护内部状态

避免公开无约束的 setter：

```java
// 不推荐
receivable.setStatus(VERIFIED);
receivable.setOutstandingAmount(BigDecimal.ZERO);

// 通过有业务含义的方法改变状态
receivable.verify(amount);
```

### 3. 外部只能通过聚合根访问内部对象

内部集合不要直接暴露：

```java
public List<ReceivableLine> getLines() {
    return Collections.unmodifiableList(lines);
}
```

### 4. 聚合之间通过 ID 引用

```java
public class Receivable {
    private CustomerId customerId;
    private OrderId sourceOrderId;
}
```

避免加载完整对象图：

```java
// 不推荐
private Customer customer;
private SaleOrder saleOrder;
```

否则容易出现聚合过大、加载缓慢和事务边界混乱。

### 5. 一个聚合根对应一个 Repository

```java
public interface ReceivableRepository {
    Receivable findById(ReceivableId id);
    void save(Receivable receivable);
}
```

通常不单独提供 `ReceivableLineRepository`，因为应收明细必须由应收聚合根管理。

### 6. 聚合尽量小

不要因为数据库有外键，就把所有关联对象放入同一个聚合。判断依据是业务一致性，而不是表关系。

## 如何设计聚合根

### 1. 从业务行为开始

先列出业务命令，不要先看数据库表设计聚合：

- 创建应收
- 调整应收
- 发起核销
- 完成核销
- 冲销应收
- 关闭应收

### 2. 找出业务不变量

例如：

- 原始应收金额必须大于 0
- 累计核销金额不能超过应收金额
- 只有生效状态才能核销
- 完全核销后状态必须变成已核销
- 同一次核销请求不能重复处理

### 3. 找出必须原子修改的数据

如果几个数据必须同时正确，就考虑放入同一个聚合：

- 应收总金额
- 已核销金额
- 剩余金额
- 应收状态
- 核销明细

它们共同决定应收账款是否正确，适合由一个聚合根管理。

### 4. 选择聚合根

选择能够代表整体生命周期、保护全部不变量的对象作为聚合根：

```java
public class Receivable {

    private ReceivableId id;
    private Money totalAmount;
    private Money verifiedAmount;
    private ReceivableStatus status;
    private List<VerificationRecord> records;

    public void verify(VerificationId verificationId, Money amount) {
        checkCanVerify(verificationId, amount);

        verifiedAmount = verifiedAmount.add(amount);
        records.add(VerificationRecord.create(verificationId, amount));

        if (verifiedAmount.equals(totalAmount)) {
            status = ReceivableStatus.VERIFIED;
        }

        registerEvent(new ReceivableVerifiedEvent(id, amount));
    }

    private void checkCanVerify(
            VerificationId verificationId,
            Money amount) {

        if (status == ReceivableStatus.CLOSED) {
            throw new DomainException("已关闭应收不能核销");
        }

        if (records.stream().anyMatch(
                record -> record.isSameVerification(verificationId))) {
            throw new DomainException("该核销请求已经处理");
        }

        if (amount.isGreaterThan(outstandingAmount())) {
            throw new DomainException("核销金额不能超过应收余额");
        }
    }

    public Money outstandingAmount() {
        return totalAmount.subtract(verifiedAmount);
    }
}
```

### 5. 处理聚合之间的协作

应收账款和收款单通常是两个聚合：

- Receivable：管理应收余额
- CollectionOrder：管理收款可用余额

不要简单地把两个对象合并成一个巨大聚合。应用服务负责加载和编排：

```java
@Transactional
public void verify(VerifyCommand command) {
    Receivable receivable =
            receivableRepository.findById(command.receivableId());

    CollectionOrder collection =
            collectionRepository.findById(command.collectionId());

    collection.occupy(command.amount());
    receivable.verify(command.verificationId(), command.amount());

    collectionRepository.save(collection);
    receivableRepository.save(receivable);
}
```

DDD 通常建议一个事务修改一个聚合，但这不是绝对规定。资金核销等场景如果要求强一致，可以：

- 在同一数据库事务中更新两个聚合，并使用乐观锁
- 引入"核销单"聚合，管理核销过程和幂等状态
- 通过冻结、确认、释放机制实现跨聚合一致性
- 使用数据库唯一索引和流水记录作为最终保障

> 不能为了形式上的"一个事务一个聚合"，让资金数据出现不可接受的短暂错误。

## 聚合边界划分

**判断标准：**

- 哪些对象必须在一个事务内保持强一致
- 哪些规则必须由同一个聚合根保护
- 哪些对象生命周期依赖聚合根

不要按数据库外键直接划分。

**例子：**

订单和商品不应该放在一个聚合——商品生命周期独立，订单只需要商品快照，订单通过商品 ID 或商品快照引用。

订单和订单明细通常可以是一个聚合——明细依赖订单存在，订单总金额需要和明细保持一致。

## 聚合越大越好吗

| 聚合太大 | 聚合太小 |
|----------|----------|
| 事务范围大 | 一致性规则难维护 |
| 锁冲突多 | 跨聚合流程变复杂 |
| 并发性能差 | |
| 加载成本高 | |

> 聚合边界要在一致性和性能之间平衡。强一致的规则放在聚合内，跨聚合协作尽量用领域事件和最终一致。

## 聚合之间能不能直接互相引用

一般不建议直接对象引用，建议通过 ID 引用。

**原因：**

- 降低聚合耦合
- 避免一次加载过大对象图
- 明确事务边界
- 避免误修改其他聚合内部状态

## 高难度：大量子实体怎么办

如果一个订单有几千个订单明细，还适合放在一个聚合里吗？

**不一定。** 要看一致性要求。如果每次修改订单都必须校验全部明细，那放一起有业务理由，但性能会有问题，需要拆分加载或重新设计规则。如果订单明细可以分批处理，或者只需要最终汇总一致，可以考虑拆成更小聚合，用事件更新订单汇总。

## 跨聚合事务

优先避免跨聚合强事务。

**常见方式：**

- 一个聚合内保持强一致
- 跨聚合用领域事件实现最终一致
- 必要时使用 Saga、事务消息、补偿任务、对账机制

## 领域事件与事务一致性

领域事件发布和事务提交怎么保证一致？

**常见方案（Outbox Pattern）：**

1. 在同一个本地事务中保存业务数据和 outbox 事件表
2. 事务提交后由后台任务或消息 relay 投递 MQ
3. 消费端幂等处理

**避免：**

- 先提交 DB，再发 MQ——MQ 失败会丢事件
- 先发 MQ，再提交 DB——消费者可能读不到数据

## 常见错误

1. 把主表对应的实体直接认定为聚合根
2. 一个聚合包含订单、客户、库存、应收、收款等所有对象
3. 聚合根只有 getter/setter，业务都写在 Service
4. 聚合方法中直接调用 MQ、Feign、数据库或第三方接口
5. 一个请求加载并修改十几个聚合
6. 为追求纯 DDD，对资金强一致场景强行使用最终一致性

> 最重要的判断标准是：哪些数据必须在一次业务操作中共同保持正确？必须共同保持正确的数据构成一致性边界，由聚合根统一保护。聚合根不是"最重要的表"，而是业务规则和事务一致性的守门入口。
