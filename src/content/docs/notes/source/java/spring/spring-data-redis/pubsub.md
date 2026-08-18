---
title: 发布订阅容器
description: RedisMessageListenerContainer 的单连接多订阅、异步分发与恢复策略。
category: Backend
tags: [Source Reading, Spring Data Redis, PubSub]
order: 75
updatedDate: 2026-08-16
difficulty: advanced
status: stable
lastReviewed: 2026-08-16
draft: false
sidebar:
  order: 75
---

`RedisMessageListenerContainer` 把 Redis 的订阅连接与业务 listener 解耦：一个 subscriber 负责收消息，task executor 负责分发。

<!-- more -->

## 结构

```text
Redis Pub/Sub connection
  -> Subscriber
     -> channelMapping / patternMapping
        -> taskExecutor
           -> MessageListener.onMessage
```

类说明在 `listener/RedisMessageListenerContainer.java:73-111`：多个 listener 复用一个连接，消息分发交给 executor；连接仅在至少存在 listener 时建立。

容器用 `ConcurrentHashMap` 保存 channel、pattern 和 listener 反向索引，见 `:155-163`。新增订阅时，如果已经 listening，会在 `:706-731` 立即发起 subscribe 并等待同步完成。

## 消息处理

`processMessage` 位于 `:839-854`，只负责调用 listener 并捕获异常；`handleListenerException` 位于 `:856-874`，将异常交给 `ErrorHandler` 或记录日志。因此 listener 异常不会直接杀死订阅线程。

## 关键取舍

**替代方案**：每个 listener 建立一条 Redis 订阅连接。
**为什么不行**：连接和线程数量随 listener 数增长，且订阅连接本身是专用连接。
**证据**：类注释明确采用 one connection + multiplexed listeners，见 `RedisMessageListenerContainer.java:77-90`。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| 把 Pub/Sub 当可靠队列 | 消费者离线期间消息丢失 | Pub/Sub 无持久 pending list | 需要可靠消费时用 Stream |
| listener 阻塞 | 其他消息延迟 | 共用 task executor | listener 内部快速返回或隔离线程池 |
| 订阅连接断开 | 消费中断 | 驱动连接失效 | 配置 BackOff 和 ErrorHandler |

## 可迁移知识

事件接收与业务分发可以拆成两个并发域：接收线程保持协议状态，执行线程承载不可信业务代码。索引要同时维护正向和反向关系，才能低成本增删订阅。

> **面试锚点**
> - 为什么多个 listener 可以复用一条连接？
> - listener 异常如何避免影响订阅线程？
> - Pub/Sub 和 Stream 的可靠性边界是什么？

## Related

- [Redis Stream 长轮询](/notes/source/java/spring/spring-data-redis/stream/)
- [整体架构](/notes/source/java/spring/spring-data-redis/architecture/)