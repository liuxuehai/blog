---
title: CommitLog 顺序写与 mmap
description: RocketMQ 如何通过 MappedFileQueue、追加记录和刷盘策略承载高吞吐写入。
category: Backend
tags: [Source Reading, RocketMQ, CommitLog, mmap]
order: 12
updatedDate: 2026-08-20
difficulty: advanced
status: stable
lastReviewed: 2026-08-20
draft: false
sidebar:
  order: 12
---

`CommitLog` 把消息组织成连续物理日志，写入路径追求追加和批量，读取路径依靠索引跳回具体偏移。

<!-- more -->

## 先给答案：日志写成功不等于消费者立即可见

CommitLog 的核心取舍是让写入尽量变成连续追加，再把消费定位交给异步索引。消息写入物理文件后，还要经历提交/刷盘、`ReputMessageService` 重放、`ConsumeQueue` 建索引，以及消费者拉取和位点推进；所以排查“生产成功但消费不到”时，要按这条因果链逐段确认，而不是直接怀疑消费端。

mmap 减少了用户态与文件缓存之间的复制和系统调用，但它只是内存映射，不自动等于数据已经落盘。异常时尤其要区分：文件空间不足会阻止追加；异步刷盘故障可能丢失最近数据；尾部半条记录可能是崩溃恢复边界；索引落后则表现为可见性延迟而非物理日志不存在。

## 设计概览

```text
MessageExtBrokerInner -> CommitLog#asyncPutMessage
                       -> current MappedFile
                       -> append record
                       -> commit / flush
```

## 实现拆解

- `DefaultMessageStore#asyncPutMessage`（`store/src/main/java/org/apache/rocketmq/store/DefaultMessageStore.java:645`）执行写前校验和 Hook。
- `CommitLog#asyncPutMessage`（`store/src/main/java/org/apache/rocketmq/store/CommitLog.java:999`）选择文件、序列化记录并处理写入结果。
- `CommitLog#getMessage`（`CommitLog.java:1439`）按绝对偏移定位 `MappedFile` 并返回缓冲区切片。
- `DefaultMessageStore#putMessage`（`DefaultMessageStore.java:716`）通过等待 Future 提供同步语义。
- 批量入口 `CommitLog#asyncPutMessages`（`CommitLog.java:1172`）摊薄单条调用开销。
- 写入锁在 `CommitLog.java:153` 根据配置选择可重入锁或自旋锁。
- 文件读取入口还会在 `CommitLog.java:1410` 复用物理 offset 读取路径。
- 后台刷盘任务的执行循环位于 `CommitLog.java:1536`，提交服务循环位于 `CommitLog.java:1874`。
- 写入锁在 `CommitLog.java:153` 根据配置选择可重入锁或自旋锁。
- 文件读取入口还会在 `CommitLog.java:1410` 复用物理 offset 读取路径。
- 后台刷盘任务的执行循环位于 `CommitLog.java:1536`，提交服务循环位于 `CommitLog.java:1874`。

记录通常包含长度、魔数、CRC、队列信息、时间戳和属性。文件尾部不足以容纳完整记录时必须切换文件并保留可恢复边界。

## 为什么使用 mmap

**替代方案**：每条消息调用 `FileChannel.write`。
**为什么不行**：系统调用频率高，写入路径更难批量；映射文件更适合按绝对偏移访问分段日志。
**证据**：`CommitLog` 使用 `MappedFileQueue` 管理分段文件，但 `mmap` 不等于持久化，仍需 CommitLog 的 commit/flush 服务。

## 关键取舍

| 取舍 | 收益 | 代价 |
| --- | --- | --- |
| 单一物理日志 | 顺序写、恢复简单 | 读取必须经过索引 |
| 固定大小映射文件 | 滚动边界清晰 | 文件切换有尾部处理 |
| 异步刷盘 | 吞吐高 | 崩溃窗口更大 |
| Future 异步入口 | 易背压和批量 | 调用方要处理异常完成 |

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| 磁盘不足 | 写入失败 | 新映射文件无法创建 | 监控保留空间 |
| 异步刷盘崩溃 | 最近消息丢失 | 数据仍在页缓存 | 关键业务使用同步策略 |
| 大消息 | 延迟和复制成本上升 | 单条记录过大 | 限制大小，正文外置 |
| offset 越界 | 读取为空或失败 | 位点超过当前范围 | 校验位点并等待追平 |

## 可迁移知识

追加日志适合把写放在热路径，把查询模型放到异步投影；映射文件适合 WAL、时序日志和事件溯源。

> **面试锚点**
> - mmap 为什么快，为什么又不等于持久化？
> - 同步 `putMessage` 与异步 `asyncPutMessage` 的关系是什么？
> - CommitLog 如何处理文件尾部不完整记录？

## Related

- [整体架构](/notes/source/java/mq/rocketmq/architecture/)
- [ConsumeQueue 与 IndexFile](/notes/source/java/mq/rocketmq/index-files/)
- [主从复制与 DLedger](/notes/source/java/mq/rocketmq/replication-dledger/)
