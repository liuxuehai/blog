---
title: ZAB 与 Leader 选举
description: FastLeaderElection、epoch/zxid 和提案提交的源码链路。
category: Backend
tags: [Source Reading, ZooKeeper, ZAB, Consensus]
order: 42
updatedDate: 2026-08-20
difficulty: advanced
status: stable
lastReviewed: 2026-08-20
draft: false
sidebar: { order: 42 }
---

ZAB（ZooKeeper Atomic Broadcast）把“谁是 Leader”和“更新按什么顺序提交”绑定在 epoch/zxid 语义中。

## 先给答案：ZAB 选的是能安全延续历史的 Leader

选举不能只看“谁收到的票多”。候选节点需要比较事务历史的新旧程度，通常优先选择拥有更新 zxid 的节点；成为 Leader 后还要通过发现、同步和广播阶段，让多数节点对当前历史达成一致。这样新 Leader 才不会提交一个已经被多数派确认的旧状态。

日志和快照是恢复链的一部分：快照提供基线，proposal 日志补齐增量。网络分区时少数派不能继续提交；重新加入的节点必须先同步，再恢复服务。

## 状态机

```text
LOOKING -> FastLeaderElection -> LEADING
   |                              |
   +------------------------------+-> FOLLOWING
          更大 zxid / 新 epoch
```

## 实现拆解

`FastLeaderElection#lookForLeader` 广播选票；`totalOrderPredicate` 优先比较 zxid，再比较 server id。形成多数后由 `QuorumPeer#setPeerState` 切换状态。Leader 在 `Leader#propose` 分配 zxid，收到多数 ack 后 `Leader#commit` 广播提交。

关键坐标：

- `FastLeaderElection#lookForLeader` — `zookeeper-server/src/main/java/org/apache/zookeeper/server/quorum/FastLeaderElection.java:932`
- `FastLeaderElection#totalOrderPredicate` — `zookeeper-server/src/main/java/org/apache/zookeeper/server/quorum/FastLeaderElection.java:744`
- `QuorumPeer#setPeerState` — `zookeeper-server/src/main/java/org/apache/zookeeper/server/quorum/QuorumPeer.java:1747`
- `QuorumPeer#startLeaderElection` — `zookeeper-server/src/main/java/org/apache/zookeeper/server/quorum/QuorumPeer.java:1498`
- `Leader#lead` — `zookeeper-server/src/main/java/org/apache/zookeeper/server/quorum/Leader.java:1090`
- `Leader#propose` — `zookeeper-server/src/main/java/org/apache/zookeeper/server/quorum/Leader.java:1180`
- `Leader#processAck` — `zookeeper-server/src/main/java/org/apache/zookeeper/server/quorum/Leader.java:1332`
- `Leader#commit` — `zookeeper-server/src/main/java/org/apache/zookeeper/server/quorum/Leader.java:1274`
- `Follower#processPacket` — `zookeeper-server/src/main/java/org/apache/zookeeper/server/quorum/Follower.java:178`
- `Learner#syncWithLeader` — `zookeeper-server/src/main/java/org/apache/zookeeper/server/quorum/Learner.java:237`

## 为什么不是简单投票

**替代方案**：只选 server id 最大的节点。**为什么不行**：它可能持有旧日志，接管后会覆盖已提交状态。**证据**：选票先比较 lastLoggedZxid，再比较 sid；恢复阶段再决定 DIFF、TRUNC 或 SNAP。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| 网络分区 | 两侧尝试选主 | 只有多数侧能提交 | 监控 quorum |
| 旧 Leader 恢复 | 被降级 | epoch 已变化 | 先完成同步 |
| 日志缺口大 | 走快照 | 增量日志不足 | 规划 snapCount |

## 可迁移知识

选举比较器必须把日志新鲜度放在节点 id 前；恢复协议应区分增量追赶、冲突截断和全量快照。

> **面试锚点**
> - Fast Leader Election 为什么比较 zxid？
> - 多数 ack 与本地落盘是什么关系？
> - 新 Leader 如何处理未提交尾部？

## Related

- [整体架构](/notes/source/java/base/zookeeper/architecture/)
- [数据树与事务持久化](/notes/source/java/base/zookeeper/persistence/)
