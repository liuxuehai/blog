---
title: 主从复制与 PSYNC
description: replication ID、offset、backlog 如何实现全量和部分重同步。
category: Database
tags: [Source Reading, Redis, Replication]
order: 16
updatedDate: 2026-08-19
difficulty: advanced
status: stable
lastReviewed: 2026-08-19
draft: false
sidebar:
  order: 16
---

Redis 复制把主节点产生的写命令编号为连续 offset，并将近期字节保存在 replication backlog；副本断线重连时，只要请求区间仍在 backlog 内，就能避免重新发送完整快照。

<!-- more -->

## 先给答案：复制的核心不是“把命令发过去”，而是让副本知道自己缺哪一段历史

主节点通过 replication offset 描述复制流位置，副本通过 backlog 判断断线后能否从缺口继续增量同步；如果历史已经被覆盖，才退化为全量同步。offset 是连续字节流的位置，不是简单的命令编号，因此重连时必须同时匹配运行标识和复制历史。

全量同步包含快照传输与期间新增命令的补发，意味着副本即使收到快照，也不能立即忽略主节点在制作快照期间产生的写入。复制语义不是强一致事务提交：主节点响应、数据进入复制 backlog、副本真正应用之间仍存在可观察窗口。


## 复制数据流

```text
命令执行
   │
   ▼
replicationFeedSlaves
   ├─► replica reply buffer
   ├─► repl_backlog blocks + rax index
   └─► master_repl_offset += bytes
                         │
副本 PSYNC replid offset ─┘
       ├─ 区间可覆盖 ─► +CONTINUE + backlog
       └─ 否则 ───────► +FULLRESYNC + RDB
```

主节点向副本喂数据的入口是 `src/replication.c:652` 的 `replicationFeedSlaves`。backlog 创建在 `src/replication.c:266`，写入并推进 offset 的核心逻辑位于 `src/replication.c:509-597`。PSYNC 判断位于 `src/replication.c:1002` 之后，`+CONTINUE` 分支在 `src/replication.c:1059-1074`。

## backlog 与 offset

`server.master_repl_offset` 表示主复制流的当前位置；backlog 记录一段连续历史，其起点为 `repl_backlog->offset`，长度为 `histlen`。当前版本通过 `blocks_index` 维护块索引，见 `src/replication.c:270` 和 `src/replication.c:316-323`，避免从链表头逐字节扫描。

### 为什么不能只保存最后一个 offset

**替代方案**：副本只上报 offset，主节点发现不一致就重新发 RDB。
**为什么不行**：短暂网络抖动会频繁触发全量同步，造成网络、磁盘和 fork 压力；连续日志窗口可以把断线恢复降为增量。
**证据**：`master_repl_offset` 与 backlog 区间在 `src/replication.c:1046-1059` 共同决定是否允许 partial resync。

## 全量与部分同步

`syncCommand` 在 `src/replication.c:1208` 附近处理 `SYNC/PSYNC`。部分同步成功时发送 `+CONTINUE`，失败时发送 `+FULLRESYNC`，随后传输 RDB。副本在加载 RDB 时还需要保存复制信息，服务端启动恢复逻辑位于 `src/server.c:7815` 附近。

复制是异步的：主节点先执行并传播，副本稍后应用。因此读副本可能读到旧值；应用必须明确一致性要求，不能把“复制连接存在”当作“数据已同步”。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| 断线时间超过 backlog 窗口 | 退化为 FULLRESYNC | 旧 offset 已被淘汰 | 增大 backlog，按写入速率估算窗口 |
| 主节点重启更换 replid | 副本无法继续旧流 | 复制历史身份改变 | 保留 replid/offset 状态，观察启动恢复逻辑 |
| 副本输出缓冲堆积 | 主节点内存升高 | 慢副本消费不及 | 配置客户端输出上限并隔离慢副本 |
| 只读副本读到旧数据 | 业务出现短暂不一致 | 异步复制 | 关键读回主节点或等待 offset |

## 可迁移知识

连续 offset + 有限日志窗口是断点续传的通用模型。日志必须同时提供身份、位置和可覆盖区间，恢复协议先判断窗口，再选择增量或 checkpoint。

> **面试锚点**
> - PSYNC 如何判断能否部分同步？
> - replid、offset 和 backlog 各自解决什么问题？
> - 为什么 Redis 复制是异步的，读副本有什么风险？

## Related

- [RDB 与 AOF 重写](/notes/source/redis/redis/persistence/)
- [整体架构](/notes/source/redis/redis/architecture/)
- [XXL-JOB 分册](/notes/source/java/rpc/xxl-job/)：执行器与回调专题待补充
