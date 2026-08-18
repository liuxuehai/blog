---
title: 消息拉取与长轮询
description: Broker 如何挂起无消息请求，并在消息到达时重新检查条件后唤醒消费者。
category: Backend
tags: [Source Reading, RocketMQ, Pull, Long Polling]
order: 14
updatedDate: 2026-08-16
difficulty: advanced
status: stable
lastReviewed: 2026-08-16
draft: false
sidebar:
  order: 14
---

RocketMQ 在无消息时暂存 Pull 请求，等消息到达或请求超时后再响应，降低空轮询开销。

<!-- more -->

## 时序

```text
Consumer -> PullMessageProcessor -> Store
              │ no message
              ▼
        PullRequestHoldService
              ▲
              │ new message
        NotifyMessageArrivingListener
              │ retry query and reply
              └──────────────► Consumer
```

## Broker 请求路径

`PullMessageProcessor#processRequest`（`broker/src/main/java/org/apache/rocketmq/broker/processor/PullMessageProcessor.java:304`）负责权限、Topic/Queue、offset 和过滤条件校验，然后查询 Store。无消息且允许挂起时，`PullRequestHoldService#suspendPullRequest`（`broker/src/main/java/org/apache/rocketmq/broker/longpolling/PullRequestHoldService.java:45`）把请求放入按 Topic/Queue 分桶的等待结构。

定时线程 `PullRequestHoldService#run`（`:69`）检查超时请求；消息到达时，`NotifyMessageArrivingListener`（`broker/src/main/java/org/apache/rocketmq/broker/longpolling/NotifyMessageArrivingListener.java:28`）转发通知，最终进入 `notifyMessageArriving`（`PullRequestHoldService.java:119`）。服务会重新检查 offset 和过滤条件，避免假唤醒。

## 客户端协作

重平衡后，`RebalanceImpl#dispatchPullRequest`（`client/src/main/java/org/apache/rocketmq/client/impl/consumer/RebalanceImpl.java:503`）把队列拉取任务交给消费者线程。返回消息进入 `ProcessQueue#putMessage`（`client/src/main/java/org/apache/rocketmq/client/impl/consumer/ProcessQueue.java:129`），消费成功后由 `removeMessage`（`ProcessQueue.java:187`）删除并推进位点。

长轮询周期检查线程在 `PullRequestHoldService.java:69`，通知监听器统一入口在 `NotifyMessageArrivingListener.java:48`；Remoting 层入口在 `PullMessageProcessor.java:290`。

## 为什么不用固定间隔短轮询

**替代方案**：消费者每 100ms 发起一次 Pull。
**为什么不行**：低流量时请求大多为空，高流量时又会产生突发请求；延迟被轮询间隔绑定。
**证据**：`suspendPullRequest`（`:45`）和 `notifyMessageArriving`（`:119`）形成等待与唤醒两条路径，Broker 承担了等待职责。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| 长轮询超时 | 收到空响应 | 没有新消息或过滤不匹配 | 将空响应视为正常状态 |
| 通知早于索引 | 被唤醒后仍无消息 | CommitLog 已写但 ConsumeQueue 未追平 | 唤醒后重新查询 |
| 消费阻塞 | ProcessQueue 堆积 | 拉取速度大于处理速度 | 依据堆积阈值暂停拉取 |
| 连接断开 | 挂起请求失效 | Channel 生命周期结束 | 清理请求并允许重试 |

## 可迁移知识

长轮询是“事件通知 + 条件重检”：通知只代表状态可能变化，最终结果必须重新验证。这个模式也适用于配置推送和任务队列。

> **面试锚点**
> - 长轮询如何避免假唤醒？
> - 为什么通知到达不代表消息一定可见？
> - ProcessQueue 在拉取和消费之间承担什么作用？

## Related

- [整体架构](/notes/source/java/mq/rocketmq/architecture/)
- [ConsumeQueue 与 IndexFile](/notes/source/java/mq/rocketmq/index-files/)
- [消费进度与重平衡](/notes/source/java/mq/rocketmq/consumer-rebalance/)
