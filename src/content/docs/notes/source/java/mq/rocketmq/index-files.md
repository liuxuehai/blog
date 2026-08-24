---
title: ConsumeQueue 与 IndexFile
description: RocketMQ 如何用定长消费索引和关键词索引把逻辑位置映射到 CommitLog。
category: Backend
tags: [Source Reading, RocketMQ, ConsumeQueue, IndexFile]
order: 13
updatedDate: 2026-08-24
difficulty: advanced
status: stable
lastReviewed: 2026-08-24
draft: false
sidebar:
  order: 13
---

RocketMQ 将“按队列顺序消费”和“按关键词查找”拆成两种索引：前者紧凑顺序，后者服务过滤与定位。

<!-- more -->

## 先给答案：ConsumeQueue 管顺序消费，IndexFile 管按键定位，事实仍只在 CommitLog

ConsumeQueue 用定长条目保存物理 offset、消息大小和时间戳，适合按 Topic/Queue 的逻辑位点顺序扫描；IndexFile 用哈希槽和冲突链支持业务 key 查询。两者都只保存定位信息，不复制完整消息。

索引由 Reput 异步派生，所以索引落后表现为暂时不可消费或不可查询，而不是 CommitLog 数据已经丢失。恢复和截断时必须以物理日志边界校正索引；哈希冲突影响查询成本，但只要继续遍历并校验 key，就不改变正确性。

## 数据结构

```text
CommitLog record
   ├─ physical offset + size + timestamp -> ConsumeQueue
   └─ key hash -> IndexFile slot -> chained entries
```

## ConsumeQueue

`DefaultMessageStore` 注册 `CommitLogDispatcherBuildConsumeQueue`（`store/src/main/java/org/apache/rocketmq/store/DefaultMessageStore.java:248`）；Reput 扫描消息后进入 `ConsumeQueue#putMessagePositionInfoWrapper`（`store/src/main/java/org/apache/rocketmq/store/ConsumeQueue.java:725`）。每个定长条目保存物理偏移、消息大小和时间戳。

读取时 `DefaultMessageStore#getMessage`（`DefaultMessageStore.java:865`）先遍历 ConsumeQueue 得到 `offsetPy` 和 `sizePy`，再调用 `CommitLog#getMessage`（`CommitLog.java:1439`）读取完整消息。

## IndexFile

`CommitLogDispatcherBuildIndex`（`DefaultMessageStore.java:2255`）把唯一键、业务键或关键词写入 `IndexFile#putKey`（`store/src/main/java/org/apache/rocketmq/store/index/IndexFile.java:116`）。哈希槽找到链表头后继续扫描冲突项，冲突影响性能但不影响正确性。

索引分发器和消费队列分发器都由 Reput 路径触发；消息读取时还会在 `DefaultMessageStore.java:983` 回到 CommitLog，恢复检查点相关逻辑位于 `DefaultMessageStore.java:1187` 与 `DefaultMessageStore.java:1203`。

索引分发器和消费队列分发器都由 Reput 路径触发；消息读取时还会在 `DefaultMessageStore.java:983` 回到 CommitLog，恢复检查点相关逻辑位于 `DefaultMessageStore.java:1187` 与 `DefaultMessageStore.java:1203`。

## 为什么不保存完整消息

**替代方案**：每个 Topic/Queue 保存一份完整消息。
**为什么不行**：物理日志和消费队列重复占空间，写入、刷盘、恢复和复制成本都会放大。
**证据**：`putMessagePositionInfoWrapper` 接收 `DispatchRequest` 的位置元数据，完整内容仍由 `CommitLog#getMessage` 读取。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| Reput 落后 | 生产成功但暂时拉不到 | 消费索引异步构建 | 监控 dispatch lag |
| 哈希冲突 | 查询变慢 | 多个 key 共用 slot | 控制关键词基数 |
| 位点错配 | 重复或跳过消费 | 位点未按 Topic/Queue 隔离 | 严格隔离位点 |
| 文件截断 | 最大 offset 回退 | 尾部条目不完整 | 恢复时校验 entry |

## 可迁移知识

“紧凑索引 + 大对象事实表”适合日志和事件系统：索引只保存定位信息，事实数据只保留一份。

> **面试锚点**
> - ConsumeQueue 条目为什么定长？
> - IndexFile 哈希冲突如何保证正确性？
> - 为什么索引落后不等于消息丢失？

## Related

- [CommitLog 顺序写与 mmap](/notes/source/java/mq/rocketmq/commitlog/)
- [消息拉取与长轮询](/notes/source/java/mq/rocketmq/pull-long-polling/)
- [消费进度与重平衡](/notes/source/java/mq/rocketmq/consumer-rebalance/)
