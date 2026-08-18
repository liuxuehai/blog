---
title: Redis Stream 长轮询
description: StreamMessageListenerContainer、StreamPollTask、offset 与消费组的源码链路。
category: Backend
tags: [Source Reading, Spring Data Redis, Stream]
order: 76
updatedDate: 2026-08-16
difficulty: advanced
status: stable
lastReviewed: 2026-08-16
draft: false
sidebar:
  order: 76
---

Stream 消费不是订阅回调，而是由可取消的长轮询任务持续执行 `XREAD` 或 `XREADGROUP`。

<!-- more -->

## 调用链

```text
StreamMessageListenerContainer.receive(...)
  -> DefaultStreamMessageListenerContainer.register
     -> TaskSubscription(StreamPollTask)
        -> executor.execute(task)
           -> readFunction(XREAD/XREADGROUP)
           -> update offset -> deserialize -> listener
```

接口说明在 `stream/StreamMessageListenerContainer.java:43-91`，强调 polling、offset、executor 和错误取消。默认创建入口在 `:127-157`。

`DefaultStreamMessageListenerContainer` 构造器位于 `stream/DefaultStreamMessageListenerContainer.java:81-106`，会建立内部 `RedisTemplate` 和 Stream operations；`start` 在 `:145-162` 提交未启动任务，`stop` 在 `:164-175` 取消所有订阅。

## Offset 状态机

```text
initial offset
  -> XREAD/XREADGROUP
  -> last record id
  -> next poll
  -> cancel or error
```

`StreamPollTask#createPollState` 位于 `stream/StreamPollTask.java:73-82`，区分 standalone 与 consumer；`doLoop` 位于 `:119-144`，循环读取并按策略决定错误后是否取消；记录处理在 `:150-170` 先更新 offset 再通知 listener。

## 关键取舍

**替代方案**：使用 `ReadOffset.latest()` 作为所有后续读取位置。
**为什么不行**：轮询暂停期间到达的消息可能被跳过。
**证据**：接口注释在 `StreamMessageListenerContainer.java:80-82` 明确提示 latest 可能丢消息，应使用 message id 或 lastConsumed。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| 每个订阅共用小线程池 | 部分 Stream 不消费 | 一个任务是长生命周期 | executor 线程数按订阅数规划 |
| 只用 latest | 消息缺失 | offset 跳到当前尾部 | 使用 `lastConsumed` 或具体 ID |
| listener 抛异常 | 订阅被取消 | 默认错误策略可能 cancel | 设置 request 级 ErrorHandler 和 predicate |

## 可迁移知识

长轮询消费者应把 offset、取消、错误策略和回调解耦；offset 更新必须和记录处理顺序明确，否则重启时会出现重复或丢失语义不清。

> **面试锚点**
> - Stream container 和 Pub/Sub container 的根本区别？
> - `StreamPollTask` 如何实现取消？
> - `latest` 为什么可能丢消息？

## Related

- [发布订阅容器](/notes/source/java/spring/spring-data-redis/pubsub/)
- [事务与管道](/notes/source/java/spring/spring-data-redis/transaction-pipeline/)