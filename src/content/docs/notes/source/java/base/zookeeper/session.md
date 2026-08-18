---
title: 会话与超时
description: ZooKeeper session、心跳、桶式过期和临时节点清理。
category: Backend
tags: [Source Reading, ZooKeeper, Session]
order: 43
updatedDate: 2026-08-16
difficulty: advanced
status: stable
lastReviewed: 2026-08-16
draft: false
sidebar: { order: 43 }
---

Session 把连接短暂性提升为客户端身份；连接断开不等于 session 立即失效，超过 timeout 才会清理临时节点。

## 生命周期

```text
createSession -> trackSession -> touchSession
       |                         |
       +------ timeout ----------+
                    -> expireSession -> cleanup ephemeral nodes
```

`PrepRequestProcessor` 处理 `createSession` 并把 session 放入 tracker；连接读请求时 `NIOServerCnxnFactory#touchCnxn` 更新活跃时间。`SessionTrackerImpl` 使用过期桶降低定时器数量，过期后 `ZooKeeperServer#expire` 进入清理。

关键坐标：

- `PrepRequestProcessor#pRequest2Txn` — `zookeeper-server/src/main/java/org/apache/zookeeper/server/PrepRequestProcessor.java:563`
- `SessionTrackerImpl#addSession` — `zookeeper-server/src/main/java/org/apache/zookeeper/server/SessionTrackerImpl.java:175`
- `SessionTrackerImpl#touchSession` — `zookeeper-server/src/main/java/org/apache/zookeeper/server/SessionTrackerImpl.java:276`
- `SessionTrackerImpl#run` — `zookeeper-server/src/main/java/org/apache/zookeeper/server/SessionTrackerImpl.java:335`
- `ZooKeeperServer#touch` — `zookeeper-server/src/main/java/org/apache/zookeeper/server/ZooKeeperServer.java:1070`
- `ZooKeeperServer#expire` — `zookeeper-server/src/main/java/org/apache/zookeeper/server/ZooKeeperServer.java:1109`
- `NIOServerCnxnFactory#touchCnxn` — `zookeeper-server/src/main/java/org/apache/zookeeper/server/NIOServerCnxnFactory.java:795`
- `DataTree#killSession` — `zookeeper-server/src/main/java/org/apache/zookeeper/server/DataTree.java:764`

## 为什么用过期桶

**替代方案**：每个 session 一个 `ScheduledFuture`。**为什么不行**：大量客户端会制造大量定时任务和锁竞争。**证据**：tracker 按 expiry time 组织 bucket，线程只处理当前到期桶。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| timeout 太小 | 频繁过期 | GC/网络抖动超过窗口 | 覆盖故障与暂停预算 |
| 只重连不重建 | 临时节点消失 | session 已过期 | 监听状态并重建业务状态 |
| 心跳线程阻塞 | 误判过期 | ping 无法发送 | 隔离连接线程 |

## 可迁移知识

桶式定时器适合大量相近截止时间的租约；租约失效后的清理必须由服务端状态机完成。

> **面试锚点**
> - session timeout 与 TCP 断开有何区别？
> - 为什么不为每个会话建定时器？
> - 临时节点由谁删除？

## Related

- [Watcher 一次性通知](/notes/source/java/base/zookeeper/watcher/)
- [数据树与事务持久化](/notes/source/java/base/zookeeper/persistence/)
