---
title: Tokio
description: Tokio 源码解析总览：Runtime、Task/Waker、调度器、IO driver、时间轮、同步原语与阻塞任务。
category: Backend
tags: [Source Reading, Tokio, Rust, Async]
order: 1
updatedDate: 2026-08-22
difficulty: advanced
status: stable
lastReviewed: 2026-08-22
draft: false
sidebar:
  order: 1
---

Tokio 把 Rust 的惰性 `Future` 落实为可执行任务：Runtime 组装调度器与驱动，Task 保存 Future 和状态，Waker 把就绪任务重新入队，IO 与定时器驱动负责产生唤醒。本册沿着“构建运行时、spawn、poll、等待事件、wake、再次调度、关闭”的主线阅读源码。

<!-- more -->

## 本册问题地图

Tokio 要沿着“任务如何被唤醒、被调度、等待 IO，再被取消”来读：

1. **Runtime 负责什么？** 它把任务调度器、IO driver、计时器和阻塞线程池组合起来；Future 本身不会自动运行，必须被 executor 持续 poll。
2. **Waker 为什么是核心？** 资源未就绪时任务不能忙等，驱动在状态变化后通过 Waker 重新安排 poll；唤醒不是执行结果，只是“可以再试”。
3. **work-stealing 解决什么？** 让空闲 worker 从其他队列取得任务，提高并行度；但任务长时间阻塞或频繁跨线程仍会带来调度成本。
4. **取消意味着什么？** Rust 的 Future 取消通常是停止继续 poll 并释放状态，不等于底层系统调用已被远端撤销；资源清理必须依赖 Drop 和协议语义。
5. **同步原语为何需要 async 版本？** 阻塞 Mutex 或 sleep 会占住 executor worker，异步原语通过等待队列和 Waker 让线程去运行其他任务。

## 版本快照

| 项 | 值 |
| --- | --- |
| 仓库 | `tokio-rs/tokio` |
| 本地路径 | `E:\source\rust\tokio` |
| 分支 | `master` |
| Commit | `625954f3`（2026-08-11） |
| Tokio 主 crate | `1.53.1`，对应 tag `tokio-1.53.1` |
| Rust MSRV | `1.71` |

> 本册源码坐标均基于该 commit；多 crate 仓库的普通 `git describe` 可能命中 `tokio-stream` 等子 crate tag，不能代替 Tokio 主 crate 版本。

## 主调用链

```text
Builder -> Runtime
            |
            +-> spawn(Future) -> Task / RawTask
            |                       |
            |                    poll Future
            |                       |
            |                 Pending + Waker
            |                       |
            +-> scheduler <---------+
            |     local/global queue + work stealing
            |
            +-> IO driver / time driver -> readiness / expiration -> wake
            |
            +-> blocking pool / shutdown
```

## 本册目录

- [整体架构](/notes/source/rust/tokio/architecture/)：crate 边界、运行时数据面与驱动分层
- [Runtime 构建与进入](/notes/source/rust/tokio/runtime/)：Builder、Runtime、Handle、spawn 与 block_on
- [Task、RawTask 与 Waker](/notes/source/rust/tokio/task-waker/)：Future 存储、虚表、状态机和唤醒路径
- [调度器与工作窃取](/notes/source/rust/tokio/scheduler/)：current-thread、multi-thread、队列与 cooperative budget
- [IO Driver 与 Readiness](/notes/source/rust/tokio/io-driver/)：mio、Registration、ScheduledIo 与 readiness tick
- [定时器与时间轮](/notes/source/rust/tokio/timer/)：Sleep、TimerEntry、分层时间轮与 park deadline
- [同步原语与背压](/notes/source/rust/tokio/sync-primitives/)：Semaphore、Mutex、Notify、mpsc 与 watch
- [阻塞、取消与关闭](/notes/source/rust/tokio/blocking-cancellation/)：spawn_blocking、abort、JoinSet 和 shutdown
- [面试专题](/notes/source/rust/tokio/interview/)：源码级高频题与异步排障场景

## Related

- [Rust 源码解析](/notes/source/rust/)
- [Netty Reactor 与线程模型](/notes/source/java/base/netty/reactor-threading/)
- [grpc-go HTTP/2 Transport](/notes/source/go/grpc-go/http2-transport/)
