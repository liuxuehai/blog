---
title: 消费者组重平衡协议
description: AbstractCoordinator、ConsumerCoordinator 和 GroupMetadataManager 如何完成 join、sync、心跳和重平衡。
category: Backend
tags: [Source Reading, Kafka, Consumer, Rebalance]
order: 216
sidebar:
  order: 216
---

消费者重平衡的本质是：先找到 group coordinator，再以 generation 加入组，leader 计算 assignment，所有成员通过 sync 获得统一结果。

<!-- more -->

```text
poll loop -> ensureCoordinatorReady -> joinGroupIfNeeded
                                      |
                         JoinGroup -> generation
                                      |
                         assignment -> SyncGroup
                                      |
                         onJoinComplete -> revoke / assign
```

## 客户端协调器

`AbstractCoordinator`（`clients/src/main/java/org/apache/kafka/clients/consumer/internals/AbstractCoordinator.java:123`）提供通用协议状态机。`ensureCoordinatorReady`（`:271`）定位 coordinator，`rejoinNeededOrPending`（`:355`）判断重入，`pollHeartbeat`（`:370`）维护会话，`joinGroupIfNeeded`（`:465`）串起 join/sync，`requestRejoin`（`:1094`）标记重入。

`ConsumerCoordinator#onJoinComplete`（`clients/src/main/java/org/apache/kafka/clients/consumer/internals/ConsumerCoordinator.java:379`）解码 assignment、触发 revoke/assign 回调并更新订阅；offset 提交路径是 `commitOffsetsAsync`（`:1052`）和 `commitOffsetsSync`（`:1146`）。

## Broker 侧状态

`GroupMetadataManager`（`group-coordinator/src/main/java/org/apache/kafka/coordinator/group/GroupMetadataManager.java:278`）维护 group、member 和 offset 状态。大量 `replay` 方法（`:5651` 起）说明状态可以由内部日志重建，而不是依赖某个 Broker 的内存副本。

## 为什么 assignment 不能由每个消费者独立决定

**替代方案**：所有消费者基于各自看到的成员列表独立计算分区。
**为什么不行**：网络视图可能不同，最终会出现重复消费或分区无人消费。
**证据**：`AbstractCoordinator` 通过 JoinGroup 选出 leader，再由 SyncGroup 下发统一 assignment；`onJoinComplete` 只应用当前 generation 的结果。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| poll 长时间阻塞 | 被踢出 group | poll 间隔和 heartbeat 约束不同 | 把业务处理移出 poll 临界路径 |
| 回调重复 | 资源释放两次 | generation 变化可能触发重试 | revoke/assign 做幂等 |
| commit 成功仍重复 | 至少一次语义 | commit 与业务处理非原子 | 事务或业务幂等 |

## 可迁移知识

成员协议通常需要 generation、coordinator 和可重放状态；generation 防止旧成员覆盖新状态，日志化状态让协调节点故障后可以恢复。

> **面试锚点**
> - JoinGroup 和 SyncGroup 分别做什么？
> - 为什么心跳线程不能替代 poll 线程？
> - generation 如何防止旧响应污染新分配？

## Related

- [整体架构](/notes/source/java/mq/kafka/architecture/)
- [事务、幂等与 offset](/notes/source/java/mq/kafka/transactions-offsets/)
- [RocketMQ 消费进度与重平衡](/notes/source/java/mq/rocketmq/consumer-rebalance/)