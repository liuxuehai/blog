---
title: 面试专题
description: RocketMQ 高频面试题、高难追问与源码级回答锚点。
category: Backend
tags: [Source Reading, RocketMQ, Interview]
order: 19
updatedDate: 2026-08-24
difficulty: advanced
status: stable
lastReviewed: 2026-08-24
draft: false
sidebar:
  order: 19
---

RocketMQ 面试的核心是能把“写入、索引、可见性、提交和故障恢复”串成一条证据链。

<!-- more -->

## 先给答案：RocketMQ 的回答主线是写入、可见、提交和恢复四个时刻

CommitLog 本地追加、ConsumeQueue 可见、副本达到提交条件、客户端收到成功响应是不同事件。事务消息又在此基础上增加半消息、最终提交和回查状态；消费端则用队列所有权、`ProcessQueue` 与位点提交形成另一条状态机。

面试和排障都应先说明当前讨论的是哪一个时刻，再给源码入口和失败后的重试边界。只说“顺序写所以快”“同步复制所以不丢”都不完整，因为索引延迟、响应丢失、角色切换和消费幂等仍决定最终行为。

## 高频题

### RocketMQ 为什么要 CommitLog + ConsumeQueue？

**30 秒版**：CommitLog 负责顺序追加，ConsumeQueue 只保存物理偏移、长度和时间戳。写入路径不需要为每个 Topic/Queue 做随机 IO，消费时先查逻辑索引，再回读物理消息。

**展开**：`DefaultMessageStore#asyncPutMessage`（`DefaultMessageStore.java:645`）进入 `CommitLog#asyncPutMessage`（`CommitLog.java:999`），之后由 `ReputMessageService`（`DefaultMessageStore.java:2655`）派生 ConsumeQueue。

**加分项**：索引是可重建派生数据，短时间内可能出现物理日志已写而消费索引未追平。

**常见错答**：把 ConsumeQueue 说成完整消息文件。

### 长轮询如何工作？

**30 秒版**：Pull 没有消息时，Broker 暂存请求；新消息到达时通知等待桶，再重新检查 offset 和过滤条件后响应。

**展开**：入口是 `PullMessageProcessor#processRequest`（`PullMessageProcessor.java:304`），挂起在 `suspendPullRequest`（`PullRequestHoldService.java:45`），唤醒在 `notifyMessageArriving`（`:119`）。

**加分项**：通知只是“可能有变化”，唤醒后必须重检，避免 Reput 尚未完成造成假唤醒。

**常见错答**：说成客户端固定间隔不断短轮询。

### 事务消息保证了强一致吗？

**30 秒版**：不保证跨数据库和 Broker 的强一致，而是通过半消息、提交/回滚和回查实现最终一致性。生产者本地事务仍是业务事实源。

**展开**：半消息入口是 `asyncPrepareMessage`（`TransactionalMessageServiceImpl.java:99`），最终状态由 `EndTransactionProcessor#processRequest`（`EndTransactionProcessor.java:59`）处理，未知状态由 `check`（`TransactionalMessageServiceImpl.java:162`）回查。

**加分项**：消费端仍要幂等，因为提交重试和故障恢复可能造成重复投递。

**常见错答**：把事务消息等同于 XA 两阶段提交。

### DLedger 和传统主从有什么差别？

**30 秒版**：传统 HA 主要是主写从追赶，DLedger 把消息追加纳入带角色和提交语义的复制日志。DLedger 还能把选主结果反馈给 Broker，减少人工切主。

**展开**：`DLedgerCommitLog#asyncPutMessage`（`DLedgerCommitLog.java:539`）调用 `handleAppend`（`:582`），角色变化由 `DLedgerRoleChangeHandler#handle`（`DLedgerRoleChangeHandler.java:57`）处理。

**加分项**：角色切换还要处理读写权限、同步状态和旧主隔离。

**常见错答**：认为改 `BrokerRole` 枚举就完成故障转移。

### 重平衡的最小分配单元是什么？

**30 秒版**：是 `MessageQueue`，而不是单条消息。一个队列在同一消费组内通常只归属一个实例，客户端用 `ProcessQueue` 缓存这个队列的拉取结果。

**展开**：`doRebalance`（`RebalanceImpl.java:232`）计算队列集合，`updateProcessQueueTableInRebalance`（`:426`）更新归属，`ProcessQueue#putMessage`（`ProcessQueue.java:129`）接收消息。

**加分项**：队列数决定消费组的最大并行度上限。

**常见错答**：只增加消费者实例就能无限提升吞吐。

## 高难追问

### CommitLog 写成功但为什么拉不到？

**30 秒版**：物理写入和消费索引是两个阶段。Reput 尚未把消息分发到 ConsumeQueue，或者过滤条件不匹配，都会导致暂时拉不到。

**展开**：Store 读取链路由 `DefaultMessageStore#getMessage`（`DefaultMessageStore.java:865`）从 ConsumeQueue 取得偏移，再调用 `CommitLog#getMessage`（`CommitLog.java:1439`）。

**加分项**：排查应看 dispatch lag，而不是只看 CommitLog 最大 offset。

**常见错答**：直接断言消息已经丢失。

### 为什么消费者端还需要 ProcessQueue？

**30 秒版**：它隔离网络拉取和业务消费，提供按 offset 排序的缓存、背压和位点边界。没有它，拉取线程和消费线程会直接竞争共享状态。

**展开**：实现使用 `TreeMap` 和读写锁，`putMessage` 与 `removeMessage` 分别对应入队和消费完成。

**加分项**：堆积阈值可以反向暂停拉取，形成客户端背压。

**常见错答**：把它当成 Broker 端的 ConsumeQueue。

## 场景题

### 线上事务半消息持续增长怎么查？

先看半消息年龄和数量，再查生产者事务检查请求、监听器异常、网络超时和最终提交响应；确认是否存在无法判定的本地事务，并准备幂等补偿。源码入口依次是 `check`、`EndTransactionProcessor` 和生产者事务监听器。

### 消费延迟突然升高怎么查？

按“队列堆积 → Reput 延迟 → CommitLog 磁盘/刷盘 → Broker 长轮询与网络 → ProcessQueue 消费耗时”的顺序切分。不要只看消费者 QPS，必须同时观察逻辑位点、物理位点和实例重平衡次数。

## 反向问面试官

- 线上使用异步刷盘还是同步刷盘？允许多大的崩溃丢失窗口？
- 消费者是否要求严格顺序，业务幂等键是什么？
- Broker 使用传统 HA 还是 DLedger，故障切换的 RTO/RPO 目标是多少？

## Related

- [整体架构](/notes/source/java/mq/rocketmq/architecture/)
- [事务消息半消息与回查](/notes/source/java/mq/rocketmq/transaction-message/)
- [主从复制与 DLedger](/notes/source/java/mq/rocketmq/replication-dledger/)
