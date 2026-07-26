---
title: Apache Kafka
description: Kafka 的 Partition 设计、零拷贝、Consumer Group、Exactly-Once 语义与生态。
category: Backend
tags:
  - Kafka
  - Message Queue
  - Streaming
order: 552
updatedDate: 2026-07-26
difficulty: advanced
status: stable
lastReviewed: 2026-07-26
draft: false
sidebar:
  order: 552
---

Kafka 是为海量数据而生的分布式流处理平台，通过 Partition 分区设计和顺序磁盘 I/O 实现极致吞吐量，是大数据生态的事实标准。

<!-- more -->

## 核心架构

```text
Producer → [Broker Cluster] → Consumer Group
              │
              ├─ Topic A
              │   ├─ Partition 0 → Consumer 1
              │   ├─ Partition 1 → Consumer 2
              │   └─ Partition 2 → Consumer 3
              └─ Topic B
                  ├─ Partition 0 → Consumer 4
                  └─ Partition 1 → Consumer 5
```

| 组件 | 说明 |
|------|------|
| **Broker** | Kafka 服务节点，存储和转发消息 |
| **Topic** | 消息主题，逻辑分类 |
| **Partition** | 分区，Topic 的物理分片，是并行和扩展的基本单位 |
| **Offset** | 消息在 Partition 内的唯一序号，消费者通过 offset 追踪消费进度 |
| **Consumer Group** | 消费者组，同组内竞争消费，不同组独立消费 |
| **ZooKeeper / KRaft** | 集群元数据管理（Kafka 3.3+ 支持 KRaft 去 ZooKeeper） |

## 极致吞吐量的秘密

### 1. 顺序读写磁盘

Kafka 将消息追加写入 Partition 的日志文件（append-only），利用磁盘顺序写入的性能（约 600MB/s）接近内存随机写入。

### 2. 零拷贝（Zero-Copy）

```text
传统方式：磁盘 → 内核缓冲区 → 用户空间 → Socket 缓冲区 → 网卡
零拷贝：  磁盘 → 内核缓冲区 → 网卡（sendfile 系统调用）
```

通过 `sendfile()` 系统调用，数据直接从内核缓冲区传输到网卡，减少两次内核态/用户态拷贝和两次系统调用。

### 3. 批量发送（Batching）

Producer 将多条消息打包成一个批次发送，减少网络开销：

```java
props.put("batch.size", 16384);        // 批次大小 16KB
props.put("linger.ms", 5);             // 等待 5ms 凑批
props.put("buffer.memory", 33554432);  // 发送缓冲区 32MB
```

### 4. 压缩

支持 Gzip、Snappy、Lz4、Zstd 压缩，批量压缩效果更好：

```java
props.put("compression.type", "lz4");
```

### 5. 分区并行

Partition 是并行的基本单位：

- Producer 可以并行写入多个 Partition
- Consumer Group 内多个 Consumer 并行消费不同 Partition
- Partition 数量决定了最大并行度

## Partition 与副本

### Partition 分配策略

```java
// 指定 Partition（精确控制）
producer.send(new ProducerRecord<>("topic", partition, key, value));

// 按 Key Hash（同一 Key 进同一 Partition，保证顺序）
producer.send(new ProducerRecord<>("topic", key, value));

// 轮询（默认，均匀分布）
producer.send(new ProducerRecord<>("topic", value));
```

### 副本机制（ISR）

```text
Topic: order (replication-factor=3)
  Partition 0:
    Leader: Broker-1   ← 读写
    Follower: Broker-2 ← 同步复制
    Follower: Broker-3 ← 同步复制
```

| 概念 | 说明 |
|------|------|
| **Leader** | 处理读写请求 |
| **Follower** | 从 Leader 同步数据 |
| **ISR（In-Sync Replicas）** | 与 Leader 保持同步的副本集合 |
| **acks=all** | 所有 ISR 确认后才算写入成功 |

