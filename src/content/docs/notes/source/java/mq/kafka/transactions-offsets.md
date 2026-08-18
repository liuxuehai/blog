---
title: 事务、幂等与 offset
description: Kafka producer epoch、事务可见性、消费位点和 group metadata 日志之间的边界。
category: Backend
tags: [Source Reading, Kafka, Transactions, Offset]
order: 217
sidebar:
  order: 217
---

Kafka 的 exactly-once 不是一个 API，而是 producer 幂等序列、事务状态、consumer isolation 和 offset 提交共同组成的协议。

<!-- more -->

```text
producer id + epoch + sequence -> idempotent append
                                      |
                              transaction markers
                                      |
read_committed -> filter aborted data -> commit offset
```

## 幂等追加与读取隔离

记录批次由 `MemoryRecords`（`clients/src/main/java/org/apache/kafka/common/record/internal/MemoryRecords.java:50`）承载，leader 入口是 `UnifiedLog#appendAsLeader`（`storage/src/main/java/org/apache/kafka/storage/internals/log/UnifiedLog.java:1020`）。日志层结合 producer state、epoch 和 sequence 判断重试批次，而不是按 payload 去重。

`UnifiedLog#read`（`UnifiedLog.java:1649`）读取时结合 isolation 和事务索引；`LogSegment#truncateTo`（`storage/src/main/java/org/apache/kafka/storage/internals/log/LogSegment.java:562`）同步处理 transaction index。`READ_COMMITTED` 不会把已 abort 的批次交给业务。

## offset 提交

`ConsumerCoordinator#commitOffsetsAsync`（`clients/src/main/java/org/apache/kafka/clients/consumer/internals/ConsumerCoordinator.java:1052`）和 `commitOffsetsSync`（`:1146`）把消费进度提交给 coordinator。Broker 侧由 `GroupMetadataManager#replay`（`group-coordinator/src/main/java/org/apache/kafka/coordinator/group/GroupMetadataManager.java:5651` 起）从内部记录恢复 offset 和 group 状态。

## 为什么 offset 属于 group 而不是消息

**替代方案**：每条消息保存一个消费者确认位。
**为什么不行**：同一日志可被多个 group 以不同速度消费，确认状态属于 group；按 offset 顺序提交也能压缩状态并支持批量提交。
**证据**：commit API 接收 `Map<TopicPartition, OffsetAndMetadata>`，group coordinator 独立维护这些 offset，业务日志与 group metadata 日志分离。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| producer 重试重复 | 响应丢失导致重复写 | 未启用幂等或 epoch 不连续 | 开启幂等并保持会话 |
| `read_committed` 延迟高 | 长事务挡住可见水位 | marker 未完成 | 限制事务时长 |
| 处理前提交 offset | 崩溃后消息丢失 | offset 先于业务完成 | 成功后提交或使用事务 |

## 可迁移知识

端到端 exactly-once 必须把输入位点和输出结果放进同一个提交边界；跨系统副作用仍需要幂等 key、outbox 或补偿。

> **面试锚点**
> - 幂等 producer 如何识别重试批次？
> - `read_committed` 为什么会等待？
> - offset 为什么属于 consumer group？

## Related

- [消费者组重平衡协议](/notes/source/java/mq/kafka/consumer-rebalance/)
- [分区日志与稀疏索引](/notes/source/java/mq/kafka/partition-log/)
- [RocketMQ 事务消息](/notes/source/java/mq/rocketmq/transaction-message/)