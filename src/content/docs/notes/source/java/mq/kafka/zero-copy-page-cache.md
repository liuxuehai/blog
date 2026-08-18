---
title: 零拷贝与页缓存
description: FileRecords、MemoryRecords、文件映射和传输路径如何降低 Kafka 的数据搬运成本。
category: Backend
tags: [Source Reading, Kafka, Performance, IO]
order: 214
sidebar:
  order: 214
---

Kafka 的性能来自两层复用：写入时把 batch 尽量交给文件页缓存，读取时让内核尽量把文件页直接交给 socket。

<!-- more -->

```text
+Producer batch+ -> MemoryRecords -> FileRecords -> page cache
+Consumer fetch+ -> FileRecords / transfer -> kernel -> socket
```

## 记录批次

`MemoryRecords`（`clients/src/main/java/org/apache/kafka/common/record/internal/MemoryRecords.java:50`）表示内存中的 batch，`builder`（`:476` 起）负责构造，`withRecords`（`:589` 起）提供工厂。batch 边界同时服务压缩、校验和网络传输。

`FileRecords`（`clients/src/main/java/org/apache/kafka/common/record/internal/FileRecords.java:41`）封装文件记录，`readInto`（`:137`）读入 buffer，`searchForOffsetFromPosition`（`:313`）完成索引后的文件内校正。`LogSegment#read`（`storage/src/main/java/org/apache/kafka/storage/internals/log/LogSegment.java:409`）只负责选择范围，不重复解码。

## 零拷贝边界

文件页已经在 page cache 时，网络层可以尽量走 file channel transfer 路径；但压缩解压、TLS、过滤和事务隔离都可能要求用户态访问数据。因此 zero-copy 是一条优化路径，不是所有 fetch 的绝对属性。

## 为什么不把所有消息放在 Java heap

**替代方案**：Broker 把热数据全部复制到堆内缓存，再由网络线程发送。
**为什么不行**：会增加堆对象、GC、用户态 buffer 和 socket buffer 之间的搬运，缓存容量也受 JVM 限制。
**证据**：`FileRecords` 直接围绕文件和 buffer 操作，`MemoryRecords` 只表示构造或解码中的 batch；`LogSegment#append`（`LogSegment.java:251`）把持久化边界交给文件系统。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| 堆占用低就认为没缓存压力 | OS 内存很高 | page cache 在 JVM 外 | 同时看主机缓存和磁盘 IO |
| 盲目增大 batch | 延迟尖峰 | 单批失败成本变大 | 结合 p99、压缩率测试 |
| TLS 仍被当成 zero-copy | CPU 升高 | 加密必须访问明文 | 分离网络加密指标 |

## 可迁移知识

大数据系统应优先让内核承担缓存和搬运，让用户态只保留必须解释的数据；压缩、加密和过滤会改变最优路径。

> **面试锚点**
> - page cache 和 JVM heap 各承担什么角色？
> - `MemoryRecords` 与 `FileRecords` 为什么分开？
> - 哪些场景会削弱 zero-copy？

## Related

- [分区日志与稀疏索引](/notes/source/java/mq/kafka/partition-log/)
- [整体架构](/notes/source/java/mq/kafka/architecture/)
- [Redis 源码解析](/notes/source/redis/redis/)