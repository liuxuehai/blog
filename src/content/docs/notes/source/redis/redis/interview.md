---
title: 面试专题
description: Redis 源码级高频题、高难追问和故障排查话术。
category: Database
tags: [Source Reading, Redis, Interview]
order: 19
updatedDate: 2026-08-15
difficulty: advanced
status: stable
lastReviewed: 2026-08-15
draft: false
sidebar:
  order: 19
---

本篇把 Redis 这册的源码证据压缩成面试回答路径：先讲机制，再讲取舍，最后落到当前 8.10 快照的实现坐标。

<!-- more -->

## 高频题

### 1. Redis 为什么快？

分层回答：

1. 主数据路径由单线程拥有，避免命令间锁竞争，入口是 `src/server.c:4477` 的 `processCommand`。
2. `aeMain` 将 IO、时间事件和任务调度集中处理，见 `src/ae.c:497`。
3. 对象按规模选择编码，`tryObjectEncodingEx` 位于 `src/object.c:939`。
4. 回复和复制在 `beforeSleep` 等批处理边界集中刷新，见 `src/server.c:1956`。

追问“单线程为什么不慢”：单线程避免了共享状态协调，但单条命令仍可能阻塞整个实例，所以需要识别大 key、慢命令和 fork COW 成本。

### 2. rehash 为什么不会长时间阻塞？

`dict` 保留两张哈希表，`rehashidx` 标记迁移边界；新写入进入新表，查找同时检查两表，访问和 `dictRehashMicroseconds` 按预算推进。证据是 `src/dict.h:165-168`、`src/dict.c:406`、`src/dict.c:449`。

### 3. RDB 和 AOF 怎么选？

RDB 是紧凑 checkpoint，恢复快、文件小，但丢失最近快照后的写入；AOF 记录写操作，数据安全和可审计性更强，但文件膨胀，需要 rewrite。当前实现通过 `rdbSaveRio`（`src/rdb.c:2027`）和 `rewriteAppendOnlyFile`（`src/aof.c:3117`）分别承担两条路径，multi-part manifest 由 `aofManifest` 管理。

### 4. PSYNC 如何避免每次全量同步？

主节点为复制流维护 replid 和连续 offset，并保留 backlog。副本用 replid + offset 请求恢复；若 offset 落在 backlog `[offset, offset + histlen]` 内，发送 `+CONTINUE`，否则 `+FULLRESYNC`。判断位于 `src/replication.c:1046-1074`。

### 5. 过期 key 为什么不立即删除？

立即精确删除会为每个 key 建定时器，内存和调度开销高。Redis 在读路径由 `expireIfNeeded` 保证语义，在周期任务中由 `activeExpireCycle` 抽样清理，再在内存超限时由 `performEvictions` 选择受害 key，坐标分别为 `src/db.c:3020`、`src/expire.c:287`、`src/evict.c:532`。

## 高难追问

### fork 会不会阻塞 Redis？

fork 本身需要复制页表，可能造成短暂抖动；之后父子进程通过 COW 共享未修改页面，写入越密集，复制出的脏页越多。因此需要同时看 fork latency、RSS、写入速率和重写进度，不能只看命令平均耗时。

### Redis 的“单线程”是否绝对？

不是。主命令执行和核心数据结构修改由主线程完成；持久化子进程、bio 线程、网络 IO 线程等可以并存，但它们不改变主线程对核心状态的所有权。回答时要区分“单线程命令模型”和“进程内没有其他线程”。

### backlog 太小如何定位？

看 `master_repl_offset`、`repl_backlog_first_byte_offset`、`repl_backlog_histlen`，判断副本断线区间是否已经被覆盖；若频繁 FULLRESYNC，按写入字节速率和允许断线时长重新估算 backlog。

## 故障排查表

| 现象 | 第一处源码/指标 | 判断 |
| --- | --- | --- |
| 延迟周期性升高 | `serverCron`、`activeExpireCycle`、fork latency | 后台预算或 COW 影响主线程 |
| 内存持续上涨 | AOF rewrite、客户端 output buffer、COW RSS | 区分逻辑数据、缓冲和 fork 副本 |
| 副本频繁全量同步 | PSYNC backlog 区间 | backlog 窗口不足或 replid 改变 |
| 热点 key 被淘汰 | `performEvictions` 和策略采样 | 策略与访问分布不匹配 |

## 面试锚点

> **面试锚点**
> - 能否画出 `readQueryFromClient` 到 `processCommand` 的调用链？
> - 能否解释双表 rehash 的读写不变量？
> - AOF manifest 如何解决 rewrite 期间增量写入的原子切换？
> - PSYNC 为什么既需要 replid 又需要 offset？
> - 过期、淘汰、删除在复制和 AOF 中有什么语义差异？

## Related

- [整体架构](/notes/source/redis/redis/architecture/)
- [渐进式 rehash](/notes/source/redis/redis/incremental-rehash/)
- [RDB 与 AOF 重写](/notes/source/redis/redis/persistence/)
- [主从复制与 PSYNC](/notes/source/redis/redis/replication/)