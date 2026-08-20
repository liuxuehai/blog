---
title: ZooKeeper
description: ZooKeeper 源码解析：ZAB、Fast Leader Election、会话、Watcher 与事务日志快照。
category: Backend
tags: [Source Reading, ZooKeeper, Distributed Coordination, Java]
order: 4
updatedDate: 2026-08-20
difficulty: advanced
status: stable
lastReviewed: 2026-08-20
draft: false
sidebar: { order: 4 }
---

ZooKeeper 用有序更新、临时节点和一次性 Watcher 提供协调原语；源码主线是客户端请求进入 `ZooKeeperServer`，由 Leader 通过 ZAB 提交，再由各节点的 `DataTree` 应用。

<!-- more -->

## 本册问题地图

ZooKeeper 要沿着“会话、写入、通知、恢复”四条线阅读：

1. **ZAB 为什么需要 Leader 和多数派确认？** 写请求必须形成有序 proposal，并在多数节点确认后提交，保证不同节点不会各自提交冲突历史。
2. **日志和快照为什么并存？** 日志保留增量操作，快照提供快速恢复点；恢复时先加载快照，再重放其后的日志。
3. **Session 如何影响临时节点？** 临时节点的生命周期绑定会话，连接短暂断开不一定立即删除，超时后服务端才判定会话失效。
4. **Watcher 为什么是一次性通知？** 它只报告状态变化，不替客户端保存持续订阅；收到通知后必须重新读取并重新注册。
5. **读请求是否都线性一致？** 本地读可能看到本节点视角，写入通过 Leader 顺序提交；需要强一致读时必须使用相应同步语义。

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
