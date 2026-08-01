---
title: Apache Pulsar
description: Pulsar 的计算存储分离架构、BookKeeper、Segment 存储、多租户与跨地域复制。
category: Backend
tags:
  - Pulsar
  - Message Queue
  - Cloud Native
order: 554
updatedDate: 2024-08-03
difficulty: advanced
status: stable
lastReviewed: 2024-10-20
draft: false
sidebar:
  order: 554
---

Pulsar 是 Apache 开源的云原生消息流平台，采用计算（Broker）与存储（BookKeeper）分离的架构，存储和计算可以独立扩展。

<!-- more -->

## 核心架构

```text
                    ┌─────────────────┐
                    │   Pulsar Broker  │  ← 无状态计算层
                    │  （接收/转发消息） │
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              ↓              ↓              ↓
       ┌──────────┐   ┌──────────┐   ┌──────────┐
       │BookKeeper│   │BookKeeper│   │BookKeeper│  ← 有状态存储层
       │  Node 1  │   │  Node 2  │   │  Node 3  │
       └──────────┘   └──────────┘   └──────────┘
```

| 组件 | 说明 |
|------|------|
| **Broker** | 无状态计算层，处理消息的发送和接收，可以水平扩展 |
| **BookKeeper (BK)** | 有状态存储层，持久化存储消息数据 |
| **ZooKeeper** | 存储元数据（Topic、租户、命名空间等） |
| **Topic** | 消息主题 |
| **Partition** | Topic 的分区（逻辑概念） |
| **Subscription** | 订阅关系，类似 Consumer Group |

## 计算存储分离

这是 Pulsar 与 Kafka、RocketMQ 最大的架构差异。

### Kafka 的问题

```text
Kafka Broker = 计算 + 存储
  ├─ 每个 Broker 存储自己 Partition 的数据
  ├─ 扩容 Broker 需要数据迁移（Rebalance）
  └─ 存储和计算耦合，无法独立扩展
```

### Pulsar 的方案

```text
Pulsar Broker = 纯计算（无状态）
BookKeeper = 纯存储（有状态）
  ├─ Broker 扩容：直接加 Broker，无需数据迁移
  ├─ 存储扩容：直接加 BookKeeper 节点
  └─ 两者独立扩展，互不影响
```

**优势：**

- Broker 无状态，可以快速扩缩容
- 存储层独立扩展，不影响计算层
- Broker 故障时，其他 Broker 可以立即接管（无数据需要迁移）

## Segment 存储模型

Pulsar 使用 Segment（Ledger）存储模型，不同于 Kafka 的 Partition 日志：

```text
Kafka:
  Partition 0 = [Segment 0][Segment 1][Segment 2]...（连续日志）

Pulsar:
  Topic = [Ledger 1][Ledger 2][Ledger 3]...
           ├─ Entry 0    ├─ Entry 0
           ├─ Entry 1    ├─ Entry 1
           └─ Entry 2    └─ Entry 2
```

| 概念 | 说明 |
|------|------|
| **Ledger** | 一个只追加的数据段，写满后关闭 |
| **Entry** | Ledger 中的单条消息 |
| **Bookie** | BookKeeper 的存储节点 |

**优势：** Ledger 是不可变的，关闭后可以安全地删除（数据已过期或已确认）。这使得数据清理更简单，不会像 Kafka 那样因为 Segment 删除导致性能抖动。

## 消息模型

### 多种订阅模式

| 订阅模式 | 说明 | 类似于 |
|----------|------|--------|
| **Exclusive** | 独占消费，一个消费者 | Kafka 单 Partition |
| **Shared** | 共享消费，多消费者轮询 | RabbitMQ 轮询 |
| **Failover** | 主备模式，主消费者故障时备消费者接管 | — |
| **Key_Shared** | 按 Key 分配，同一 Key 的消息给同一消费者 | RocketMQ 分区有序 |

```java
// Exclusive 订阅
consumer = client.newConsumer()
    .topic("order-topic")
    .subscriptionName("order-group")
    .subscriptionType(SubscriptionType.Exclusive)
    .subscribe();

// Shared 订阅（多消费者共享）
consumer = client.newConsumer()
    .topic("order-topic")
    .subscriptionName("order-group")
    .subscriptionType(SubscriptionType.Shared)
    .subscribe();

// Key_Shared 订阅（按 Key 分配）
consumer = client.newConsumer()
    .topic("order-topic")
    .subscriptionName("order-group")
    .subscriptionType(SubscriptionType.Key_Shared)
    .subscribe();
```

