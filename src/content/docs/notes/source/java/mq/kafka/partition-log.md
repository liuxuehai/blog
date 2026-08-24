---
title: 分区日志与稀疏索引
description: UnifiedLog、LogSegment、offset index 和 time index 如何实现追加写与定位读取。
category: Backend
tags: [Source Reading, Kafka, Log, Storage]
order: 212
updatedDate: 2026-08-24
difficulty: advanced
status: stable
lastReviewed: 2026-08-24
draft: false
sidebar:
  order: 212
---

Kafka 的一个 partition 是只追加的 offset 序列；文件按 segment 切分，索引只记录稀疏位置，再从文件扫描到目标 record。

<!-- more -->

## 先给答案：稀疏索引只负责缩小范围，原始日志负责最终定位和恢复

每个 partition 是单调递增的 offset 序列，按 segment 切分；offset/time index 只记录部分位置，读取先定位最近条目，再顺序扫描到目标 record。这样控制索引体积，同时保留顺序追加和批次读取优势。

索引不是事实源：异常尾部要由 `recover` 扫描日志并重建，副本回退必须同时截断数据文件、offset index、time index 和 transaction index。只按文件名或 base offset 计算物理位置，会忽略 batch 与文件位置的实际边界。

## 数据结构

```text
UnifiedLog
 └─ LocalLog
     └─ LogSegment(baseOffset=1000)
          ├─ .log
          ├─ .index       offset -> file position
          ├─ .timeindex   timestamp -> offset
          └─ .txnindex    transaction metadata
```

`UnifiedLog`（`storage/src/main/java/org/apache/kafka/storage/internals/log/UnifiedLog.java:105`）负责日志生命周期；`LocalLog`（`.../LocalLog.java:69`）组织 segment；`LogSegment`（`.../LogSegment.java:66`）封装数据文件和索引。

## 追加与读取

`UnifiedLog#appendAsLeader`（`UnifiedLog.java:1020`）校验 epoch 和 batch，`maybeRoll`（`:2146`）判断是否滚动。`LogSegment#append`（`LogSegment.java:251`）追加数据，`FileRecords#append`（`clients/src/main/java/org/apache/kafka/common/record/internal/FileRecords.java:193`）写入文件。

读取从 `UnifiedLog#read`（`UnifiedLog.java:1649`）开始，经过 `LogSegment#translateOffset`（`LogSegment.java:381`）用稀疏索引找到近似位置，再由 `LogSegment#read`（`:409`）顺序扫描校正。时间查询入口是 `fetchOffsetByTimestamp`（`UnifiedLog.java:1682`）。

## 恢复与截断

`LogSegment#recover`（`LogSegment.java:483`）重建索引并截掉末尾不完整字节（`:519-528`）。副本回退使用 `truncateTo`（`:562`），同步截断 offset、time、transaction index（`:569-571`）和数据文件。

## 为什么使用稀疏索引

**替代方案**：每条 record 建立精确 offset 到文件位置的索引。
**为什么不行**：索引会随消息数线性膨胀，并引入额外维护成本；顺序扫描少量 record 通常更便宜。
**证据**：`translateOffset` 只返回近似位置，最终仍由 `read` 扫描；`append` 同步维护日志和索引边界。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| 直接按文件名计算 offset | 查到错误记录 | base offset 不等于文件位置 | 经过 index 再扫描 |
| 只截断 `.log` | 重启后索引越界 | 索引仍指向旧位置 | 使用 `truncateTo` |
| 把压缩 batch 当单条消息 | offset 跳跃 | offset 绑定 batch 内逻辑记录 | 使用 batch API |

## 可迁移知识

“稀疏索引 + 顺序校正”适合写多读多、key 单调递增的数据；索引负责缩小范围，原始日志负责最终正确性。

> **面试锚点**
> - Kafka 为什么能用稀疏索引快速查 offset？
> - segment 滚动和恢复分别在哪里发生？
> - 截断时为什么必须同步截断多个索引？

## Related

- [整体架构](/notes/source/java/mq/kafka/architecture/)
- [零拷贝与页缓存](/notes/source/java/mq/kafka/zero-copy-page-cache/)
- [ISR 与副本同步](/notes/source/java/mq/kafka/isr-replication/)
