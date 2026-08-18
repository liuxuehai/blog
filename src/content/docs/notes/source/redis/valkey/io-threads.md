---
title: IO Threads 队列与任务生命周期
description: Valkey IO worker 的 SPMC、SPSC、MPSC 队列和 tagged pointer 设计。
category: Database
tags:
  - Source Reading
  - Valkey
  - Concurrency
  - IO
order: 33
updatedDate: 2026-08-15
difficulty: advanced
status: stable
lastReviewed: 2026-08-15
draft: false
sidebar:
  order: 33
---

Valkey IO Threads 最值得读的不是“开几个线程”，而是任务如何在主线程与 worker 间流动。`io_threads.c` 用不同方向、不同竞争关系的队列组合出一个受控拓扑，使 worker 不需要为每个 client 争抢全局锁。

<!-- more -->

## 队列拓扑

```text
                         +----------------+
                         | shared SPMC    |
主线程 -- dispatch ----->| worker inbox   |----> worker 0
                         +----------------+       worker 1 ...

主线程 -- per-worker SPSC ----------------------> worker i
worker i -- shared MPSC outbox ------------------> 主线程
```

源码中的队列和 worker 初始化从 `src/io_threads.c:484` 附近开始；worker 主循环在 `src/io_threads.c:285`。共享 SPMC inbox 适合主线程发布、多个 worker 消费；每 worker 的 SPSC inbox 避免多个生产者同时写同一条私有队列；共享 MPSC outbox 允许多个 worker 汇报结果。

## 生命周期

```text
idle -> dispatch -> queued -> processing -> completed -> drained
  ^                                             |
  +------------- wake / sleep -----------------+
```

`ioThreadBeforeSleep` 位于 `src/io_threads.c:116`，`ioThreadAfterSleep` 位于 `src/io_threads.c:152`。worker 睡眠前会处理本地状态，唤醒后重新 drain 队列；主线程也需要在事件循环边界消费完成通知，否则结果会堆在 outbox 中。

## drain 与 tagged pointer

任务完成后并不一定立刻释放对象。`src/io_threads.c:84` 的 drain 逻辑负责把已完成工作从队列取出并回收；`src/io_threads.c:42`、`:46` 的 tagged pointer 利用指针对齐后的低位编码轻量状态，减少额外的包装对象和同步字段。

这种技巧的前提是：分配器返回的指针满足对齐约束，并且所有读取和写入都使用统一的掩码规则。它不是“指针天然可以塞标志位”。

## 读写分派

`src/io_threads.c:509` 的读路径和 `:550` 的写路径把 socket 操作交给 worker；响应处理集中在 `:895`。主线程负责决定“哪个 client 需要什么工作”，worker 负责执行可并行的系统调用，完成后再由主线程接回生命周期。

## 为什么不使用一个通用锁队列

一个 MPMC 队列看似简单，但每个方向的生产者/消费者数量不同，统一队列会引入不必要的 CAS、缓存争用和唤醒复杂度。按拓扑选择 SPMC/SPSC/MPSC，是把并发约束编码进数据结构，换取更少同步成本和更容易验证的所有权关系。

## 边界与坑

- worker 数量变化时，必须处理任务迁移、停止和队列 drain；不能只改线程数配置。
- outbox 未及时 drain 会表现为“IO worker 已完成但客户端迟迟收不到响应”。
- tagged pointer 在不同 ABI、调试工具和未对齐分配器下可能失效，应封装掩码操作并配套断言。

## 可迁移知识

先画出生产者和消费者数量，再选 SPSC、MPSC 或 SPMC；不要从“我需要一个队列”倒推数据结构。这个方法同样适用于日志流水线、线程池完成队列和异步 RPC。

> 面试锚点：为什么 Valkey 要混用三种队列？outbox 不 drain 会怎样？tagged pointer 的前提是什么？

## Related

- [总体架构](/notes/source/redis/valkey/architecture/)
- [后台工作边界](/notes/source/redis/valkey/background-work/)
- [Netty Pipeline 与 EventLoop](/notes/source/java/base/netty/architecture/)


