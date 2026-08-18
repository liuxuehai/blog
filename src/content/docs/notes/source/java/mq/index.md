---
title: 消息中间件
description: RocketMQ 与 Kafka 的源码解析索引：日志存储、消费协议、复制与一致性。
category: Backend
tags: [Source Reading, Java, Messaging]
order: 2
updatedDate: 2026-08-16
difficulty: advanced
status: learning
lastReviewed: 2026-08-16
draft: false
sidebar:
  order: 2
---

消息中间件分组对应 `E:\source\java\mq\`，重点观察消息如何落盘、索引、消费，以及副本如何保持可用。

<!-- more -->

## 分册

| 仓库 | 主题 | 状态 |
| --- | --- | --- |
| [RocketMQ](/notes/source/java/mq/rocketmq/) | CommitLog、ConsumeQueue、长轮询、事务消息、DLedger | ✅ 8 篇 |
| [Kafka](/notes/source/java/mq/kafka/) | 分区日志、ISR、页缓存、KRaft 与重平衡 | ✅ 9 篇 |

## Related

- [Java 源码解析索引](/notes/source/java/)
- [源码解析总览](/notes/source/)
