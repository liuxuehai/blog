---
title: 客户端与一致性读取
description: etcd clientv3 的 KV、Watch、Lease、endpoint 管理和 ReadIndex 一致性边界。
category: Backend
tags: [Source Reading, etcd, Go, Client]
order: 37
updatedDate: 2026-08-16
difficulty: advanced
status: stable
lastReviewed: 2026-08-16
draft: false
sidebar:
  order: 37
---

`client/v3` 把 KV、Watch、Lease、Cluster 和 Maintenance 组合成一个 gRPC 客户端，并通过 endpoint 管理、resolver 和重试处理成员切换。它提供的是访问一致性存储的客户端语义，不只是连接池。

<!-- more -->

## 客户端组成

```text
clientv3.New
  ├─ grpc conn / resolver
  ├─ KV client: Get / Put / Txn
  ├─ Watch client: long-lived stream
  ├─ Lease client: KeepAlive stream
  ├─ endpoint picker / retry
  └─ close all sub-clients
```

`Client` 和 `New` 位于 `client/v3/client.go:51-118`；KV、Watch、Lease facade 分别由 `client/v3/kv.go:143-151`、`watch.go:252-256`、`lease.go:199-203` 创建。

## 一致性读取

客户端的 `Get` 可以选择 serializable 或线性一致语义。线性一致读需要服务端通过 ReadIndex 确认 leader 的提交边界，并等待本节点应用到对应 index；serializable 读可以从任意成员本地读取，延迟更低但可能落后。

## endpoint 与长连接

Watch 和 KeepAlive 都是长连接流，普通 RPC 的一次性重试不能简单套用。客户端需要在 stream 断开、leader 切换和 endpoint 不可用时重建流，并通过 revision 或 lease ID 维持语义连续性。

## 为什么客户端不自行“补齐”事件

**替代方案**：Watch 断线后只重连，不重新读取当前状态。
**为什么不行**：断线窗口内可能漏掉事件，单纯重连只能保证之后的新事件。
**正确做法**：用最后已处理 revision 重新 Watch；若 revision 已 compact，则先读当前状态，再从新 revision 建立 Watch。

## 边界与踩坑

| 场景 | 风险 | 处理 |
| --- | --- | --- |
| serializable 读当强一致 | 读取旧值 | 需要明确 `Serializable=false` 的默认语义 |
| Watch 断线只重连 | 漏事件 | 记录 revision 并重建/全量同步 |
| 固定连接一个 endpoint | leader 切换不可用 | 配置多个 endpoint 和 resolver |
| KeepAlive 无 context | goroutine/stream 泄漏 | 关闭 client 或 cancel context |

## 可迁移知识

客户端库必须暴露一致性、重试和恢复语义；否则使用者只能看到“RPC 成功/失败”，无法知道数据是否新、事件是否完整。

> **面试锚点**
> - serializable read 和 linearizable read 的差异是什么？
> - Watch 断线如何避免丢事件？
> - endpoint picker 为什么不能只做 round-robin？

## Related

- [Raft 请求与应用](/notes/source/go/etcd/raft/)
- [Watch 事件流](/notes/source/go/etcd/watch/)
- [go-zero zrpc 服务治理](/notes/source/go/go-zero/zrpc/)