## 多租户

Pulsar 原生支持多租户，是其区别于其他 MQ 的核心特性之一：

```text
Tenant: company-a
  ├─ Namespace: production
  │   ├─ Topic: order-topic
  │   └─ Topic: payment-topic
  └─ Namespace: staging
      ├─ Topic: order-topic
      └─ Topic: payment-topic

Tenant: company-b
  └─ Namespace: production
      └─ Topic: order-topic
```

| 概念 | 说明 |
|------|------|
| **Tenant** | 租户，最顶层隔离 |
| **Namespace** | 命名空间，租户下的逻辑分组 |
| **Topic** | 消息主题，Namespace 下的消息通道 |

**多租户的价值：**

- 不同租户的数据完全隔离
- 可以按租户设置配额（存储、吞吐量）
- 适合 SaaS 平台和多团队共享集群

## 跨地域复制（Geo-Replication）

Pulsar 原生支持跨地域复制，数据自动同步到多个数据中心：

```text
Region A (Beijing)          Region B (Shanghai)
  ┌──────────┐                ┌──────────┐
  │ Broker A │ ←── 异步同步 ──→│ Broker B │
  └──────────┘                └──────────┘
       │                           │
       ↓                           ↓
  BookKeeper A               BookKeeper B
```

**复制模式：**

| 模式 | 说明 |
|------|------|
| **异步复制** | 消息先写入本地，异步同步到远端（默认） |
| **同步复制** | 消息写入所有地域后才返回成功 |

## 消息保留与过期

```java
// 设置消息保留时间（即使已确认也不删除）
admin.namespaces().setRetention("tenant/ns",
    new RetentionPolicies(7 * 24 * 60, -1)); // 保留 7 天

// 设置消息过期时间（未确认的消息）
admin.namespaces().setNamespaceMessageTTL("tenant/ns", 3600); // 1 小时过期
```

与 Kafka 的区别：

| 维度 | Kafka | Pulsar |
|------|-------|--------|
| 数据清理 | 按时间/大小删除 Segment | Ledger 级别删除 |
| 已确认数据 | 保留到 Segment 过期 | 可配置保留策略 |
| 回溯消费 | 按 offset 回溯 | 按时间回溯 |

## Pulsar Functions

Pulsar 内置轻量级流处理引擎，无需部署独立的流处理集群：

```java
public class OrderEnrichment implements Function<String, String> {
    @Override
    public String process(String input, Context context) {
        Order order = JsonUtils.parse(input);
        // 丰富订单信息
        order.setCustomerName(customerService.getName(order.getCustomerId()));
        return JsonUtils.toJson(order);
    }
}
```

```bash
# 部署 Function
pulsar-admin functions create \
  --name order-enrichment \
  --inputs order-raw \
  --output order-enriched \
  --jar order-enrichment.jar \
  --classname OrderEnrichment
```

## 适用场景

| 场景 | 原因 |
|------|------|
| 大型云原生架构 | 计算存储分离，弹性扩缩容 |
| 多租户 SaaS 平台 | 原生多租户支持 |
| 跨地域/多数据中心 | 原生 Geo-Replication |
| IoT 场景 | 支持 MQTT 协议，连接数多 |
| 需要统一消息平台 | 支持 Queue + Streaming 两种模式 |

## 局限性

| 局限 | 说明 |
|------|------|
| 架构复杂 | Broker + BookKeeper + ZooKeeper，组件多 |
| 部署运维成本高 | 比 Kafka、RocketMQ 复杂得多 |
| 社区和生态相对年轻 | 文档、工具、最佳实践不如 Kafka 成熟 |
| 学习曲线陡峭 | 概念多（Tenant/Namespace/Subscription/Ledger） |
| BookKeeper 运维门槛 | 需要理解 BookKeeper 的存储机制 |

> Pulsar 的设计哲学是"面向未来"——计算存储分离、多租户、跨地域复制，这些特性在云原生时代越来越重要。但架构复杂度是其最大的门槛。
