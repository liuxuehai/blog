---
title: etcd
description: etcd 源码解析总览：Raft、WAL、快照、MVCC、Watch 与 Lease。
category: Backend
tags: [Source Reading, etcd, Go, Distributed Systems]
order: 3
updatedDate: 2026-08-22
difficulty: advanced
status: stable
lastReviewed: 2026-08-22
draft: false
sidebar:
  order: 3
---

etcd 是一个把 Raft 一致性、WAL 持久化、MVCC 键值模型、Watch 事件流和 Lease 生命周期组合在一起的分布式协调存储。本册沿着“请求提交、日志持久化、状态应用、事件派生、客户端观察”的主链路阅读源码。

<!-- more -->

## 本册问题地图

etcd 要沿着“请求如何成为一致状态，再如何变成客户端事件”来读：

1. **Raft 日志、WAL、MVCC 各自保存什么？** Raft 日志描述集群顺序，WAL 保证重启可恢复，MVCC 保存带版本的用户状态；三者不是同一份数据的不同名字。
2. **什么时候算提交，什么时候客户端能读到？** 日志多数派确认只是共识提交边界，状态机 apply 后才进入可查询的 backend；读路径还要考虑线性一致性选项。
3. **Watch 为什么是派生流？** 它从已提交的 MVCC 变更生成事件，取消、压缩、慢消费者和历史版本不足都会改变观察结果。
4. **Lease 如何影响 key？** 租约过期会触发关联 key 的删除事件；keepalive 丢失不一定立刻过期，时间和 leader 判断共同决定结果。
5. **快照为什么不能替代 WAL？** 快照提供压缩后的状态基线，WAL 保存快照之后的增量；恢复必须按正确顺序组合二者。

## 版本快照

| 项 | 值 |
| --- | --- |
| 仓库 | `etcd-io/etcd` |
| 本地路径 | `E:\source\go\etcd` |
| 分支 | `main` |
| Commit | `0836b69e`（2026-08-13） |
| 最近 tag | `v3.8.0-alpha.0` |

> 本册坐标均基于该 commit；上游演进后行号可能漂移。

## 它解决什么问题

- 用 Raft 将写请求排序并复制到多数派，保证集群状态机的一致顺序。
- 用 WAL、快照和恢复流程把 Raft 状态可靠地落到磁盘。
- 用 MVCC revision 让读、写、事务、历史版本和 compact 有统一坐标。
- 用 Watch 将提交后的变更按 key 范围分发给长连接客户端。
- 用 Lease 和 KeepAlive 管理临时键、服务注册和故障后的自动清理。

## 模块地图

| 模块 | 职责 | 关键入口 |
| --- | --- | --- |
| `server/embed` | 配置、监听器和服务启动 | `StartEtcd` |
| `server/etcdserver` | 请求提交、Raft 驱动、应用与读一致性 | `NewServer`、`applyEntries` |
| `server/storage/raft`、`wal` | Raft Ready、WAL、快照与恢复 | `raftNode.start`、`wal.Open` |
| `server/storage/mvcc` | revision、索引、事务、compact、Watch | `New`、`storeTxnCommon` |
| `server/lease` | TTL、过期队列、KeepAlive、级联删除 | `NewLessor` |
| `client/v3` | gRPC KV、Watch、Lease 和 endpoint 管理 | `clientv3.New` |

## 读码入口顺序

1. 从 `embed.StartEtcd` 看配置如何组装监听器、后端和 `EtcdServer`。
2. 阅读 `raftNode.start`，理解 `Ready` 中的消息、日志、快照和应用通知顺序。
3. 跟踪 `EtcdServer.applyEntries` 到 MVCC/backend，建立“提交 index”和“应用 revision”的区别。
4. 阅读 watchable store 和 lessor，理解事件分发与租约过期如何复用同一事务路径。
5. 最后看 `client/v3` 的 gRPC 封装、重试、resolver 和 Watch/KeepAlive 流。

## 本册目录

- [整体架构](/notes/source/go/etcd/architecture/)：启动、请求、Raft、存储和事件链
- [Raft 请求与应用](/notes/source/go/etcd/raft/)：Proposal、Ready、提交与状态机应用
- [WAL、快照与恢复](/notes/source/go/etcd/wal-snapshot/)：持久化顺序、截断与启动恢复
- [MVCC 与 backend](/notes/source/go/etcd/mvcc/)：revision、索引、事务、版本与 compact
- [Watch 事件流](/notes/source/go/etcd/watch/)：synced/unsynced watcher、批处理与背压
- [Lease 与 KeepAlive](/notes/source/go/etcd/lease/)：TTL、主节点、过期删除与 checkpoint
- [客户端与一致性读取](/notes/source/go/etcd/client/)：KV、ReadIndex、endpoint 与长连接
- [面试专题](/notes/source/go/etcd/interview/)：源码级高频题与排障场景

## 横向对照

| 对象 | 对照点 |
| --- | --- |
| ZooKeeper | 都提供协调与临时节点；etcd 以 Raft + MVCC revision 组织状态 |
| Redis | Redis 偏单机内存数据结构；etcd 强调多数派提交和线性一致读 |
| Nacos | Nacos 聚焦配置与服务发现；etcd 提供更通用的一致性 KV 原语 |
| go-zero | go-zero 保护请求资源；etcd 保证跨实例共享状态的顺序与持久性 |

## Related

- [Go 源码解析](/notes/source/go/)
- [ZooKeeper 源码解析](/notes/source/java/base/zookeeper/)
- [Nacos 源码解析](/notes/source/java/rpc/nacos/)
