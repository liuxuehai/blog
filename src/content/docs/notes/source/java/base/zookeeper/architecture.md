---
title: 整体架构
description: ZooKeeper quorum、ZAB、请求处理链和持久化边界的源码地图。
category: Backend
tags: [Source Reading, ZooKeeper, Architecture]
order: 41
updatedDate: 2026-08-24
difficulty: advanced
status: stable
lastReviewed: 2026-08-24
draft: false
sidebar: { order: 41 }
---

<!-- more -->

## 先给答案：ZooKeeper quorum、ZAB、请求处理链和持久化边界的源码地图

ZooKeeper quorum、ZAB、请求处理链和持久化边界的源码地图。 正文沿“分层 -> 主流程 -> 核心坐标”展开：先确认入口和状态归属，再跟踪控制流或数据流的推进，最后落到对外可观察的结果。

主要失效边界集中在“少于半数存活、Leader 切换、Watcher 过多”这些场景。它们破坏的是容量、顺序、并发或生命周期前提；排查时应先确认状态是否仍由正确对象持有，再核对推进条件和清理路径。

## 分层

```text
ClientCnxn -> ServerCnxnFactory -> ZooKeeperServer
                                -> Prep -> Sync -> Final
                                -> DataTree + WatchManager
QuorumPeer -> FastLeaderElection -> Leader/Follower -> ZAB
                                      -> FileTxnSnapLog
```

```text
启动: QuorumPeerMain -> QuorumPeer -> election -> LEADING/FOLLOWING
请求: NIOServerCnxn -> submitRequest -> processors -> DataTree
复制: Leader#propose -> quorum ack -> commit -> followers apply
```

## 主流程

`QuorumPeerMain#runFromConfig` 创建 quorum；`QuorumPeer#run` 依据状态创建 `Leader` 或 `Follower`。Leader 通过 `Leader#lead` 建立 learner 同步，Follower 通过 `Follower#followLeader` 接收提案。客户端请求从 `NIOServerCnxn#readRequest` 到 `ZooKeeperServer#submitRequest`，再进入处理器链。

## 核心坐标

- `QuorumPeerMain#runFromConfig` — `zookeeper-server/src/main/java/org/apache/zookeeper/server/quorum/QuorumPeerMain.java:132`
- `QuorumPeer#run` — `zookeeper-server/src/main/java/org/apache/zookeeper/server/quorum/QuorumPeer.java:1555`
- `FastLeaderElection#lookForLeader` — `zookeeper-server/src/main/java/org/apache/zookeeper/server/quorum/FastLeaderElection.java:932`
- `Leader#lead` — `zookeeper-server/src/main/java/org/apache/zookeeper/server/quorum/Leader.java:1090`
- `Leader#propose` — `zookeeper-server/src/main/java/org/apache/zookeeper/server/quorum/Leader.java:1180`
- `Follower#followLeader` — `zookeeper-server/src/main/java/org/apache/zookeeper/server/quorum/Follower.java:83`
- `ZooKeeperServer#submitRequest` — `zookeeper-server/src/main/java/org/apache/zookeeper/server/ZooKeeperServer.java:1510`
- `PrepRequestProcessor#run` — `zookeeper-server/src/main/java/org/apache/zookeeper/server/PrepRequestProcessor.java:134`
- `SyncRequestProcessor#run` — `zookeeper-server/src/main/java/org/apache/zookeeper/server/SyncRequestProcessor.java:119`
- `FinalRequestProcessor#processRequest` — `zookeeper-server/src/main/java/org/apache/zookeeper/server/FinalRequestProcessor.java:147`
- `DataTree#processTxn` — `zookeeper-server/src/main/java/org/apache/zookeeper/server/DataTree.java:302`
- `FileTxnSnapLog#restore` — `zookeeper-server/src/main/java/org/apache/zookeeper/server/persistence/FileTxnSnapLog.java:254`

## 为什么这么设计

**替代方案**：所有节点直接并发写本地树。**为什么不行**：相同请求可能以不同顺序落地，状态无法收敛。**证据**：Leader 分配 zxid 并形成提案序列，Follower 只能按序应用。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| 少于半数存活 | 集群不能提交 | quorum 失效 | 奇数节点、跨故障域 |
| Leader 切换 | 短暂不可写 | epoch/zxid 需要重新同步 | 客户端处理连接状态 |
| Watcher 过多 | 内存增长 | 路径集合持有 watcher | 控制监听规模 |

## 可迁移知识

“日志顺序、状态机应用、快照压缩”是通用复制状态机结构，可复用于配置中心和元数据服务。

> **面试锚点**
> - 为什么写请求必须经过 Leader？
> - zxid 如何表达 epoch 和顺序？
> - Follower 如何保证按序应用？

## Related

- [ZAB 与 Leader 选举](/notes/source/java/base/zookeeper/zab-election/)
- [数据树与事务持久化](/notes/source/java/base/zookeeper/persistence/)
