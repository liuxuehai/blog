---
title: Apache RocketMQ
description: RocketMQ 的事务消息、顺序消息、延迟消息、Tag/Key 过滤与高可靠架构。
category: Backend
tags:
  - RocketMQ
  - Message Queue
  - Financial
order: 553
updatedDate: 2024-07-15
difficulty: advanced
status: stable
lastReviewed: 2024-10-20
draft: false
sidebar:
  order: 553
---

RocketMQ 是阿里巴巴开源的金融级消息中间件，在双 11 万亿级消息流转的极端场景下得到验证，天生支持事务消息、顺序消息和延迟消息。

<!-- more -->

## 核心架构

```text
Producer → [Broker Cluster] → Consumer
              │
              ├─ Name Server（注册中心，无状态）
              └─ Broker（存储消息）
                  ├─ Topic: order
                  │   ├─ Queue 0
                  │   ├─ Queue 1
                  │   └─ Queue 2
                  └─ CommitLog（消息存储文件）
```

| 组件 | 说明 |
|------|------|
| **Name Server** | 注册中心，无状态，维护 Broker 地址和 Topic 路由信息 |
| **Broker** | 消息存储和转发，支持主从同步 |
| **Producer** | 消息生产者，支持同步/异步/单向发送 |
| **Consumer** | 消息消费者，支持 Push/Pull 模式 |
| **Topic** | 消息主题 |
| **Queue** | 消息队列（类似 Kafka 的 Partition） |
| **Tag** | 消息标签，用于过滤 |
| **Key** | 消息关键字，用于查询和追踪 |

## 消息存储

### CommitLog

所有消息顺序写入 CommitLog 文件（类似 Kafka 的 Partition），单个文件默认 1GB。

### ConsumeQueue

每个 Topic-Queue 维护一个 ConsumeQueue 索引文件，存储消息在 CommitLog 中的 offset，用于消费者快速查找。

### IndexFile

支持按 Key 查询消息，用于消息追踪和问题排查。

```text
写入：消息 → CommitLog（顺序写） → 异步构建 ConsumeQueue 索引
消费：Consumer → ConsumeQueue（读索引） → CommitLog（读消息）
```

## 事务消息

RocketMQ 的事务消息是其核心特性，解决分布式事务中的"本地事务与消息发送的一致性"问题。

### 事务消息流程

```text
1. Producer 发送 Half Message（半消息，对消费者不可见）
2. Broker 存储 Half Message，返回发送成功
3. Producer 执行本地事务
4. Producer 根据本地事务结果提交或回滚
   ├─ 提交：Half Message 变为可消费
   └─ 回滚：Half Message 被删除
5. 如果 Broker 未收到确认（第 4 步超时），定时回查 Producer 本地事务状态
```

### 代码示例

```java
TransactionMQProducer producer = new TransactionMQProducer("order-producer-group");
producer.setTransactionMQProducerListener(new TransactionListener() {

    @Override
    public LocalTransactionState executeLocalTransaction(Message msg, Object arg) {
        try {
            // 执行本地事务（如创建订单）
            orderService.create(msg);
            return LocalTransactionState.COMMIT_MESSAGE; // 提交
        } catch (Exception e) {
            return LocalTransactionState.ROLLBACK_MESSAGE; // 回滚
        }
    }

    @Override
    public LocalTransactionState checkLocalTransaction(MessageExt msg) {
        // 回查本地事务状态
        Order order = orderService.getByTransactionId(msg.getTransactionId());
        if (order != null && order.getStatus() == OrderStatus.CREATED) {
            return LocalTransactionState.COMMIT_MESSAGE;
        } else if (order != null && order.getStatus() == OrderStatus.FAILED) {
            return LocalTransactionState.ROLLBACK_MESSAGE;
        } else {
            return LocalTransactionState.UNKNOW; // 未决，稍后再次回查
        }
    }
});

// 发送事务消息
Message msg = new Message("order-topic", "order-create", json.getBytes());
producer.sendMessageInTransaction(msg, null);
```

### 事务消息的应用场景

| 场景 | 说明 |
|------|------|
| **订单创建 + 库存扣减** | 本地创建订单成功后，通知库存服务扣减 |
| **支付成功 + 通知下游** | 本地支付成功后，通知账务、物流等下游服务 |
| **分布式事务替代方案** | 比 Seata 更轻量，适合最终一致场景 |

## 顺序消息

### 全局有序

所有消息在一个 Queue 中，单线程消费：

