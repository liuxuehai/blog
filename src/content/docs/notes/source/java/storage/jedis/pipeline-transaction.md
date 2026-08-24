---
title: Pipeline 与事务
description: Jedis 如何批量写命令、集中读响应，并把 MULTI/EXEC 状态绑定到专用连接。
category: Backend
tags: [Source Reading, Jedis, Pipeline, Transaction]
order: 55
updatedDate: 2026-08-24
lastReviewed: 2026-08-24
sidebar:
  order: 55
---

Pipeline 解决网络往返，Transaction 解决 Redis 服务端的事务队列；两者都要求连接在整个批处理期间保持独占。

<!-- more -->

## 先给答案：Pipeline 解决网络往返，Transaction 解决 Redis 服务端的事务队列；两者都要求连接…

Pipeline 解决网络往返，Transaction 解决 Redis 服务端的事务队列；两者都要求连接在整个批处理期间保持独占。 理解Pipeline 与事务时，要先确认入口与状态归属，再跟踪控制流或数据流的推进顺序，最后落到对外可观察的结果。

主要失效边界集中在“Pipeline 未 sync、Pipeline 跨节点、事务异常未 discard”这些场景。它们破坏的是容量、顺序、并发或生命周期前提；排查时应先确认状态是否仍由正确对象持有，再核对推进条件和清理路径。

主要失效边界集中在“Pipeline 未 sync、Pipeline 跨节点、事务异常未 discard”这些场景。它们破坏的是容量、顺序、并发或生命周期前提；排查时应先确认状态是否仍由正确对象持有，再核对推进条件和清理路径。

```text
pipeline command 1 ─┐
pipeline command 2 ─┼─► write many ─► sync/read many ─► typed replies
pipeline command 3 ─┘

MULTI ─► queue commands ─► EXEC/WATCH state ─► replies
```

`AbstractPipeline` 维护待执行命令和响应，`PipeliningBase` 提供共用执行逻辑；`MultiNodePipelineBase` 再按节点维护连接：见 `AbstractPipeline.java:5-40`、`PipeliningBase.java:1-100`、`MultiNodePipelineBase.java:33-100`、`MultiNodePipelineBase.java:130-166`。

事务类继承 Pipelining 基础设施，但语义不同：命令不是立即执行，而是进入 Redis 的 MULTI 队列，最终由 EXEC 返回结果。`AbstractTransaction` 负责关闭时清理连接和未完成状态：见 `AbstractTransaction.java:6-80`、`Transaction.java:20-110`、`Jedis.java:350-410`。

连接独占由 Pipeline 的构造和关闭路径共同保证：`Pipeline.java:20-74` 创建执行上下文，`PipeliningBase.java:30-86` 保存连接，`AbstractPipeline#close` 在 `AbstractPipeline.java:5-26` 释放未读响应和连接资源。

## 为什么 Pipeline 不自动等于事务

**替代方案**：把批量发送直接定义为原子事务。
**为什么不行**：Pipeline 只减少网络往返，命令仍可能逐条执行；事务还涉及 Redis 的队列、WATCH 和 EXEC 语义。
**证据**：Pipeline 的核心是 send/sync，Transaction 明确发送 `MULTI`、队列命令和 `EXEC`。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| Pipeline 未 sync | 命令似乎没生效 | 只写未读，响应仍在输入流 | 显式 sync/close |
| Pipeline 跨节点 | 顺序或聚合异常 | Cluster 中 key 分布不同 | 使用 ClusterPipeline 并理解聚合策略 |
| 事务异常未 discard | 连接带脏事务状态 | MULTI 队列绑定连接 | 失败时 DISCARD 并关闭/归还 |

## 可迁移知识

批处理抽象必须把“提交边界”和“资源独占边界”一起定义，否则吞吐优化会破坏状态隔离。

> **面试锚点**
> - Pipeline 和 Redis 事务的区别是什么？
> - 为什么 Pipeline 需要 sync？
> - ClusterPipeline 如何处理不同节点的命令？

## Related

- [Jedis 连接池](/notes/source/java/storage/jedis/pooling/)
- [Redis 事务与复制](/notes/source/redis/redis/)
