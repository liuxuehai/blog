---
title: ZooKeeper
description: ZooKeeper 源码解析：ZAB、Fast Leader Election、会话、Watcher 与事务日志快照。
category: Backend
tags: [Source Reading, ZooKeeper, Distributed Coordination, Java]
order: 4
updatedDate: 2026-08-16
difficulty: advanced
status: stable
lastReviewed: 2026-08-16
draft: false
sidebar: { order: 4 }
---

ZooKeeper 用有序更新、临时节点和一次性 Watcher 提供协调原语；源码主线是客户端请求进入 `ZooKeeperServer`，由 Leader 通过 ZAB 提交，再由各节点的 `DataTree` 应用。

<!-- more -->

## 版本快照

| 项 | 值 |
| --- | --- |
| 仓库 | `apache/zookeeper` |
| 本地路径 | `E:\source\java\base\zookeeper` |
| 分支 | `master` |
| Commit | `1b6a4c20`（2026-08-10） |
| 最近 tag | — |

## 模块地图

| 模块 | 职责 | 关键入口 |
| --- | --- | --- |
| `zookeeper-server` | 服务端、选举、ZAB、数据树 | `QuorumPeerMain`、`ZooKeeperServer` |
| `zookeeper-client` | Java/C 客户端协议与连接 | `ZooKeeper`、`ClientCnxn` |
| `zookeeper-jute` | 请求、事务和响应序列化 | `Record`、`BinaryInputArchive` |
| `zookeeper-specifications` | ZAB 与系统模型 | `Zab.tla` |

## 读码入口

1. `QuorumPeerMain#runFromConfig` 启动 quorum。
2. `QuorumPeer#run` 在 LOOKING/FOLLOWING/LEADING 间切换。
3. `Leader#propose`、`Leader#commit` 追踪 ZAB 提案。
4. `ZooKeeperServer#submitRequest` 进入请求处理链。
5. `DataTree`、`WatchManager`、`FileTxnSnapLog` 分别对应状态、通知、持久化。

## 本册目录

- [整体架构](/notes/source/java/base/zookeeper/architecture/)
- [ZAB 与 Leader 选举](/notes/source/java/base/zookeeper/zab-election/)
- [会话与超时](/notes/source/java/base/zookeeper/session/)
- [Watcher 一次性通知](/notes/source/java/base/zookeeper/watcher/)
- [数据树与事务持久化](/notes/source/java/base/zookeeper/persistence/)
- [面试专题](/notes/source/java/base/zookeeper/interview/)

## 横向对照

| 对象 | 对照点 |
| --- | --- |
| etcd | 都用共识保证线性化，但 etcd 以 Raft/MVCC 为主，ZooKeeper 以 ZAB/有序 zxid 为主 |
| Nacos | 都提供注册协调，ZooKeeper 的临时节点和 Watcher 更接近底层协调原语 |

## Related

- [网络与基础库](/notes/source/java/base/)
- [Nacos 源码解析](/notes/source/java/rpc/nacos/)
