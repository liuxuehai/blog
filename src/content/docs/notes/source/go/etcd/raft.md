---
title: Raft 请求与应用
description: etcd Proposal、Ready、消息传输、提交 index 与状态机应用顺序。
category: Backend
tags: [Source Reading, etcd, Go, Raft]
order: 32
updatedDate: 2026-08-16
difficulty: advanced
status: stable
lastReviewed: 2026-08-16
draft: false
sidebar:
  order: 32
---

etcd 把 Raft 当作排序和复制层，把 KV 语义放在 apply 层。`raftNode` 的主循环负责把 Raft 的 `Ready` 拆成网络消息、磁盘写入和已提交 entry 三条路径。

<!-- more -->

## Ready 处理链

```text
client proposal
      |
      v
raft.Node -> Ready
      |
      +--> SoftState / ReadState
      +--> committed entries -> apply channel
      +--> messages -> rafthttp transport
      +--> snapshot -> SaveSnap / ApplySnapshot
      +--> HardState + entries -> WAL
      |
      +--> raft.Advance()
```

`newRaftNode` 位于 `server/etcdserver/raft.go:123-139`；启动循环从 `Ready()` 读取状态，先把 committed entries 送给 apply 层，再按快照、HardState、entries 的顺序持久化，并最终调用 `Advance`：`server/etcdserver/raft.go:174-335`。

## Proposal 与响应

业务请求不能在 follower 本地直接修改 MVCC。服务端将请求编码为 Raft entry，leader 复制到多数派并提交后，apply 层才执行事务并通过 wait map 唤醒原请求。这样响应结果对应的是已进入一致性日志的操作，而不是本地预写。

## ReadIndex

读请求不一定要写入 KV entry，但线性一致读仍需确认当前 leader 的提交位置。etcd 通过 Raft ReadIndex 和 applied index 等待机制确认本节点已追上安全位置，再访问 MVCC。单纯读取本地 backend 只能提供较弱的一致性语义。

## 配置变更为什么特殊

成员变更会影响投票与消息发送，follower 不能在尚未应用配置 entry 时继续按旧成员集合推进。源码在 `raft.go` 中对 conf change 设置额外通知，并等待 apply 层完成：`server/etcdserver/raft.go:250-335`。

## 为什么先把 committed entries 交给 apply

**替代方案**：先完整写盘、发完网络消息，再通知状态机应用。
**取舍**：etcd 让 apply 层和 leader 的部分复制并行，降低延迟；但 snapshot 和 WAL 仍有严格顺序，必须保证恢复时不会出现日志已截断而快照未落盘的窗口。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| entry 已提交但未应用 | 读不到刚写数据 | applied index 落后 | 等待 apply/read-index |
| 只看 leader 本地结果 | follower 数据不一致 | 没有多数派确认 | 以 committed entry 为边界 |
| 配置变更立即发送消息 | 旧成员仍参与投票 | conf change 尚未应用 | 等待 apply 通知 |
| 忽略 Advance | Ready 重复或内存积压 | 未告知 Raft 已处理 | 完成持久化和应用后 Advance |

## 可迁移知识

复制状态机的工程实现通常要把“共识已决定”和“本地已执行”分开建模，才能同时处理高吞吐、故障恢复和请求响应关联。

> **面试锚点**
> - etcd 为什么不能直接在 leader 本地执行 Put？
> - `Ready` 中 snapshot、entries、messages 的处理顺序有什么约束？
> - ReadIndex 和写入一条空 entry 的区别是什么？

## Related

- [WAL、快照与恢复](/notes/source/go/etcd/wal-snapshot/)
- [MVCC 与 backend](/notes/source/go/etcd/mvcc/)
- [一致性读取与客户端](/notes/source/go/etcd/client/)
