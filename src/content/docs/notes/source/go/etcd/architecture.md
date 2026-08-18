---
title: 整体架构
description: etcd 从 embed 启动到 Raft、MVCC、Watch 和 Lease 的整体源码地图。
category: Backend
tags: [Source Reading, etcd, Go, Architecture]
order: 31
updatedDate: 2026-08-16
difficulty: advanced
status: stable
lastReviewed: 2026-08-16
draft: false
sidebar:
  order: 31
---

etcd 的核心不是一个简单的 KV server，而是一个由 Raft 排序、WAL 持久化、MVCC 状态机和事件派生器组成的复制状态机。

<!-- more -->

## 分层

```text
clientv3 gRPC
      |
      v
EtcdServer API / auth / quota
      |
      v
proposal -> raft.Node -> Ready
      |                    |
      |                    +--> WAL / snapshot / transport
      v
applyEntries -> MVCC store -> backend
                         |
                         +--> Watch events
                         +--> Lease attached keys
```

| 层 | 代表代码 | 关键职责 |
| --- | --- | --- |
| 入口层 | `server/embed/etcd.go` | 校验配置、监听 client/peer、启动服务 |
| 共识层 | `server/etcdserver/raft.go` | 消费 Raft `Ready`，保存日志并转发消息 |
| 应用层 | `server/etcdserver/server.go` | 等待提交、解码请求、应用事务和响应 |
| 存储层 | `server/storage/mvcc`、`backend` | revision、索引、Bolt backend 和 compact |
| 旁路层 | `watchable_store`、`lease/lessor` | 从已提交状态派生 Watch 和过期删除 |

## 启动链

`StartEtcd` 先校验配置并配置 peer/client listener，再组装 `config.ServerConfig`，最后调用 `etcdserver.NewServer`：`server/embed/etcd.go:107-264`。启动返回不代表已经可以接收线性一致请求，调用方应等待 `ReadyNotify`。

## 三条状态边界

```text
Raft committed index  !=  applied index  !=  MVCC revision

committed index: 多数派确认的日志位置
applied index:   本节点已执行到的日志位置
MVCC revision:   KV 状态机的逻辑版本
```

把这三者混为一谈会导致读一致性、Watch 起始 revision 和快照恢复判断错误。Raft 的 index 由共识层推进，revision 由 KV 写事务推进。

## 为什么 Watch 和 Lease 不直接绕过 Raft

**替代方案**：本地收到 KeepAlive 或 TTL 到期后直接删键、直接通知 watcher。
**为什么不行**：不同节点会在不同时间执行，最终 backend 状态和事件顺序可能分叉。
**设计**：Lease 过期通过 range delete 事务重新提交到 Raft；Watch 只观察已经应用的 MVCC 事件。

## 边界与踩坑

| 场景 | 风险 | 处理 |
| --- | --- | --- |
| 只检查端口监听 | 服务尚未完成选主或应用追赶 | 等待 `ReadyNotify` |
| 直接读本地 backend | 读到未线性化状态 | 需要 quorum/read-index 语义 |
| 用 wall clock 判断集群顺序 | 节点时钟偏差破坏顺序 | 使用 Raft index 和 MVCC revision |
| 把 Watch 当数据库查询 | compact 后历史不可恢复 | 处理 compact revision 错误并重新建立 watcher |

## 可迁移知识

分布式存储的架构图必须标出“谁排序、谁持久化、谁应用、谁产生事件”，而不是只列出模块名称。

> **面试锚点**
> - etcd 的 committed index、applied index、revision 有什么区别？
> - 为什么 Lease 和 Watch 都必须建立在状态机应用之后？
> - `StartEtcd` 返回后为什么还要等待 ready？

## Related

- [Raft 请求与应用](/notes/source/go/etcd/raft/)
- [MVCC 与 backend](/notes/source/go/etcd/mvcc/)
- [Lease 与 KeepAlive](/notes/source/go/etcd/lease/)
