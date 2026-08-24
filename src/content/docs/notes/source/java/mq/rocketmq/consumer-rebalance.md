---
title: 消费进度与重平衡
description: RocketMQ 客户端如何分配 MessageQueue、维护 ProcessQueue，并在重平衡中保持队列边界。
category: Backend
tags: [Source Reading, RocketMQ, Consumer, Rebalance]
order: 17
updatedDate: 2026-08-24
difficulty: advanced
status: stable
lastReviewed: 2026-08-24
draft: false
sidebar:
  order: 17
---

消费者重平衡把 Topic 下的 `MessageQueue` 分配给同组实例；`ProcessQueue` 是每个逻辑队列在客户端的缓存、消费状态和位点边界。

<!-- more -->

## 先给答案：重平衡转移的是队列所有权，不是单条消息

同一消费组以 `MessageQueue` 为最小分配单元，客户端为每个已分配队列维护一个 `ProcessQueue`，把网络拉取、业务消费和位点提交串在同一所有权边界内。新增队列要创建缓冲并启动拉取，移除队列则要先停止旧路径并处理未完成消息。

因此消费者实例数超过队列数不会继续增加并行度；重平衡期间旧请求、消费中的消息和位点提交还可能交错，业务必须接受至少一次语义并保持幂等。顺序消费还需要把队列锁与本地 `ProcessQueue` 状态一起判断。

## 调用链

```text
doRebalance
  -> updateProcessQueueTableInRebalance
     -> add/remove ProcessQueue
     -> dispatchPullRequest
        -> putMessage
        -> consume -> removeMessage -> offset store
```

## 重平衡

`RebalanceImpl#doRebalance`（`client/src/main/java/org/apache/rocketmq/client/impl/consumer/RebalanceImpl.java:232`）获取 Topic 路由和消费者列表，使用分配策略计算本实例的队列集合。`updateProcessQueueTableInRebalance`（`:426`）删除不再归属本实例的队列，并为新队列创建 `ProcessQueue`；随后 `dispatchPullRequest`（`:503`）启动拉取。

删除队列前必须考虑正在拉取、正在消费和顺序消费锁。过早删除会让旧请求返回的消息失去归属，过晚删除则会造成重复拉取和堆积。

## ProcessQueue

`ProcessQueue`（`client/src/main/java/org/apache/rocketmq/client/impl/consumer/ProcessQueue.java:39`）用按消息 offset 排序的 `TreeMap` 保存缓存，并用读写锁保护拉取线程与消费线程。`putMessage`（`:129`）插入消息，`removeMessage`（`:187`）删除已消费消息并返回可提交位点。

队列移除分支在 `RebalanceImpl.java:459`，新增队列分支在 `RebalanceImpl.java:483`；客户端随后在 `RebalanceImpl.java:503` 批量派发拉取请求。

队列锁失败分支位于 `RebalanceImpl.java:469`，队列不存在时的告警分支位于 `RebalanceImpl.java:493`，顺序消费的重新调度入口仍回到 `RebalanceImpl.java:721` 的 `dispatchPullRequest` 抽象方法。

## 为什么按队列分配

**替代方案**：同组消费者竞争同一个队列中的单条消息。
**为什么不行**：需要更细粒度锁，顺序消费难以保证，位点提交也变成多生产者协调问题。
**证据**：`RebalanceImpl` 以 `Set<MessageQueue>` 为分配边界（`:426`），`ProcessQueue` 以单个逻辑队列为缓存边界（`:129`）。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| 实例多于队列 | 部分实例无任务 | 队列是最小并行度 | 规划队列数 |
| 重平衡期间提交 | 重复消费或位点回退 | 旧队列仍有未完成消息 | 幂等提交 |
| ProcessQueue 堆积 | 内存上升、拉取暂停 | 消费慢于拉取 | 按阈值背压 |
| 顺序锁丢失 | 队列并发消费 | 锁状态失效 | 暂停并重新获取 |

## 可迁移知识

把“分配单元”和“本地工作缓冲”绑定，能同时得到一致性边界与吞吐控制；分配边界和缓冲边界不应混成一个全局队列。

> **面试锚点**
> - 为什么实例数超过队列数后并行度不再提升？
> - ProcessQueue 如何连接拉取、消费和位点提交？
> - 重平衡时如何避免旧消费者继续处理已转移队列？

## Related

- [消息拉取与长轮询](/notes/source/java/mq/rocketmq/pull-long-polling/)
- [ConsumeQueue 与 IndexFile](/notes/source/java/mq/rocketmq/index-files/)
- [整体架构](/notes/source/java/mq/rocketmq/architecture/)
