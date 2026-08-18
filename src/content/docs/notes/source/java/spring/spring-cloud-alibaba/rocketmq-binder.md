---
title: RocketMQ Stream Binder
description: RocketMQ Binder 如何把 topic、生产者、消费者和错误通道接入 Spring Cloud Stream。
category: Backend
tags: [Source Reading, Spring Cloud Alibaba, RocketMQ, Spring Cloud Stream]
order: 85
updatedDate: 2026-08-16
difficulty: advanced
status: stable
lastReviewed: 2026-08-16
draft: false
sidebar:
  order: 85
---

RocketMQ Binder 把消息客户端转换成 Stream 的绑定模型：业务声明 destination 和 binding，Binder 负责 topic、consumer、producer 和 ack。

<!-- more -->

## 数据流

```text
Stream binding -> RocketMQMessageChannelBinder -> TopicProvisioner
               -> ProducerMessageHandler -> MQProducer
               -> InboundChannelAdapter <- MQPushConsumer
               -> MessageChannel / error channel
```

## 实现拆解

- `RocketMQBinderAutoConfiguration:42-60` 注册 properties、provisioner 和 binder。
- `RocketMQTopicProvisioner:35` 实现 Stream `ProvisioningProvider`。
- `RocketMQMessageChannelBinder:61-74` 继承 `AbstractMessageChannelBinder`。
- `createProducerMessageHandler:80-108` 创建出站 handler 和 failure channel。
- `createConsumerEndpoint:116` 创建入站 `MessageProducer`。
- `RocketMQProducerMessageHandler:59` 负责转换、分区选择和发送模式。
- `onInit:94-119` 初始化并启动 producer。
- `handleMessageInternal:166-202` 区分事务、同步、异步和单向发送。
- `RocketMQInboundChannelAdapter:53` 接收消息，`doStart:183-197` 启动 push consumer。

## 发送语义

| 模式 | 源码分支 | 特征 |
| --- | --- | --- |
| OneWay | `RocketMQProducerMessageHandler:221-229` | 不等待 broker 响应 |
| Sync | `:231-236` | 返回发送结果 |
| Async | `:238-247` | 通过 callback |
| Transaction | `:181-188` | 委托事务发送接口 |

## 为什么让 Binder 持有 provisioner

**替代方案**：每个 producer/consumer 自己创建 topic 和客户端。
**为什么不行**：资源策略会分散，重复创建、命名不一致和关闭遗漏都会出现。
**证据**：`RocketMQMessageChannelBinder:61-74` 将 provisioner 交给父类统一管理。

## 错误与确认

出站失败通过 `sendFailureChannel` 发送错误消息，见 `RocketMQProducerMessageHandler:277-292`。入站支持恢复回调，见 `RocketMQInboundChannelAdapter:82-87`；失败由 Stream 错误通道和重试策略处理。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| OneWay 要求可靠投递 | 业务以为已落盘 | 客户端不等待 broker 结果 | 关键消息使用 Sync 或事务 |
| consumer group 复用 | 应用互相分摊消息 | group 是消费语义边界 | 独立业务使用独立 group |
| 错误通道未绑定 | 失败只打日志 | 没有 failure channel | 配置 error channel 或 recoverer |

## 可迁移知识

Binder 是“领域适配器 + 生命周期模板”的组合。其他消息系统也可按 provision、producer handler、consumer endpoint、error contract 四个边界接入统一模型。

> **面试锚点**
> - Binder 和底层 Producer 如何分工？
> - OneWay、Async、Sync 的失败语义有什么不同？
> - 为什么 topic provision 不应散落在 handler 内？

## Related

- [RocketMQ 概念笔记](/notes/backend/mq/rocketmq/)
- [整体架构](/notes/source/java/spring/spring-cloud-alibaba/architecture/)
