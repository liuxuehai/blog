---
title: KRaft 与元数据控制器
description: KafkaRaftClient 的选举与复制，以及 QuorumController 如何应用已提交元数据记录。
category: Backend
tags: [Source Reading, Kafka, KRaft, Raft]
order: 215
sidebar:
  order: 215
---

KRaft 把控制器选举、元数据存储和传播变成 Kafka 自己维护的 Raft quorum；控制器只应用已经提交的 metadata record。

<!-- more -->

```text
Voters -> KafkaRaftClient -> election / fetch / high watermark
                              |
                              v
                      committed metadata records
                              |
                              v
                       QuorumController state
```

## Raft 客户端

`KafkaRaftClient`（`raft/src/main/java/org/apache/kafka/raft/KafkaRaftClient.java:170`）处理投票、epoch、fetch 和 snapshot。`initialize`（`:486`）建立状态，`transitionToCandidate`（`:724`）发起选举，`quorum.transitionToLeader`（`:662`）建立 leader state，`handleFetchRequest`（`:1483`）服务 follower 复制，`appendAsFollower`（`:1831`）和 `appendAsLeader`（`:1863`）处理两种追加。

`QuorumController` 位于 `metadata/src/main/java/org/apache/kafka/controller/QuorumController.java:177`。它作为 Raft listener 消费 committed records，更新 topic、partition、配置和节点状态，而不是直接接受未提交的任意修改。

## Snapshot 与恢复

`latestSnapshot`（`KafkaRaftClient.java:452`）发现快照，`handleFetchSnapshotRequest`（`:1922`）负责传输。恢复先安装一致快照，再继续应用快照 offset 之后的 committed records。

## 为什么控制器也做成日志状态机

**替代方案**：单控制器直接写本地文件，再通过 RPC 推送。
**为什么不行**：控制器故障时还需要另一个选主和一致性协议；推送成功也不能保证新控制器从相同状态继续。
**证据**：`KafkaRaftClient` 负责 epoch、vote、fetch 和 high watermark，`QuorumController` 只消费提交记录，snapshot 则控制重放成本。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| 只比较 offset | follower 追加错误分支 | epoch 也可能不同 | 同时比较 epoch 和 offset |
| leader append 就认为 committed | 数据已看到但不可见 | 尚未达到 quorum HW | 用 high watermark 判断提交 |
| snapshot 中途读取状态 | 元数据暂时不一致 | 快照切换边界错误 | 以 snapshot offset 原子切换 |

## 可迁移知识

“可复制日志 + 确定性状态机”可以统一选主、恢复、审计和版本传播；状态机不能依赖未提交事件。

> **面试锚点**
> - KRaft 解决了 ZooKeeper 时代哪些耦合？
> - Raft high watermark 为什么重要？
> - metadata snapshot 如何缩短恢复？

## Related

- [整体架构](/notes/source/java/mq/kafka/architecture/)
- [ISR 与副本同步](/notes/source/java/mq/kafka/isr-replication/)
- [Nacos JRaft 源码解析](/notes/source/java/rpc/nacos/)