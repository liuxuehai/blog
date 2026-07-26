---
title: 核心概念
description: 统一语言、实体、值对象、聚合、仓储、领域服务、应用服务、领域事件。
category: Architecture
tags:
  - DDD
  - Domain Modeling
order: 31
updatedDate: 2026-07-26
difficulty: intermediate
status: stable
lastReviewed: 2026-07-26
draft: false
sidebar:
  order: 31
---

DDD 不是某个框架，也不是简单的分层架构，而是一套围绕复杂业务建模的软件设计方法。

核心思想：代码结构应该反映业务领域，复杂业务规则应该放在领域模型中，通过统一语言、领域模型、聚合、领域事件等方式让业务和代码保持一致。

<!-- more -->

## 统一语言 Ubiquitous Language

统一语言是业务、产品、开发、测试共同使用的一套业务词汇。

例如在业财系统中：收款、付款、清分、抵扣、应收、应付、对账、结算单。

**价值：**

- 避免代码里出现和业务不一致的命名
- 降低沟通成本
- 让模型和业务概念对应

## 实体 Entity

实体有唯一身份，身份不变，属性可以变。

**例子：** Order、User、PaymentOrder、Account

**判断标准：** 两个对象属性完全相同，但业务上仍然是两个不同对象，那就是实体。例如两个订单金额相同、商品相同，也仍然是两个订单，因为订单号不同。

## 值对象 Value Object

值对象没有独立身份，只看值是否相等，通常不可变。

**例子：** Money、Address、DateRange、PhoneNumber、Email、OrderNo

**好处：**

- 避免 primitive obsession——到处使用 String、BigDecimal、Integer 表达业务概念
- 可以把校验逻辑封装在构造方法里

```java
public class Money {
    private final BigDecimal amount;
    private final String currency;

    public Money(BigDecimal amount, String currency) {
        if (amount == null || amount.compareTo(BigDecimal.ZERO) < 0) {
            throw new IllegalArgumentException("金额不能为负");
        }
        this.amount = amount;
        this.currency = currency;
    }

    public Money add(Money other) {
        if (!this.currency.equals(other.currency)) {
            throw new IllegalArgumentException("币种不一致");
        }
        return new Money(this.amount.add(other.amount), this.currency);
    }
}
```

## 聚合 Aggregate

聚合是一组强一致性的领域对象集合，聚合根负责维护内部一致性。

**例子：**

- Order 是聚合根，OrderItem 是聚合内部对象
- PaymentOrder 是聚合根，PaymentRecord 是内部记录
- Account 是聚合根，BalanceChange 是内部流水或事件

**核心规则：**

- 外部只能通过聚合根修改聚合内部对象
- 聚合内部要保证强一致性
- 聚合之间尽量通过 ID 引用，而不是直接对象引用

> 聚合边界不是按表划分，而是按一致性边界划分。必须在同一个事务里保证一致的对象，才适合放在同一个聚合里。

## 仓储 Repository

Repository 负责聚合的持久化和重建，不是简单 DAO，而是面向聚合根。

```java
public interface OrderRepository {
    Order findById(OrderId orderId);
    void save(Order order);
}
```

**注意：**

- Repository 接口通常放在领域层
- Repository 实现放在基础设施层
- 领域层不依赖 MyBatis、JPA、Redis 等技术细节

## 领域服务 Domain Service

当一个业务行为不适合放在某个实体或值对象中时，可以放在领域服务。

**适合场景：**

- 跨多个聚合的业务规则
- 无明显归属实体的领域计算

**例子：** 风控检查服务、定价服务、支付渠道选择服务、清分规则服务

**注意：** 领域服务不是应用服务。领域服务应该表达业务规则，不处理事务、RPC、消息发送等技术流程。

## 应用服务 Application Service

应用服务负责编排流程，但不承载核心业务规则。

**职责：** 开启事务 → 查询聚合 → 调用领域方法 → 调用领域服务 → 保存聚合 → 发布领域事件 → 返回 DTO

```java
@Service
public class PaymentApplicationService {

    @Transactional
    public void pay(PayCommand command) {
        PaymentOrder paymentOrder = paymentOrderRepository.findById(command.getPaymentOrderId());
        paymentOrder.pay(command.getAmount());
        paymentOrderRepository.save(paymentOrder);
        eventPublisher.publish(paymentOrder.pullDomainEvents());
    }
}
```

## 领域事件 Domain Event

领域事件表示领域中已经发生的事实，命名通常用过去式。

**例子：** OrderCreated、PaymentSucceeded、PaymentFailed、AccountBalanceChanged、ReceivableSettled

**作用：**

- 解耦后续动作
- 支持最终一致
- 记录业务事实
- 支持审计和追溯

支付成功后可能触发：更新订单状态、发送通知、生成账务流水、推送清结算。这些动作不一定都放在支付聚合里，可以通过领域事件解耦。