```java
props.put("acks", "all");                     // 所有 ISR 确认
props.put("min.insync.replicas", 2);          // 最少 2 个副本同步
props.put("retries", Integer.MAX_VALUE);      // 无限重试
```

## Consumer Group

```text
Consumer Group: order-service
  ├─ Consumer-1 → Partition 0
  ├─ Consumer-2 → Partition 1
  └─ Consumer-3 → Partition 2

Consumer Group: analytics-service
  ├─ Consumer-A → Partition 0
  ├─ Consumer-B → Partition 1
  └─ Consumer-C → Partition 2
```

**核心规则：**

- 同一 Consumer Group 内，一个 Partition 只能被一个 Consumer 消费
- 不同 Consumer Group 独立消费，互不影响
- Consumer 数量超过 Partition 数量时，多余的 Consumer 会空闲

### 消费者再平衡（Rebalance）

当 Consumer 加入或离开 Group 时，Partition 会在 Consumer 间重新分配：

```text
Consumer-2 宕机
  → 触发 Rebalance
  → Partition 1 重新分配给 Consumer-1 或 Consumer-3
```

> Rebalance 期间消费会暂停，应尽量减少 Rebalance 的发生。配置合理的 `session.timeout.ms` 和 `heartbeat.interval.ms`。

## 消息语义

| 语义 | 说明 | 实现方式 |
|------|------|----------|
| **At Most Once** | 最多一次，可能丢消息 | 自动提交 offset |
| **At Least Once** | 最少一次，可能重复 | 手动提交 offset + 业务幂等 |
| **Exactly Once** | 精确一次 | Kafka 事务 + 幂等 Producer |

### At Least Once（推荐）

```java
props.put("enable.auto.commit", "false"); // 关闭自动提交

while (true) {
    ConsumerRecords<String, String> records = consumer.poll(Duration.ofMillis(100));
    for (ConsumerRecord<String, String> record : records) {
        processMessage(record); // 处理消息
    }
    consumer.commitSync(); // 处理完再提交 offset
}
```

### Exactly Once（Kafka 事务）

```java
props.put("transactional.id", "order-tx-001");
props.put("enable.idempotence", "true");

KafkaProducer<String, String> producer = new KafkaProducer<>(props);
producer.initTransactions();

try {
    producer.beginTransaction();
    producer.send(new ProducerRecord<>("output-topic", key, value));
    producer.sendOffsetsToTransaction(offsets, "consumer-group");
    producer.commitTransaction();
} catch (Exception e) {
    producer.abortTransaction();
}
```

## Kafka 生态

| 组件 | 说明 |
|------|------|
| **Kafka Connect** | 数据集成框架，连接外部系统（数据库、ES、HDFS 等） |
| **Kafka Streams** | 流处理库，无需独立集群 |
| **ksqlDB** | SQL 引擎，用 SQL 查询流数据 |
| **Schema Registry** | 消息 Schema 管理，Avro/Protobuf/JSON Schema |
| **Kafka Manager / AKHQ** | 集群管理界面 |

## 适用场景

| 场景 | 原因 |
|------|------|
| 日志收集与聚合 | 极致吞吐量，顺序写磁盘 |
| 用户行为追踪 | 海量数据，允许延迟 |
| 实时数据管道 | Kafka Connect 生态成熟 |
| 事件溯源 | 消息持久化 + 回溯能力 |
| 流处理 | Kafka Streams / ksqlDB |

## 局限性

| 局限 | 说明 |
|------|------|
| 不支持延迟消息 | 原生不支持，需要外部实现 |
| 不支持消息重试 | 需要自行实现重试队列 |
| 不支持死信队列 | 需要自行实现 |
| Partition 过多影响性能 | ZooKeeper 元数据压力大 |
| 消息顺序仅 Partition 内 | 跨 Partition 无序 |
| 不支持事务消息（业务语义） | 有事务但不是 RocketMQ 那种业务事务消息 |

> Kafka 的设计哲学是"做一件事做到极致"——极致的吞吐量。复杂的消息语义（事务、延迟、重试）交给其他 MQ 或业务层处理。
