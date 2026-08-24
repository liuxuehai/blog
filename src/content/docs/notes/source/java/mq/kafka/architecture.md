---
title: 整体架构
description: Kafka Broker、分区日志、副本复制、KRaft 控制器与消费者组的源码分层。
category: Backend
tags: [Source Reading, Kafka, Architecture]
order: 211
updatedDate: 2026-08-24
difficulty: advanced
status: stable
lastReviewed: 2026-08-24
draft: false
sidebar:
  order: 211
---

Kafka 不是一个单一的大队列，而是多个按 partition 划分的复制日志，以及围绕这些日志运行的元数据和消费状态机。

<!-- more -->

## 先给答案：Kafka 用三类可重放日志隔离数据面、控制面和消费状态

业务消息按 partition 追加到分段日志，副本协议用 ISR 与提交边界决定何时可见；KRaft 复制 metadata log 并驱动控制器状态机；consumer group 的成员与 offset 又由独立内部日志恢复。三类状态使用相似的日志思想，但吞吐、保留和故障域不同。

因此 leader 本地追加、ISR 提交、事务可见和 group offset 提交不能混为一个“成功”。排障要先确认问题属于分区日志、副本、控制器还是消费者协调，再沿各自的 epoch、offset 和 generation 判断旧状态是否仍有效。

## 分层

```text
Producer / Consumer
        │ Kafka protocol
        ▼
Broker request layer
        ├── ReplicaManager ──► UnifiedLog ──► LogSegment + indexes
        ├── GroupCoordinator ─► group metadata log
        └── KRaft controller ─► metadata log / QuorumController
                                      │
                                      └── KafkaRaftClient + quorum
```

| 层 | 职责 | 核心类 |
| --- | --- | --- |
| 记录层 | 批次编码、压缩、文件读写 | `MemoryRecords`、`FileRecords` |
| 存储层 | 分段、索引、恢复和刷盘 | `UnifiedLog`、`LocalLog`、`LogSegment` |
| 副本层 | leader 写入、follower fetch、ISR | `ReplicaManager`、`ReplicaFetcherThread` |
| 控制层 | 元数据命令和控制器领导权 | `KafkaRaftClient`、`QuorumController` |
| 消费层 | join/sync、心跳、offset | `AbstractCoordinator`、`ConsumerCoordinator` |

## 主流程：生产消息

```text
ProduceRequest
  └─► ReplicaManager#appendRecords
       └─► leader partition
            └─► UnifiedLog#appendAsLeader
                 └─► LogSegment#append
                      ├─► FileRecords.append
                      └─► OffsetIndex / TimeIndex
```

`ReplicaManager#appendRecords` 位于 `core/src/main/scala/kafka/server/ReplicaManager.scala:638`，leader 追加入口为 `appendRecordsToLeader`（`:586`）。真正的日志追加在 `UnifiedLog#appendAsLeader`（`storage/src/main/java/org/apache/kafka/storage/internals/log/UnifiedLog.java:1020`），segment 写入在 `LogSegment#append`（`:251`）。

## 主流程：副本与控制器

```text
Follower fetch loop ─► ReplicaFetcherThread#doWork
                      └► processPartitionData ─► follower LocalLog

KRaft quorum ─► KafkaRaftClient ─► committed metadata
                                      └► QuorumController state machine
```

`ReplicaFetcherThread#doWork`（`core/src/main/scala/kafka/server/ReplicaFetcherThread.scala:107`）调度拉取，`processPartitionData`（`:113`）应用响应。KRaft 选举入口为 `KafkaRaftClient#transitionToCandidate`（`raft/src/main/java/org/apache/kafka/raft/KafkaRaftClient.java:724`），fetch 入口为 `handleFetchRequest`（`:1483`），控制器类位于 `metadata/src/main/java/org/apache/kafka/controller/QuorumController.java:177`。

## 为什么分开三类日志

**替代方案**：所有业务、元数据和 group 状态写入一个全局日志。
**为什么不行**：三者的吞吐、保留策略和故障域不同；热点业务 topic 会影响控制器推进，消费状态也无法独立恢复。
**证据**：业务日志由 `UnifiedLog` 管理，KRaft 由 `KafkaRaftClient` 管理，group 状态由 `GroupMetadataManager#replay`（`group-coordinator/src/main/java/org/apache/kafka/coordinator/group/GroupMetadataManager.java:5651` 起）重建。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| 只看 leader 日志 | 误以为写成功等于所有副本可读 | ack 与 HW/ISR 语义不同 | 同时看 `acks`、ISR 和 HW |
| 把 KRaft 当普通配置中心 | 忽略提交边界 | 控制器只能应用 committed records | 从 Raft high watermark 读起 |
| join 成功就认为重平衡完成 | 本地 assignment 仍未更新 | 还需 SyncGroup 和回调 | 顺着 `onJoinComplete` 读完 |

## 可迁移知识

高吞吐系统可以拆成“数据日志 + 控制日志 + 状态机”三层；每层通过已提交事件交接，故障恢复时直接重放状态机。

> **面试锚点**
> - partition、replica、ISR、HW 分别解决什么问题？
> - 为什么 KRaft 仍需要日志？
> - follower fetch 和 consumer fetch 有什么不同？

## Related

- [分区日志与稀疏索引](/notes/source/java/mq/kafka/partition-log/)
- [ISR 与副本同步](/notes/source/java/mq/kafka/isr-replication/)
- [KRaft 与元数据控制器](/notes/source/java/mq/kafka/kraft-controller/)
