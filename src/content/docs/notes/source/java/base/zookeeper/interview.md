---
title: 面试专题
description: ZooKeeper 高频面试题、高难追问与源码级回答。
category: Backend
tags: [Source Reading, ZooKeeper, Interview]
order: 49
updatedDate: 2026-08-24
difficulty: advanced
status: stable
lastReviewed: 2026-08-24
draft: false
sidebar: { order: 49 }
---

<!-- more -->

## 先给答案：ZooKeeper 高频面试题、高难追问与源码级回答

ZooKeeper 高频面试题、高难追问与源码级回答。 正文沿“高频题 -> 场景题”展开：先确认入口和状态归属，再跟踪控制流或数据流的推进，最后落到对外可观察的结果。

主要失效边界集中在“频繁 SessionExpired 怎么排查、Watcher 大量堆积怎么办”这些场景。它们破坏的是容量、顺序、并发或生命周期前提；排查时应先确认状态是否仍由正确对象持有，再核对推进条件和清理路径。

## 高频题

### ZooKeeper 如何保证写入顺序？

**30 秒版**：Leader 分配 zxid，经 ZAB 提案和多数确认后提交，所有节点按同样顺序应用到 `DataTree`。

**展开**：`ZooKeeperServer#submitRequest` 进入处理链，`Leader#propose` 生成顺序，Follower 接收后应用。顺序来自 zxid，不是网络到达顺序。

**加分项**：zxid 高位表达 epoch，低位表达 epoch 内序号。

**常见错答**：所有节点都能并发写并自动合并。

### Watcher 是永久订阅吗？

**30 秒版**：不是。触发后通常被移除，客户端收到事件后读取状态并重新注册。

**展开**：服务端由 `WatchManager#triggerWatch` 触发，客户端由 `ClientCnxn.EventThread` 执行。

**加分项**：事件可能合并，回调必须读取最终状态。

**常见错答**：每个中间状态都有一条事件。

### session 过期和连接断开有什么区别？

**30 秒版**：断开是传输层事件，过期是服务端租约失效。timeout 内重连，临时节点仍可保留。

**展开**：`SessionTrackerImpl#touchSession` 更新活跃时间，`ZooKeeperServer#expire` 执行清理。

**加分项**：timeout 是客户端与服务端协商值。

**常见错答**：TCP 断开就立即删除临时节点。

### 为什么通常部署奇数节点？

**30 秒版**：3 节点可容忍 1 个故障，4 节点仍只能容忍 1 个故障，成本更高。

**展开**：容错数为 `floor((n - 1) / 2)`，关键是多数阈值。

**加分项**：跨故障域比单纯增加节点更重要。

**常见错答**：4 节点能容忍 2 个故障。

### 快照和事务日志分别解决什么问题？

**30 秒版**：快照提供恢复基线，日志保存基线后的增量。

**展开**：`FileTxnSnapLog#restore` 先恢复快照，再重放日志。

**加分项**：日志目录与数据目录分离可降低 fsync 争用。

**常见错答**：快照可以替代日志。

## 场景题

### 频繁 SessionExpired 怎么排查？

检查 GC pause、网络 RTT、连接线程阻塞、服务端负载和 timeout 协商值，区分连接抖动与服务端过期。

### Watcher 大量堆积怎么办？

检查监听路径、重复注册和回调阻塞；必要时改成汇总节点或外部消息流。

## Related

- [ZAB 与 Leader 选举](/notes/source/java/base/zookeeper/zab-election/)
- [会话与超时](/notes/source/java/base/zookeeper/session/)
