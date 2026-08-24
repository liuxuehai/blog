---
title: WAL、快照与恢复
description: etcd WAL、Raft snapshot、日志截断、fsync 顺序和启动恢复链路。
category: Backend
tags: [Source Reading, etcd, Go, WAL, Snapshot]
order: 33
updatedDate: 2026-08-24
difficulty: advanced
status: stable
lastReviewed: 2026-08-24
draft: false
sidebar:
  order: 33
---

etcd 的持久化不是“把 KV 写进一个文件”，而是用 WAL 保存 Raft 元数据和 entries，用 snapshot 降低恢复成本，再用 backend 保存已应用的 MVCC 状态。

<!-- more -->

## 先给答案：etcd 的持久化不是“把 KV 写进一个文件”，而是用 WAL 保存 Raft 元数据和 entries…

etcd 的持久化不是“把 KV 写进一个文件”，而是用 WAL 保存 Raft 元数据和 entries，用 snapshot 降低恢复成本，再用 backend 保存已应用的 MVCC 状态。 正文沿“持久化关系 -> 为什么 snapshot 要先于普通日志释放 -> 快照不是 backend 备份的同义词”展开：先确认入口和状态归属，再跟踪控制流或数据流的推进，最后落到对外可观察的结果。

主要失效边界集中在“禁用 fsync、手工删除 WAL、只备份 backend.db”这些场景。它们破坏的是容量、顺序、并发或生命周期前提；排查时应先确认状态是否仍由正确对象持有，再核对推进条件和清理路径。

## 持久化关系

```text
Raft Ready
  |
  +--> snapshot -> snapshot file -> ApplySnapshot
  +--> HardState + entries -> WAL segments -> fsync
  +--> backend -> MVCC state / consistent index

restart:
snapshot + WAL + backend -> reconstruct raft storage -> replay committed entries
```

`WAL` 类型和创建/打开入口在 `server/storage/wal/wal.go:73-101`、`:346-359`。启动时 `bootstrap.go` 判断 WAL 是否存在，从 snapshot/backend 恢复，再创建 Raft storage：`server/etcdserver/bootstrap.go:77-128`。

## 为什么 snapshot 要先于普通日志释放

`raftNode.start` 在收到 snapshot 后先 `SaveSnap`，再保存 HardState 和 entries；随后 `Sync`，应用 Raft snapshot，最后 `Release` WAL 旧段：`server/etcdserver/raft.go:250-320`。如果先释放旧 WAL 而快照尚未可靠落盘，重启时可能既找不到旧日志，也没有可恢复的新快照。

## 快照不是 backend 备份的同义词

Raft snapshot 描述的是某个一致性 index 的状态机快照及成员配置；backend 是本地 MVCC/Bbolt 存储。etcd 在恢复和应用快照时需要协调两者的 index、版本和 schema，不能只复制某个 `.db` 文件就认为集群状态完整。

## 日志截断与恢复

当 Raft snapshot 持久化后，旧 WAL 段可以释放；新节点启动时从 snapshot index 之后的 WAL entries 继续构造 Raft log。backend 中的 consistent index 用于判断状态机已经应用到哪里，避免重复或跳过 entry。

## 为什么恢复路径要区分“有 WAL”和“无 WAL”

**替代方案**：每次启动都把所有目录当作全新节点或都强行重放。
**为什么不行**：新集群需要初始化成员和空状态，已有成员则必须校验并恢复既有 term/index/cluster 信息；错误混用会造成成员身份或日志分叉。
**证据**：`bootstrap` 根据 `wal.Exist(cfg.WALDir())` 选择恢复 backend、WAL 和 snapshot 的路径：`server/etcdserver/bootstrap.go:77-121`。

## 边界与踩坑

| 场景 | 风险 | 处理 |
| --- | --- | --- |
| 禁用 fsync | 进程崩溃后 WAL 尾部丢失 | 仅在明确接受数据风险时使用 |
| 手工删除 WAL | 节点无法沿原日志恢复 | 使用 snapshot/restore 工具链 |
| 只备份 backend.db | 缺少 Raft term/index/成员信息 | 同时考虑 WAL 和 snapshot |
| 快照释放顺序错误 | 恢复出现 out-of-range | 遵循 SaveSnap -> Sync -> Apply -> Release |

## 可迁移知识

日志、快照和状态机存储各自回答不同问题：日志回答“发生了什么”，快照回答“某个位置的完整状态”，状态库回答“当前可查询数据是什么”。

> **面试锚点**
> - WAL 和 snapshot 如何配合减少恢复时间？
> - 为什么 snapshot 落盘后还要 Sync？
> - backend、WAL、Raft snapshot 三者如何避免 index 不一致？

## Related

- [Raft 请求与应用](/notes/source/go/etcd/raft/)
- [MVCC 与 backend](/notes/source/go/etcd/mvcc/)
- [ZooKeeper 日志与快照](/notes/source/java/base/zookeeper/)
