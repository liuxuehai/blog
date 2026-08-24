---
title: 面试专题
description: Kafka 分区日志、ISR、KRaft、零拷贝和消费者重平衡的源码级面试题。
category: Backend
tags: [Source Reading, Kafka, Interview]
order: 219
updatedDate: 2026-08-24
difficulty: advanced
status: stable
lastReviewed: 2026-08-24
draft: false
sidebar:
  order: 219
---

Kafka 面试的加分点不在于背参数，而在于能把 offset、epoch、segment、ISR 和 group generation 串成一条故障路径。

<!-- more -->

## 先给答案：Kafka 的源码回答必须说明 offset、epoch 和 generation 各约束哪类旧状态

offset 描述日志位置与消费进度，epoch 区分 leader 或 producer 会话，generation 区分消费者组分配版本。吞吐来自 partition 并行、批次、顺序追加和页缓存；可靠性则由 ISR/HW、幂等序列、事务标记和 group offset 共同决定。

回答任何“是否丢、是否重复、是否可见”问题时，都要先指定写入、复制、事务读取和消费提交中的哪一个边界。`acks=all` 不是端到端 exactly-once，低 JVM heap 也不代表没有缓存压力，group 成员数量不变同样可能因协调状态变化发生重平衡。

## 高频题

### Kafka 为什么吞吐高？

**30 秒版**：partition 提供并行度，追加日志提供顺序 IO，batch 和压缩降低协议开销，page cache 和 zero-copy 减少数据搬运。

**展开**：`MemoryRecords` 以 batch 组织数据，`UnifiedLog#appendAsLeader`（`storage/src/main/java/org/apache/kafka/storage/internals/log/UnifiedLog.java:1020`）顺序追加到 `LogSegment#append`（`:251`）；读取由 `FileRecords` 承担文件访问。

**加分项**：稀疏索引用少量索引缩小扫描范围，最终仍由日志校正。

**常见错答**：只说用了多线程，没有解释 partition 和顺序写。

### ISR 和 HW 有什么区别？

**30 秒版**：ISR 是能及时追上 leader 的副本集合；HW 是可以安全暴露给消费者的提交边界。

**展开**：`ReplicaManager#maybeShrinkIsr`（`core/src/main/scala/kafka/server/ReplicaManager.scala:2100`）维护成员资格，`ReplicaFetcherThread#processPartitionData`（`core/src/main/scala/kafka/server/ReplicaFetcherThread.scala:113`）负责追赶。副本存在不等于进入 ISR，LEO 也不等于 HW。

**加分项**：`read_committed` 还要叠加事务可见性。

**常见错答**：把 ISR 当成全部 replicas。

### KRaft 如何替代 ZooKeeper？

**30 秒版**：Kafka 用 `KafkaRaftClient` 复制 metadata log，选出 controller leader，再由 `QuorumController` 应用 committed records。

**展开**：选举入口是 `transitionToCandidate`（`raft/src/main/java/org/apache/kafka/raft/KafkaRaftClient.java:724`），复制入口是 `handleFetchRequest`（`:1483`），快照入口是 `handleFetchSnapshotRequest`（`:1922`）。

**加分项**：KRaft 是控制面日志和状态机，不是简单搬运 ZooKeeper API。

**常见错答**：说 KRaft 取消了日志。

### 重平衡为什么发生？

**30 秒版**：成员、订阅、coordinator 或心跳状态变化会使 generation 失效，消费者重新 JoinGroup 和 SyncGroup。

**展开**：`AbstractCoordinator#joinGroupIfNeeded`（`clients/src/main/java/org/apache/kafka/clients/consumer/internals/AbstractCoordinator.java:465`）负责流程，`requestRejoin`（`:1094`）标记重入，`ConsumerCoordinator#onJoinComplete`（`ConsumerCoordinator.java:379`）应用 assignment。

**加分项**：generation 是防止旧响应污染新分配的版本号。

**常见错答**：认为只有消费者数量变化才会重平衡。

## 场景题

### consumer 延迟突然升高怎么排查？

先区分 broker fetch、leader、ISR/HW、group rebalance 和业务处理耗时；查看 `fetchMessages`、ISR shrink、heartbeat/rejoin 和 lag，不要只看 JVM CPU。

### Broker 重启后恢复很慢怎么排查？

检查 segment recovery、索引重建、page cache 冷启动、metadata snapshot 距离和未完成事务。`LogSegment#recover`（`storage/src/main/java/org/apache/kafka/storage/internals/log/LogSegment.java:483`）和 KRaft snapshot 是两条独立恢复路径。

## 反向问面试官

- 线上更关注 consumer rebalance 延迟，还是 under-replicated partition？
- 当前集群使用何种 KRaft quorum 和事务隔离策略？

## 边界与踩坑

| 场景 | 误判 | 正确方向 |
| --- | --- | --- |
| `acks=all` | 以为端到端 exactly-once | 还要看幂等、事务和 offset |
| heap 很低 | 以为没有缓存压力 | 检查 page cache |
| group 没变更 | 以为不会 rebalance | coordinator、订阅和 heartbeat 也会触发 |

> **面试锚点**
> - 能否画出 Produce 到 LogSegment 的调用链？
> - 能否解释 ISR、LEO、HW 和 committed offset？
> - 能否区分业务日志、KRaft 日志和 group metadata？

## Related

- [整体架构](/notes/source/java/mq/kafka/architecture/)
- [分区日志与稀疏索引](/notes/source/java/mq/kafka/partition-log/)
- [消费者组重平衡协议](/notes/source/java/mq/kafka/consumer-rebalance/)
