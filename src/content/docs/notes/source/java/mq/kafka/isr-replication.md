---
title: ISR 与副本同步
description: ReplicaManager、ReplicaFetcherThread、ISR 收缩与 high watermark 的源码链路。
category: Backend
tags: [Source Reading, Kafka, Replication, Consistency]
order: 213
updatedDate: 2026-08-24
difficulty: advanced
status: stable
lastReviewed: 2026-08-24
draft: false
sidebar:
  order: 213
---

Kafka 采用 follower 按 offset 拉取的复制模型；ISR 把“能够及时追上 leader 的副本”明确成提交语义的一部分。

<!-- more -->

## 先给答案：Kafka 的可靠性边界是提交位置，不是 Leader 写入位置

Leader 追加消息后，Follower 拉取并写入自己的日志；当满足副本同步条件时，分区推进 HW，消费者才可以读取这条已提交记录。LEO 只说明某个副本本地写到哪里，ISR 说明哪些副本仍有资格参与安全提交。

因此 `acks=all` 仍需结合 `min.insync.replicas`、ISR 收缩和选主策略理解。Leader 返回成功但消息尚未过 HW，可能在故障中丢失或暂不可见；ISR 过小导致写入失败，则是以可用性换安全性，而不是 Kafka 随机丢消息。

```text
Leader ReplicaManager ──serve fetch──► Follower ReplicaFetcherThread
       │                                      │
       └── ISR / HW ◄── caught up ◄── LocalLog append
```

## Leader 与 follower

`ReplicaManager#appendRecords`（`core/src/main/scala/kafka/server/ReplicaManager.scala:638`）接收 Produce 请求，`appendRecordsToLeader`（`:586`）交给 leader partition。`fetchMessages`（`:1665`）同时服务 consumer 和 follower，但 fetch isolation 与返回边界不同。

`ReplicaFetcherThread`（`core/src/main/scala/kafka/server/ReplicaFetcherThread.scala:30`）是 follower 后台线程，`doWork`（`:107`）调度 fetch，`processPartitionData`（`:113`）验证 leader epoch、处理截断并追加 follower 日志。

`ReplicaManager#maybeShrinkIsr`（`ReplicaManager.scala:2100`）定期移除落后副本。ISR 不是全部 replicas，而是当前满足追赶条件的子集；HW 则是可以安全暴露给消费者的提交边界。

## 为什么使用 pull replication

**替代方案**：leader 收到消息后主动推送给所有 follower。
**为什么不行**：慢 follower 会把 leader 的发送队列和调度耦合起来，无法独立控制批量、重试和背压。
**证据**：`ReplicaFetcherThread#doWork` 由 follower 自己驱动 fetch；leader 只提供数据并在 `maybeShrinkIsr` 维护成员资格。

## 故障路径

| 故障 | 动作 | 结果 |
| --- | --- | --- |
| follower 暂时断开 | fetch 重试失败，ISR 收缩 | 健康 ISR 继续推进提交 |
| follower 出现分叉 | epoch/offset 边界触发截断 | 截断后重新追加 |
| leader 切换 | 新 leader 使用合法 epoch 和提交边界 | 防止旧尾部复活 |

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| ISR 不是所有 replica | 误把集合当副本列表 | ISR 是健康子集 | 分开监控 replicas 与 ISR |
| `acks=all` 等于强一致 | 仍可能读到旧数据 | ack、HW、isolation 不同 | 同看三个边界 |
| 副本数很多但提交停滞 | ISR 健康成员不足 | under-replicated | 监控 ISR shrink |

## 可迁移知识

拉模型复制让消费者自己控制节奏，生产者只暴露带版本边界的数据；版本号和提交水位共同解决分叉与旧数据覆盖。

> **面试锚点**
> - ISR 为什么收缩和扩张？
> - HW 与 LEO 有什么区别？
> - follower 发现分叉后如何恢复？

## Related

- [分区日志与稀疏索引](/notes/source/java/mq/kafka/partition-log/)
- [整体架构](/notes/source/java/mq/kafka/architecture/)
- [KRaft 与元数据控制器](/notes/source/java/mq/kafka/kraft-controller/)