```java
// 生产者：指定 Queue
SendResult result = producer.send(msg, new MessageQueueSelector() {
    @Override
    public MessageQueue select(List<MessageQueue> mqs, Message msg, Object arg) {
        return mqs.get(0); // 固定 Queue
    }
}, null);

// 消费者：单线程顺序消费
consumer.registerMessageListener(new MessageListenerOrderly() {
    @Override
    public ConsumeOrderlyStatus consumeMessage(List<MessageExt> msgs, ConsumeOrderlyContext context) {
        for (MessageExt msg : msgs) {
            processMessage(msg);
        }
        return ConsumeOrderlyStatus.SUCCESS;
    }
});
```

### 分区有序（推荐）

同一业务 Key（如订单 ID）的消息进同一 Queue，不同 Key 之间并行：

```java
// 生产者：按订单 ID 选择 Queue
SendResult result = producer.send(msg, new MessageQueueSelector() {
    @Override
    public MessageQueue select(List<MessageQueue> mqs, Message msg, Object arg) {
        Long orderId = (Long) arg;
        int index = (int) (orderId % mqs.size());
        return mqs.get(index);
    }
}, orderId);

// 消费者：单线程消费每个 Queue
consumer.registerMessageListener(new MessageListenerOrderly() {
    // 同一 Queue 内的消息被顺序消费
});
```

## 延迟消息

RocketMQ 原生支持延迟消息，内置 18 个延迟级别：

| 级别 | 延迟时间 | 级别 | 延迟时间 |
|------|----------|------|----------|
| 1 | 1s | 10 | 6min |
| 2 | 5s | 11 | 7min |
| 3 | 10s | 12 | 8min |
| 4 | 30s | 13 | 9min |
| 5 | 1min | 14 | 10min |
| 6 | 2min | 15 | 20min |
| 7 | 3min | 16 | 30min |
| 8 | 4min | 17 | 1h |
| 9 | 5min | 18 | 2h |

```java
Message msg = new Message("order-topic", "timeout-cancel", json.getBytes());
msg.setDelayTimeLevel(4); // 延迟 30 秒
producer.send(msg);
```

**应用场景：** 订单超时取消、延迟通知、定时任务触发。

> RocketMQ 5.0+ 支持任意时间延迟，不再局限于 18 个级别。

## 消息过滤

### Tag 过滤

```java
// 生者：设置 Tag
Message msg = new Message("order-topic", "order-created", json.getBytes()); // Tag = order-created

// 消费者：按 Tag 过滤
consumer.subscribe("order-topic", "order-created || order-paid");
```

### SQL92 过滤

```java
// 生产者：设置属性
msg.putUserProperty("amount", "1000");

// 消费者：SQL92 过滤
consumer.subscribe("order-topic", MessageSelector.bySql("amount > 500 AND region = 'CN'"));
```

## 消费者组与广播模式

| 模式 | 说明 | 场景 |
|------|------|------|
| **集群模式（Clustering）** | 同组内竞争消费，一条消息只被一个消费者处理 | 默认模式，大多数场景 |
| **广播模式（Broadcasting）** | 同组内所有消费者都收到消息 | 本地缓存刷新、配置同步 |

```java
consumer.setMessageModel(MessageModel.BROADCASTING); // 广播模式
consumer.setMessageModel(MessageModel.CLUSTERING);    // 集群模式（默认）
```

## 消息重试与死信队列

```text
消费失败 → 消息进入重试队列（%RETRY%ConsumerGroup）
  → 延迟重试（10s、30s、1min、2min...2h）
  → 达到最大重试次数（默认 16 次）
  → 消息进入死信队列（%DLQ%ConsumerGroup）
  → 人工处理
```

```java
// 消费失败，稍后重试
return ConsumeConcurrentlyStatus.RECONSUME_LATER;

// 消费失败，指定重试时间
consumer.setMaxReconsumeTimes(5); // 最多重试 5 次
```

## 适用场景

| 场景 | 原因 |
|------|------|
| 电商交易链路 | 事务消息保证数据一致性 |
| 订单状态流转 | 顺序消息保证状态变更有序 |
| 超时取消 | 延迟消息原生支持 |
| 金融支付 | 高可靠，双 11 验证 |
| 分布式事务替代 | 比 Seata 更轻量的最终一致方案 |

## 局限性

| 局限 | 说明 |
|------|------|
| 生态相对 Kafka 弱 | 大数据生态集成不如 Kafka |
| 社区活跃度稍低 | 相比 Kafka 文档和社区资源少 |
| 不支持消息回溯到任意时间 | 只支持按时间回溯，精度不如 Kafka |
| 延迟消息级别有限 | 5.0 之前只有 18 个固定级别 |

> RocketMQ 的设计哲学是"功能全面、可靠优先"。如果 Kafka 是吞吐之王，RocketMQ 就是功能之王——事务、顺序、延迟、过滤，开箱即用。
