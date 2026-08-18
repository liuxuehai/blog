---
title: RocketMQ
description: RocketMQ 源码解析总览：CommitLog、消费索引、长轮询、事务消息与 DLedger 复制。
category: Backend
tags: [Source Reading, RocketMQ, Messaging, Storage]
order: 1
updatedDate: 2026-08-16
difficulty: advanced
status: stable
lastReviewed: 2026-08-16
draft: false
sidebar:
  order: 1
---

RocketMQ 是以日志存储为核心的消息系统：消息先进入物理 `CommitLog`，再异步构建消费队列和索引，消费端通过逻辑队列定位物理消息。

<!-- more -->

## 版本快照

| 项 | 值 |
| --- | --- |
| 仓库 | `apache/rocketmq` |
| 本地路径 | `E:\source\java\mq\rocketmq` |
| 分支 | `develop` |
| Commit | `293f5885719fc4aa3619446a1900f58ccfcfdd29`（2026-08-14） |
| 最近 tag | `rocketmq-all-5.5.0` |

> 本册所有源码坐标均基于上述 commit。

## 它解决什么问题

- 把高吞吐追加写与按 Topic/Queue 消费的随机访问拆开。
- 在消费者暂时没有消息时，用长轮询减少空拉取。
- 用半消息、回查和副本协议处理事务可见性与节点故障。

## 模块地图

| 模块 | 职责 | 关键抽象 |
| --- | --- | --- |
| `store` | 物理日志、消费索引、刷盘与复制 | `CommitLog`、`ConsumeQueue`、`MappedFileQueue` |
| `broker` | 拉取、长轮询、事务和请求协议 | `PullMessageProcessor`、`PullRequestHoldService` |
| `client` | 生产、消费、重平衡 | `RebalanceImpl`、`ProcessQueue` |
| `dledger` | 复制与选主 | `DLedgerCommitLog` |

## 读码入口顺序

1. `DefaultMessageStore#asyncPutMessage` → `CommitLog#asyncPutMessage`。
2. `ReputMessageService` → `ConsumeQueue` / `IndexFile`。
3. `DefaultMessageStore#getMessage` → `PullMessageProcessor#processRequest`。
4. `PullRequestHoldService` → `NotifyMessageArrivingListener`。
5. `TransactionalMessageServiceImpl` → `EndTransactionProcessor`。
6. `DLedgerCommitLog` → `DLedgerRoleChangeHandler`。

## 本册目录

- [整体架构](/notes/source/java/mq/rocketmq/architecture/)
- [CommitLog 顺序写与 mmap](/notes/source/java/mq/rocketmq/commitlog/)
- [ConsumeQueue 与 IndexFile](/notes/source/java/mq/rocketmq/index-files/)
- [消息拉取与长轮询](/notes/source/java/mq/rocketmq/pull-long-polling/)
- [事务消息半消息与回查](/notes/source/java/mq/rocketmq/transaction-message/)
- [主从复制与 DLedger](/notes/source/java/mq/rocketmq/replication-dledger/)
- [消费进度与重平衡](/notes/source/java/mq/rocketmq/consumer-rebalance/)
- [面试专题](/notes/source/java/mq/rocketmq/interview/)

## 横向对照

| 对象 | 对照点 |
| --- | --- |
| Kafka | 都以追加日志为核心；RocketMQ 把消费队列作为独立索引 |
| Redis Streams | 都保存消费位点；RocketMQ 的物理日志和逻辑队列分层更明显 |
| Spring Cloud Alibaba RocketMQ | 上层 Binder 负责 Spring 适配，本册关注 Broker、Store 和 Client 内核 |

## Related

- [消息中间件](/notes/source/java/mq/)
- [Spring Cloud Alibaba](/notes/source/java/spring/spring-cloud-alibaba/)
- [Redis](/notes/source/redis/redis/)
