---
title: Apache Kafka
description: Kafka 源码解析总览：分区日志、稀疏索引、ISR、KRaft 与消费者组重平衡。
category: Backend
tags: [Source Reading, Kafka, Messaging, Storage]
order: 2
updatedDate: 2026-08-16
difficulty: advanced
status: learning
lastReviewed: 2026-08-16
draft: false
sidebar:
  order: 2
---

Kafka 把消息系统拆成业务分区日志、KRaft 元数据日志和消费者组状态日志。本册沿着消息追加、复制、提交和消费重平衡的源码路径阅读。

<!-- more -->

## 版本快照

| 项 | 值 |
| --- | --- |
| 仓库 | `apache/kafka` |
| 本地路径 | `E:\source\java\mq\kafka` |
| 分支 | `trunk` |
| Commit | `be0b992d37f309363bb22c6193da64b19a85b51f`（2026-08-13） |
| 最近 tag | `0.8.0-beta1`（当前浅克隆祖先中的 tag，仅作参考） |

> 本册源码坐标均基于上述 commit。

## 模块地图

| 模块 | 职责 | 关键抽象 |
| --- | --- | --- |
| `clients` | 批次、生产者和消费者协议 | `MemoryRecords`、`AbstractCoordinator` |
| `storage` | 分段日志和索引 | `UnifiedLog`、`LocalLog`、`LogSegment` |
| `core` | Broker、副本和 ISR | `ReplicaManager`、`ReplicaFetcherThread` |
| `raft` / `metadata` | KRaft 选举和控制器 | `KafkaRaftClient`、`QuorumController` |
| `group-coordinator` | group 和 offset 状态 | `GroupMetadataManager` |

## 读码入口顺序

1. `MemoryRecords` / `FileRecords`：批次和文件读写。
2. `UnifiedLog#appendAsLeader` → `LogSegment#append`：消息落盘与索引。
3. `ReplicaManager#appendRecords` / `fetchMessages`：leader、follower 和 ISR。
4. `KafkaRaftClient` → `QuorumController`：KRaft 控制面。
5. `AbstractCoordinator#joinGroupIfNeeded`：消费者重平衡。

## 本册目录

- [整体架构](/notes/source/java/mq/kafka/architecture/)
- [分区日志与稀疏索引](/notes/source/java/mq/kafka/partition-log/)
- [ISR 与副本同步](/notes/source/java/mq/kafka/isr-replication/)
- [零拷贝与页缓存](/notes/source/java/mq/kafka/zero-copy-page-cache/)
- [KRaft 与元数据控制器](/notes/source/java/mq/kafka/kraft-controller/)
- [消费者组重平衡协议](/notes/source/java/mq/kafka/consumer-rebalance/)
- [事务、幂等与 offset](/notes/source/java/mq/kafka/transactions-offsets/)
- [面试专题](/notes/source/java/mq/kafka/interview/)

## Related

- [消息中间件](/notes/source/java/mq/)
- [RocketMQ 源码解析](/notes/source/java/mq/rocketmq/)
- [Kafka 概念笔记](/notes/backend/mq/kafka/)