---
title: Watcher 一次性通知
description: WatchManager、DataTree 触发路径和客户端事件线程。
category: Backend
tags: [Source Reading, ZooKeeper, Watcher]
order: 44
updatedDate: 2026-08-16
difficulty: advanced
status: stable
lastReviewed: 2026-08-16
draft: false
sidebar: { order: 44 }
---

Watcher 是一次性边沿通知，不是服务端持续推送的订阅流。客户端收到事件后重新注册，才能继续观察变化。

## 调用链

```text
getData(path, watch=true) -> WatchManager#addWatch
  -> DataTree mutation -> triggerWatch
  -> ClientCnxn.EventThread -> user Watcher.process
```

`DataTree` 为 data、existence、child 三类 watch 使用不同集合；修改节点时触发对应路径并从集合移除。客户端把网络线程收到的事件交给 `EventThread`，不在 IO 线程执行用户回调。

关键坐标：

- `WatchManager#addWatch` — `zookeeper-server/src/main/java/org/apache/zookeeper/server/watch/WatchManager.java:104`
- `WatchManager#triggerWatch` — `zookeeper-server/src/main/java/org/apache/zookeeper/server/watch/WatchManager.java:205`
- `WatchManager#removeWatcher` — `zookeeper-server/src/main/java/org/apache/zookeeper/server/watch/WatchManager.java:165`
- `DataTree#addDataNode` — `zookeeper-server/src/main/java/org/apache/zookeeper/server/DataTree.java:495`
- `DataTree#deleteNode` — `zookeeper-server/src/main/java/org/apache/zookeeper/server/DataTree.java:604`
- `DataTree#setData` — `zookeeper-server/src/main/java/org/apache/zookeeper/server/DataTree.java:647`
- `DataTree#processTxn` — `zookeeper-server/src/main/java/org/apache/zookeeper/server/DataTree.java:302`
- `ClientCnxn#queuePacket` — `zookeeper-client/zookeeper-client/src/main/java/org/apache/zookeeper/ClientCnxn.java:1050`
- `ClientCnxn.EventThread#run` — `zookeeper-client/zookeeper-client/src/main/java/org/apache/zookeeper/ClientCnxn.java:1162`

## 为什么不是持续订阅

**替代方案**：服务端为每个客户端保存无限事件队列。**为什么不行**：慢客户端会积压内存，重连后的事件顺序也难定义。**证据**：Watcher 触发后从路径集合删除，客户端重新读取当前状态。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| 先读后注册 | 丢变化 | 注册与读取存在竞态 | 使用带 watch 的 API |
| 回调阻塞 | 后续事件延迟 | EventThread 串行 | 回调只投递任务 |
| 事件合并 | 少于预期事件数 | 不承诺每个中间状态 | 读取最终状态 |

## 可迁移知识

一次性通知适合“状态变化，请重新读取”；通知应小，真实状态以可重复读取的快照为准。

> **面试锚点**
> - Watcher 为什么一次性？
> - 如何避免读取和注册之间的竞态？
> - 为什么不能在回调里做阻塞操作？

## Related

- [会话与超时](/notes/source/java/base/zookeeper/session/)
- [数据树与事务持久化](/notes/source/java/base/zookeeper/persistence/)
