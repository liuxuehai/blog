---
title: RabbitMQ
description: RabbitMQ 的 AMQP 协议、Exchange 路由、确认机制、集群镜像队列与使用实践。
category: Backend
tags:
  - RabbitMQ
  - Message Queue
  - AMQP
order: 551
updatedDate: 2026-07-26
difficulty: advanced
status: stable
lastReviewed: 2026-07-26
draft: false
sidebar:
  order: 551
---

RabbitMQ 是基于 AMQP 协议的轻量级消息中间件，功能丰富，支持灵活的路由策略，是中小规模系统的首选。

<!-- more -->

## 核心架构

```text
Producer → Exchange → Binding → Queue → Consumer
```

| 组件 | 说明 |
|------|------|
| **Producer** | 消息生产者，将消息发送到 Exchange |
| **Exchange** | 交换机，根据路由规则将消息分发到 Queue |
| **Binding** | 绑定关系，定义 Exchange 和 Queue 之间的路由规则 |
| **Queue** | 消息队列，存储消息 |
| **Consumer** | 消息消费者，从 Queue 拉取或接收消息 |
| **Virtual Host** | 虚拟主机，逻辑隔离（类似数据库的 schema） |

## Exchange 类型

| 类型 | 路由规则 | 典型场景 |
|------|----------|----------|
| **Direct** | 精确匹配 Routing Key | 点对点通信 |
| **Topic** | 通配符匹配（`*` 匹配一个词，`#` 匹配多个词） | 发布订阅、分类路由 |
| **Fanout** | 广播到所有绑定的 Queue | 广播通知 |
| **Headers** | 根据消息 Header 匹配 | 复杂条件路由 |

### Direct Exchange

```text
Producer → [Exchange: order] → Routing Key: "order.create"
  ├─ [Queue: order-create] ← Binding Key: "order.create" ✅
  └─ [Queue: order-pay]    ← Binding Key: "order.pay"    ❌
```

### Topic Exchange

```text
Producer → [Exchange: log] → Routing Key: "order.create.success"
  ├─ [Queue: all-logs]      ← Binding Key: "#"              ✅
  ├─ [Queue: order-logs]    ← Binding Key: "order.*"        ❌（* 只匹配一个词）
  ├─ [Queue: order-logs]    ← Binding Key: "order.#"        ✅
  └─ [Queue: error-logs]    ← Binding Key: "*.error.*"      ❌
```

### Fanout Exchange

```text
Producer → [Exchange: notify] → 广播
  ├─ [Queue: sms-notify]    ✅
  ├─ [Queue: email-notify]  ✅
  └─ [Queue: push-notify]   ✅
```

## 消息确认机制

### 生产者确认（Publisher Confirm）

```java
// 开启 confirm 模式
channel.confirmSelect();

// 发送消息
channel.basicPublish("exchange", "routingKey", null, message.getBytes());

// 等待确认
if (channel.waitForConfirms()) {
    // 消息已到达 Broker
} else {
    // 消息发送失败，需要重试或记录
}
```

| 模式 | 说明 | 性能 |
|------|------|------|
| **单条确认** | 每发一条等一次确认 | 低 |
| **批量确认** | 发一批等一次确认 | 中 |
| **异步确认** | 回调通知，不阻塞 | 高（推荐） |

### 消费者确认（Ack）

```java
// 手动确认（推荐）
channel.basicConsume(queue, false, (tag, delivery) -> {
    try {
        // 处理消息
        processMessage(delivery.getBody());
        // 确认
        channel.basicAck(delivery.getEnvelope().getDeliveryTag(), false);
    } catch (Exception e) {
        // 拒绝，requeue=true 重新入队，false 进入死信
        channel.basicNack(delivery.getEnvelope().getDeliveryTag(), false, true);
    }
});
```

| 确认方式 | 说明 | 风险 |
|----------|------|------|
| **自动确认（autoAck）** | 收到即确认 | 消息丢失（消费者崩溃时） |
| **手动确认（manualAck）** | 处理完再确认 | 推荐，保证不丢消息 |
| **批量确认** | 确认多条 | 部分失败时可能丢消息 |

## 消息持久化

```java
// 1. Exchange 持久化
channel.exchangeDeclare("order", "direct", true); // durable=true

// 2. Queue 持久化
channel.queueDeclare("order-queue", true, false, false, null); // durable=true

// 3. 消息持久化
AMQP.BasicProperties props = new AMQP.BasicProperties.Builder()
    .deliveryMode(2) // 2 = 持久化
    .build();
channel.basicPublish("exchange", "key", props, message.getBytes());
```

> 三者缺一不可：Exchange 持久化 + Queue 持久化 + 消息持久化，才能保证 Broker 重启后消息不丢失。

## 死信队列（DLX）

消息变成死信的条件：

- 消息被拒绝（basicNack / basicReject）且 requeue=false
- 消息 TTL 过期
- 队列达到最大长度

```java
// 声明死信交换机
channel.exchangeDeclare("dlx.exchange", "direct");
channel.queueDeclare("dlx.queue", true, false, false, null);
channel.queueBind("dlx.queue", "dlx.exchange", "dlx");

// 正常队列绑定死信交换机
Map<String, Object> args = new HashMap<>();
args.put("x-dead-letter-exchange", "dlx.exchange");
args.put("x-dead-letter-routing-key", "dlx");
channel.queueDeclare("order-queue", true, false, false, args);
```

## 延迟消息

通过 TTL + 死信队列实现延迟消息：

```text
Producer → [延迟队列: TTL=30min] → TTL 到期 → 死信交换机 → [目标队列] → Consumer
```

也可以使用 RabbitMQ 的延迟插件（`rabbitmq_delayed_message_exchange`），直接在 Exchange 层面支持延迟投递。

## 集群模式

| 模式 | 说明 | 可用性 |
|------|------|--------|
| **普通集群** | 元数据同步，消息只在一个节点 | 节点故障可能丢消息 |
| **镜像队列** | 消息在所有节点同步复制 | 高可用，但性能下降 |
| **Quorum Queue** | 基于 Raft 协议的分布式队列 | 推荐，高可用 + 一致性 |

> 生产环境推荐 Quorum Queue，它是 RabbitMQ 3.8+ 引入的替代镜像队列的方案，基于 Raft 共识协议，数据一致性更好。

## 适用场景

| 场景 | 原因 |
|------|------|
| 中小型系统微服务解耦 | 功能完善，易于上手 |
| 异步任务处理 | 灵活的路由策略 |
| 需要复杂路由规则 | Direct/Topic/Fanout 多种模式 |
| 延迟任务（如超时取消） | TTL + DLX 或延迟插件 |
| 需要可靠投递 | Publisher Confirm + 手动 Ack |

## 局限性

| 局限 | 说明 |
|------|------|
| 吞吐量有限 | 单机万级 QPS，不适合海量数据 |
| 消息堆积能力弱 | 内存优先，大量堆积时性能下降 |
| Erlang 技术栈 | 团队不熟悉时排查问题有门槛 |
| 不支持消息回溯 | 消费后无法重新消费（需自行实现） |
