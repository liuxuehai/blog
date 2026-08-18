---
title: 数据树与事务持久化
description: DataTree、TxnLog、快照恢复和日志滚动的源码链路。
category: Backend
tags: [Source Reading, ZooKeeper, Persistence]
order: 45
updatedDate: 2026-08-16
difficulty: advanced
status: stable
lastReviewed: 2026-08-16
draft: false
sidebar: { order: 45 }
---

内存 `DataTree` 是服务请求的读模型，事务日志和快照才是重启、复制和恢复的事实来源。

## 数据结构

```text
FileTxnSnapLog -> TxnLog: txnlog.*
               -> SnapShot: snapshot.*
               -> restore() -> DataTree.processTxn()
```

写请求先在 `PrepRequestProcessor` 生成事务记录，`SyncRequestProcessor` 负责日志同步和 fsync 策略，最终 `FinalRequestProcessor` 把事务应用到 `DataTree`。快照降低恢复时需要重放的日志数量。

关键坐标：

- `FileTxnSnapLog#append` — `zookeeper-server/src/main/java/org/apache/zookeeper/server/persistence/FileTxnSnapLog.java:213`
- `FileTxnSnapLog#commit` — `zookeeper-server/src/main/java/org/apache/zookeeper/server/persistence/FileTxnSnapLog.java:230`
- `FileTxnSnapLog#restore` — `zookeeper-server/src/main/java/org/apache/zookeeper/server/persistence/FileTxnSnapLog.java:254`
- `FileTxnLog#append` — `zookeeper-server/src/main/java/org/apache/zookeeper/server/persistence/FileTxnLog.java:220`
- `FileTxnLog#commit` — `zookeeper-server/src/main/java/org/apache/zookeeper/server/persistence/FileTxnLog.java:292`
- `SerializeUtils#deserializeSnapshot` — `zookeeper-server/src/main/java/org/apache/zookeeper/server/util/SerializeUtils.java:142`
- `SerializeUtils#deserializeTxn` — `zookeeper-server/src/main/java/org/apache/zookeeper/server/util/SerializeUtils.java:190`
- `DataTree#serialize` — `zookeeper-server/src/main/java/org/apache/zookeeper/server/DataTree.java:1252`
- `DataTree#deserialize` — `zookeeper-server/src/main/java/org/apache/zookeeper/server/DataTree.java:1276`
- `SyncRequestProcessor#flush` — `zookeeper-server/src/main/java/org/apache/zookeeper/server/SyncRequestProcessor.java:204`

## 为什么日志和快照都要有

**替代方案**：只保留完整快照，写入会复制整棵树；只保留日志，恢复会重放无限历史。**选择**：快照提供基线，日志覆盖快照后的增量。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| dataDir 与 logDir 共盘 | 延迟抖动 | fsync 与快照争用 IO | 分离磁盘 |
| 快照过大 | 恢复慢 | 序列化和加载成本高 | 调整 snapCount |
| 磁盘满 | 写失败 | 日志无法追加 | 监控磁盘与 purge |

## 可迁移知识

事件日志加周期快照是持久化状态机的通用优化；恢复时先加载基线，再重放边界之后的事件。

> **面试锚点**
> - 重启时如何恢复 DataTree？
> - 为什么不能只用快照或只用日志？
> - fsync 策略影响什么一致性边界？

## Related

- [整体架构](/notes/source/java/base/zookeeper/architecture/)
- [ZAB 与 Leader 选举](/notes/source/java/base/zookeeper/zab-election/)
