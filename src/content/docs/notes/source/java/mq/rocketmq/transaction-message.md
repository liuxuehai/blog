---
title: 事务消息半消息与回查
description: RocketMQ 如何用半消息、提交回滚和回查把本地事务结果接入消息可见性。
category: Backend
tags: [Source Reading, RocketMQ, Transaction Message]
order: 15
updatedDate: 2026-08-24
difficulty: advanced
status: stable
lastReviewed: 2026-08-24
draft: false
sidebar:
  order: 15
---

事务消息处理的是“本地事务完成”和“消息对消费者可见”之间的竞态。RocketMQ 先保存不可见的半消息，再根据生产者结果提交、回滚或回查。

<!-- more -->

## 先给答案：事务消息推迟消息可见性，但不接管业务数据库事务

Broker 先保存消费者不可见的半消息，生产者执行本地事务后再提交或回滚；最终状态丢失时，Broker 通过回查询问生产者。它解决的是“本地事务已结束，但最终消息指令未可靠到达”这一不确定窗口。

这是一种最终一致性协议，不是跨数据库与 Broker 的强一致提交。生产者事务监听器必须能幂等回答回查，Broker 要限制检查次数和半消息停留时间，消费者仍要应对提交重试或恢复造成的重复投递。

## 状态机

```text
prepare -> HALF
            ├─ commit -> REAL topic
            ├─ rollback -> deleted/hidden
            └─ timeout -> broker check -> producer result
```

## 两阶段路径

`TransactionalMessageServiceImpl#asyncPrepareMessage`（`broker/src/main/java/org/apache/rocketmq/broker/transaction/queue/TransactionalMessageServiceImpl.java:99`）把消息写入事务主题；同步入口 `prepareMessage`（`:104`）提供阻塞调用。半消息保存原始 Topic、Queue 和事务属性，但消费者不会按原始业务 Topic 读取。

最终状态由 `EndTransactionProcessor#processRequest`（`broker/src/main/java/org/apache/rocketmq/broker/processor/EndTransactionProcessor.java:59`）处理。提交路径在 `:134-157` 恢复真实 Topic 并重新写入；回滚路径在 `:169-181` 删除或标记半消息。

## 回查

Broker 定时执行 `TransactionalMessageServiceImpl#check`（`broker/src/main/java/org/apache/rocketmq/broker/transaction/queue/TransactionalMessageServiceImpl.java:162`），筛选超时且状态未知的半消息，询问生产者本地事务结果。检查必须有最大次数、超时和再次检查策略，不能把一次网络失败直接当成提交或回滚。

半消息删除入口为 `deletePrepareMessage`（`TransactionalMessageServiceImpl.java:597`）；提交后的删除分支位于 `EndTransactionProcessor.java:192`，回查标识由 `EndTransactionProcessor.java:71` 判断。

事务消息查询半消息的结果处理位于 `TransactionalMessageServiceImpl.java:587`，Broker 角色限制在 `TransactionalMessageServiceImpl.java:237`，生产者提交后的延迟指标更新在 `EndTransactionProcessor.java:157`。

## 为什么不用 Broker 直接执行本地事务

**替代方案**：Broker 调用业务数据库并统一控制事务。
**为什么不行**：Broker 无法理解业务边界，也不能安全持有数据库连接；跨系统两阶段提交会增加锁持有时间和故障阻塞。
**证据**：`EndTransactionProcessor` 只处理生产者明确返回的提交/回滚以及 `fromTransactionCheck` 回查标识（`EndTransactionProcessor.java:71`）。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| 提交请求丢失 | 半消息进入回查 | Broker 未收到最终状态 | 事务监听器幂等，允许回查 |
| 回查不确定 | 消息长时间不可见 | 生产者无法判断本地事务 | 设置检查上限和人工补偿 |
| 重复提交 | 消费端重复 | 重试和恢复可能重复投递 | 消费者必须幂等 |
| 半消息堆积 | 事务主题增长 | 生产者异常或长期不响应 | 监控半消息年龄和数量 |

## 可迁移知识

半消息是“预写入 + 延迟可见”的最终一致性模式，适用于订单、库存和支付回调，但不等价于跨系统强一致事务。

> **面试锚点**
> - 半消息为什么不能直接被消费者读取？
> - 回查解决的是哪类故障？
> - 事务消息为什么仍要求消费端幂等？

## Related

- [整体架构](/notes/source/java/mq/rocketmq/architecture/)
- [CommitLog 顺序写与 mmap](/notes/source/java/mq/rocketmq/commitlog/)
- [Spring Cloud Alibaba RocketMQ Binder](/notes/source/java/spring/spring-cloud-alibaba/rocketmq-binder/)
