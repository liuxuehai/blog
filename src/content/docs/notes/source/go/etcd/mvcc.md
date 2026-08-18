---
title: MVCC 与 backend
description: etcd revision、tree index、事务、历史版本、backend 提交与 compact。
category: Backend
tags: [Source Reading, etcd, Go, MVCC]
order: 34
updatedDate: 2026-08-16
difficulty: advanced
status: stable
lastReviewed: 2026-08-16
draft: false
sidebar:
  order: 34
---

etcd 的 MVCC 把“同一个 key 的历史版本”和“整个集群的逻辑时间”统一起来。请求在状态机中按 revision 应用，索引负责从用户 key 找到对应的内部版本，再由 backend 批量提交。

<!-- more -->

## 数据路径

```text
Put / Txn
   |
   v
new revision + keyIndex
   |
   +--> backend batch tx: key -> revisioned value
   +--> event batch -> Watch
   +--> lease attachment
   |
   +--> Commit
```

`treeIndex.Range` 在 `server/storage/mvcc/index.go:162` 根据 key、目标 revision 和范围返回版本定位；事务读写实现位于 `kvstore_txn.go:31-73`、`:166-197`。backend 的批量事务在 `server/storage/backend/batch_tx.go:242-361` 提交。

## revision 语义

每次状态机写事务推进全局 revision；同一个事务内的多个操作共享事务 revision，但通过 sub revision 或事件顺序区分操作。读取可以指定历史 revision；超过 compact revision 的历史读取必须返回 compacted 错误，而不是静默返回当前值。

## key index 与 backend 分工

```text
user key --treeIndex--> Revision{main, sub}
                       |
                       +--> backend bucket stores value/meta
```

tree index 适合按用户 key 和 revision 查询历史，backend 负责持久化实际值、元数据和一致性索引。把全部查询索引直接放在 backend 中会让历史选择和 compact 逻辑更难隔离。

## compact

`store.Compact` 调度并执行索引和历史版本清理：`server/storage/mvcc/kvstore_compaction.go:28-272`；tree index 的清理入口为 `index.Compact`：`server/storage/mvcc/index.go:205`。compact 不是删除当前值，而是删除低于保留边界的历史版本，并更新 compact revision。

## backend commit 与读事务

backend 提供读事务和批量写事务，`ForceCommit` 可把缓冲写入落盘：`server/storage/backend/backend.go:49-77`、`:355-355`。MVCC 在一次状态机应用中聚合多个操作，再提交 backend，避免每个 key 都产生独立磁盘事务。

## 为什么使用 MVCC 而不是覆盖写

**替代方案**：key 只保存当前值，Watch 和历史读另建日志查询。
**为什么不行**：历史读取、事务快照和 compact 需要一致的版本坐标，旁路日志很容易与当前值脱节。
**取舍**：MVCC 消耗更多空间和索引维护成本，但让读一致性、Watch 起点和历史清理共享同一 revision 模型。

## 边界与踩坑

| 场景 | 现象 | 原因 | 处理 |
| --- | --- | --- | --- |
| 读 compact 前 revision | 返回历史数据失败 | 历史已被清理 | 从当前 revision 重新读取 |
| revision 当 wall clock | 跨集群时间理解错误 | revision 是逻辑序号 | 只用于同一状态机版本语义 |
| 单操作单 commit | 吞吐下降 | backend 事务过碎 | 在 apply 中批量聚合 |
| 只删除 backend 值 | index 残留 | 元数据和索引未同步 | 由 MVCC compact 统一清理 |

## 可迁移知识

MVCC 的价值不是“保存旧值”这么简单，而是用一个可比较的逻辑版本把读快照、事务、事件和垃圾回收串起来。

> **面试锚点**
> - etcd 的 revision 和 Raft index 为什么不是同一个概念？
> - tree index 与 backend 各自负责什么？
> - compact 为什么不能删除当前版本？

## Related

- [Watch 事件流](/notes/source/go/etcd/watch/)
- [WAL、快照与恢复](/notes/source/go/etcd/wal-snapshot/)
- [Redis 增量 rehash 与持久化](/notes/source/redis/redis/incremental-rehash/)
