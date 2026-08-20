---
title: Apache Kafka
description: Kafka 源码解析总览：分区日志、稀疏索引、ISR、KRaft 与消费者组重平衡。
category: Backend
tags: [Source Reading, Kafka, Messaging, Storage]
order: 2
updatedDate: 2026-08-20
difficulty: advanced
status: learning
lastReviewed: 2026-08-20
draft: false
sidebar:
  order: 2
---

Kafka 把消息系统拆成业务分区日志、KRaft 元数据日志和消费者组状态日志。本册沿着消息追加、复制、提交和消费重平衡的源码路径阅读。

<!-- more -->

## 本册问题地图

Kafka 要围绕“日志位置、复制提交、消费分配”三条线同时阅读：

1. **分区日志为什么适合吞吐？** 每个分区只做顺序追加，读取主要依赖 offset 和稀疏索引，避免为每条消息维护昂贵的随机索引。
2. **LEO、HW、ISR 分别回答什么？** LEO 表示副本写到哪里，ISR 表示哪些副本仍满足追赶条件，HW 表示消费者可安全看到哪里；Leader 写入不等于消息已提交。
3. **Producer ack 的可靠性边界是什么？** `acks=all` 依赖 ISR 和最小同步副本数；如果副本配置、ISR 收缩或 `unclean` 选主策略改变，语义也会改变。
4. **消费者为什么不能自己决定 assignment？** 组协调器需要看到全组成员和订阅关系，才能让分区所有权在成员间形成一致视图。
5. **KRaft Controller 做什么？** 它用元数据日志和控制器仲裁管理分区、Leader 和配置状态，替代 ZooKeeper 作为 Kafka 元数据外部依赖。
6. **零拷贝省掉哪一步？** 主要减少 Broker 在内核页缓存与用户态缓冲区之间的重复搬运，但不代表磁盘、网络或副本复制成本消失。

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