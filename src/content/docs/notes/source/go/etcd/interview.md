---
title: 面试专题
description: etcd 高频面试题、高难追问和源码级故障排查路径。
category: Backend
tags: [Source Reading, etcd, Go, Interview]
order: 39
updatedDate: 2026-08-24
difficulty: advanced
status: stable
lastReviewed: 2026-08-24
draft: false
sidebar:
  order: 39
---

etcd 面试的关键不是只回答“使用 Raft”，而是说明 Raft index、apply、MVCC revision、WAL、Watch 和 Lease 如何在同一状态机边界内协作。

<!-- more -->

## 先给答案：etcd 面试的关键不是只回答“使用 Raft”，而是说明 Raft index、apply、MVCC r…

etcd 面试的关键不是只回答“使用 Raft”，而是说明 Raft index、apply、MVCC revision、WAL、Watch 和 Lease 如何在同一状态机边界内协作。 正文沿“高频题 -> 高难追问 -> 场景题”展开：先确认入口和状态归属，再跟踪控制流或数据流的推进，最后落到对外可观察的结果。

主要失效边界集中在“Watch 延迟持续升高，怎么排查、集群重启后成员无法加入，怎么排查、Lease 过期后键没有删除，怎么排查”这些场景。它们破坏的是容量、顺序、并发或生命周期前提；排查时应先确认状态是否仍由正确对象持有，再核对推进条件和清理路径。

## 高频题

### etcd 的 Put 如何保证一致性？

**30 秒版**：请求被编码为 proposal 交给 Raft，leader 复制到多数派并提交；`raftNode` 从 `Ready.CommittedEntries` 交给 apply 层，MVCC 事务更新 backend 后才返回结果。

**加分项**：要区分 committed index、applied index 和 MVCC revision；前两者来自 Raft，后者来自 KV 状态机。

### WAL 和 snapshot 如何配合？

WAL 保存 HardState 和 entries，snapshot 保存某个 index 的状态机状态。恢复时先加载 snapshot，再重放其后的 WAL。snapshot 落盘并 Sync 后才能释放旧 WAL，源码坐标是 `server/etcdserver/raft.go:250-320`。

### Watch 为什么会遇到 compacted？

Watch 需要从 start revision 补历史；如果该 revision 已被 compact，服务端无法重建完整事件序列。客户端必须全量读取当前状态，再从新 revision 建 Watch，而不是无限重试旧 revision。

### Lease 为什么只有 leader 负责过期？

本地时钟只负责发现到期，leader 才能把 revoke 提交到 Raft，避免多个节点独立删除同一批 key。Revoke 会排序 key，并将 key 删除与 lease 元数据删除放在同一事务中。

## 高难追问

### etcd 为什么不用本地 timer 直接删临时 key？

因为时间到期不是一致性事实。不同节点的调度和时钟会不同，直接删除会产生状态和事件分叉；timer 只能触发一致性提案。

### `Ready` 的处理顺序为什么重要？

snapshot 必须先保存并同步，再应用和释放旧 WAL；committed entries 要交给 apply；全部处理完成后调用 `Advance`。顺序错了会导致恢复时日志范围不连续，或状态机应用进度与 Raft 不一致。

### MVCC revision 为什么不等于 Raft index？

一个 Raft entry 可能是成员变更、租约操作或内部请求，不一定推进 KV revision；一个事务也可能包含多个 KV 操作。Raft index 是复制日志位置，revision 是 KV 逻辑版本。

## 场景题

### Watch 延迟持续升高，怎么排查？

先看客户端是否消费 channel；再检查 watcher 是否卡在 victims、是否存在大量 unsynced watcher；然后看 compact、backend commit 和 apply index 是否落后。若慢 watcher 阻塞发送，应取消并重建，而不是无限增加缓冲。

### 集群重启后成员无法加入，怎么排查？

检查 data dir 中 WAL、snapshot 和 backend 是否来自同一节点快照；确认 cluster/member ID、term/index 和初始集群配置；再看是否误删 WAL 或使用了不匹配的 `initial-cluster-state`。

### Lease 过期后键没有删除，怎么排查？

检查当前节点是否 primary、lease 是否仍在 lessor map、过期队列是否推进、revoke proposal 是否提交，以及 range deleter 是否在同一事务中执行。最后检查客户端是否把事件 revision 当作 wall clock。

## 一句话总结

etcd 的可靠性来自单一状态机边界：Raft 决定顺序，WAL 保证可恢复，MVCC 定义版本，Watch 观察已应用事件，Lease 通过提案改变共享状态。

## Related

- [etcd 总览](/notes/source/go/etcd/)
- [整体架构](/notes/source/go/etcd/architecture/)
- [MVCC 与 backend](/notes/source/go/etcd/mvcc/)
