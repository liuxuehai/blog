---
title: 调度器与工作窃取
description: Tokio current-thread 与 multi-thread 调度器的本地队列、全局队列、LIFO slot、工作窃取和协作预算。
category: Backend
tags: [Source Reading, Tokio, Rust, Scheduler]
order: 40
updatedDate: 2026-08-24
difficulty: advanced
status: stable
lastReviewed: 2026-08-24
draft: false
sidebar:
  order: 40
---

Tokio 调度的目标不是严格 FIFO，而是在低延迟、吞吐、公平性和跨线程协调成本之间取平衡。多线程调度器优先消费当前 worker 的热任务，必要时才访问全局队列或窃取其他 worker 的工作。

<!-- more -->

## 先给答案：Tokio 调度的目标不是严格 FIFO，而是在低延迟、吞吐、公平性和跨线程协调成本之间取平衡

Tokio 调度的目标不是严格 FIFO，而是在低延迟、吞吐、公平性和跨线程协调成本之间取平衡。多线程调度器优先消费当前 worker 的热任务，必要时才访问全局队列或窃取其他 worker 的工作。 正文沿“两类调度器 -> 多线程取任务顺序 -> LIFO slot”展开：先确认入口和状态归属，再跟踪控制流或数据流的推进，最后落到对外可观察的结果。

主要失效边界集中在“单次 poll 做大量 CPU 计算、假设严格 FIFO、远程大量 spawn”这些场景。它们破坏的是容量、顺序、并发或生命周期前提；排查时应先确认状态是否仍由正确对象持有，再核对推进条件和清理路径。

## 两类调度器

`CurrentThread` 定义于 `tokio/src/runtime/scheduler/current_thread/mod.rs:28-61`，核心状态 `Core` 位于 `current_thread/mod.rs:63-91`；任务循环从 `next_task`（`mod.rs:334-356`）到 `run_task`（`mod.rs:381-405`），无任务时进入 `park`（`mod.rs:407-458`）。

多线程入口 `MultiThread` 位于 `tokio/src/runtime/scheduler/multi_thread/mod.rs:52-78`。每个 `Worker` 对应一个可移动的 `Core`：`worker.rs:100-180`，其中保存本地 run queue、`lifo_slot`、tick、随机数和统计信息。

## 多线程取任务顺序

```text
Context::run                         worker.rs:575
  -> maintenance
  -> Core::next_task                 worker.rs:1088
       +-> 周期性优先 global queue
       +-> lifo_slot
       +-> local run queue
       +-> 从 inject queue 批量拉取
  -> Core::steal_work                worker.rs:1167
       +-> 随机起点遍历其他 worker
       +-> steal_into local queue
       +-> fallback global queue
  -> park / park_yield               worker.rs:836
```

`next_task` 每隔 `global_queue_interval` 优先检查全局队列，其他轮次先走本地热路径；从全局注入队列取任务时只拉一个批次，避免单个 worker 独占全部远程任务。

## LIFO slot

`lifo_slot` 定义于 `worker.rs:121`，本地调度新唤醒任务时由 `schedule_local`（`worker.rs:1385-1420`）优先放入该槽位。它优化“任务唤醒另一个很快返回的任务”这一类 ping-pong 链，减少队列操作和缓存失效。

风险是任务互相唤醒形成局部垄断，因此 Tokio 会限制连续 LIFO 执行，并在必要时把槽位任务转回普通队列；Builder 也提供禁用配置。

## 工作窃取与惊群控制

`steal_work` 只允许部分空闲 worker 同时进入 searching 状态：`worker.rs:1162-1203`。随机选择起点降低所有 worker 争抢同一 victim 的概率，窃取批次则把后续任务留在本地队列。

```text
remote spawn -> inject queue -> 唤醒 parked worker
local wake   -> lifo/local queue
local empty  -> searching -> steal -> global fallback -> park
```

park/unpark 的多线程实现位于 `runtime/scheduler/multi_thread/park.rs:70-177`，idle 状态和定向唤醒位于 `multi_thread/idle.rs:129-190`。

## Cooperative budget

即使所有 IO API 都是异步的，一个始终 Ready 的 Future 也可能不让出 worker。Tokio 在受支持的资源操作中消耗 cooperative budget，预算耗尽时主动返回 Pending；检查入口位于 `tokio/src/task/coop/mod.rs:371-394`。

它是协作式公平性，不是抢占式时间片：用户自己写的长循环如果不经过这些检查，仍能占满 worker。

## 关键取舍

| 方案 | 优点 | 代价 |
| --- | --- | --- |
| 单一全局队列 | 简单、天然共享 | 每次调度都争用共享状态 |
| 纯本地队列 | 热路径快 | 负载不均、远程提交困难 |
| 本地 + 注入 + 窃取 | 兼顾局部性与均衡 | 状态机和唤醒策略复杂 |

## 边界与踩坑

| 场景 | 风险 | 处理 |
| --- | --- | --- |
| 单次 poll 做大量 CPU 计算 | cooperative budget 无法自动抢占 | 分块、`yield_now` 或专用池 |
| 假设严格 FIFO | LIFO、批量拉取和窃取会改变顺序 | 不依赖任务执行先后表达业务语义 |
| 远程大量 spawn | inject queue 和唤醒成为热点 | 批量化上层工作、控制生产速率 |
| worker 数越多越快 | 窃取、缓存和同步成本上升 | 按 CPU 与负载压测配置 |

## 可迁移知识

高吞吐线程池通常把任务分为本地热路径和远程注入路径，并把负载均衡推迟到本地耗尽之后。公平性需要周期性全局检查和显式预算，不能只依赖队列类型。

> **面试锚点**
> - Tokio 为什么同时需要 local queue、global queue 和 LIFO slot？
> - work stealing 如何避免所有空闲线程同时争抢？
> - cooperative scheduling 为什么不是抢占式调度？

## Related

- [Task、RawTask 与 Waker](/notes/source/rust/tokio/task-waker/)
- [Runtime 构建与进入](/notes/source/rust/tokio/runtime/)
- [Netty Reactor 与线程模型](/notes/source/java/base/netty/reactor-threading/)

