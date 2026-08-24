---
title: Watch 事件流
description: etcd watchable store 的 watcher 分组、事件批处理、背压和 compact 边界。
category: Backend
tags: [Source Reading, etcd, Go, Watch]
order: 35
updatedDate: 2026-08-24
difficulty: advanced
status: stable
lastReviewed: 2026-08-24
draft: false
sidebar:
  order: 35
---

Watch 不是对 backend 的轮询，而是 MVCC 写事务提交后，将事件按 key 范围分发给长连接 watcher。etcd 为已追上当前 revision 的 watcher 和尚未追上的 watcher 分开管理。

<!-- more -->

## 先给答案：Watch 不是对 backend 的轮询，而是 MVCC 写事务提交后，将事件按 key 范围分发给长连…

Watch 不是对 backend 的轮询，而是 MVCC 写事务提交后，将事件按 key 范围分发给长连接 watcher。etcd 为已追上当前 revision 的 watcher 和尚未追上的 watcher 分开管理。 正文沿“watcher 状态 -> 事件产生路径 -> 背压与 victims”展开：先确认入口和状态归属，再跟踪控制流或数据流的推进，最后落到对外可观察的结果。

主要失效边界集中在“如果 watcher 的 start revision 已经 compact，服务端无法重放完整历史，会返回 compacted 错误”这些场景。它们破坏的是容量、顺序、并发或生命周期前提；排查时应先确认状态是否仍由正确对象持有，再核对推进条件和清理路径。

## watcher 状态

```text
create watch(startRev)
       |
       +--> unsynced: need replay historical events
       |       |
       |       +--> catch up to current rev
       |
       +--> synced: receive new event batches
                       |
                       +--> blocked channel -> victims
```

`watchableStore` 持有 `unsynced`、`synced`、`victims` 三类状态，并启动 `syncWatchersLoop` 与 `syncVictimsLoop`：`server/storage/mvcc/watchable_store.go:49-105`。watcher 的范围索引和批量结构在 `watcher_group.go:66-149`。

## 事件产生路径

写事务在 MVCC 中生成 event batch；watchable store 根据 key/end 范围匹配 watcher，再发送 `WatchResponse`。Lease revoke 使用 store 的 range deleter，因此租约删除的键也能产生正常 Delete 事件，而不是旁路消失。

## 背压与 victims

watch channel 可能因为客户端读取慢而阻塞。etcd 不在写事务线程中无限等待，而是把发送失败的 watcher batch 放入 victims，由后台循环重试。这样慢 watcher 的压力被隔离，不会直接把所有写请求拖死。

## compact 边界

如果 watcher 的 start revision 已经 compact，服务端无法重放完整历史，会返回 compacted 错误。客户端必须取消旧 watcher、读取当前状态并以新的 revision 重新建立 Watch；否则只重试同一个旧 revision 会形成永久失败循环。

## 为什么要区分 synced 和 unsynced

**替代方案**：所有 watcher 每次都从 backend 查询当前 revision，再统一发送。
**为什么不行**：已同步 watcher 不需要重复扫描历史；未同步 watcher 需要补历史，二者的工作量和正确性条件不同。
**取舍**：两组状态增加了调度复杂度，但能把历史追赶和实时分发拆开，避免慢 watcher 影响正常事件流。

## 边界与踩坑

| 场景 | 风险 | 处理 |
| --- | --- | --- |
| 客户端不消费 Watch channel | victims 堆积、资源增加 | 设置 context、监控 lag 和取消 watcher |
| 从 compact revision 建 watcher | 永远收不到完整历史 | 处理 compacted 并从新 revision 重建 |
| 只监听 Put | 删除事件漏掉 | 同时处理 Delete 和租约级联删除 |
| 把 Watch 当可靠队列 | 断线后事件语义错误 | 用 revision 续接或重新同步状态 |

## 可迁移知识

事件流系统必须显式建模追赶、实时、背压和重建四种状态；只维护一个发送 channel 通常无法同时保证吞吐和可恢复性。

> **面试锚点**
> - etcd Watch 如何避免轮询？
> - synced、unsynced、victims 分别解决什么问题？
> - Watch 遇到 compacted 后客户端应该怎么恢复？

## Related

- [MVCC 与 backend](/notes/source/go/etcd/mvcc/)
- [Lease 与 KeepAlive](/notes/source/go/etcd/lease/)
- [Redis 事件循环](/notes/source/redis/redis/event-loop/)
