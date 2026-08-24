---
title: Runtime 构建与进入
description: Tokio Builder 如何组装调度器、驱动、阻塞池，并通过 Runtime 与 Handle 提供执行上下文。
category: Backend
tags: [Source Reading, Tokio, Rust, Runtime]
order: 20
updatedDate: 2026-08-24
difficulty: advanced
status: stable
lastReviewed: 2026-08-24
draft: false
sidebar:
  order: 20
---

`Runtime` 不是单纯的线程池。它同时拥有 async scheduler、IO/time driver 的句柄、阻塞任务池和进入运行时所需的上下文，因此构建参数会直接决定后续 API 是否可用以及任务在哪类线程执行。

<!-- more -->

## 先给答案：Runtime 不是单纯的线程池

Runtime 不是单纯的线程池。它同时拥有 async scheduler、IO/time driver 的句柄、阻塞任务池和进入运行时所需的上下文，因此构建参数会直接决定后续 API 是否可用以及任务在哪类线程执行。 正文沿“构建路径 -> Runtime、Handle 与 EnterGuard -> current-thread 与 multi-thread”展开：先确认入口和状态归属，再跟踪控制流或数据流的推进，最后落到对外可观察的结果。

主要失效边界集中在“current-thread 只 spawn 不 blockon、在 async worker 调用阻塞函数、未启用 time/IO”这些场景。它们破坏的是容量、顺序、并发或生命周期前提；排查时应先确认状态是否仍由正确对象持有，再核对推进条件和清理路径。

## 构建路径

```text
Builder::new_current_thread / new_multi_thread
  -> worker_threads / event_interval / global_queue_interval
  -> enable_io / enable_time / enable_all
  -> build
       +-> create_driver
       +-> create blocking pool
       +-> build current-thread or multi-thread scheduler
       +-> Runtime { scheduler, handle, blocking_pool }
```

`Builder` 定义于 `tokio/src/runtime/builder.rs:55-137`；两种入口在 `builder.rs:277-305`，`enable_all` 在 `builder.rs:396-409`。单线程与多线程的最终组装分别位于 `builder.rs:1722-1795`、`builder.rs:2125-2205`。

## Runtime、Handle 与 EnterGuard

`Runtime::new` 位于 `tokio/src/runtime/runtime.rs:179-187`，默认构建多线程 runtime 并启用全部 driver。`Runtime::spawn` 在 `runtime.rs:244-256`，实际委托内部 scheduler handle；`Runtime::block_on` 在 `runtime.rs:343-370`，先进入 runtime context，再由对应 scheduler 驱动根 Future。

```text
Runtime         拥有并负责关闭运行时资源
  |
  +-> Handle    可 Clone 的提交与上下文句柄
         |
         +-> enter() -> EnterGuard
         +-> spawn()
         +-> block_on() 仅驱动给定 Future，不能替代全部 driver 场景
```

进入上下文会让 `tokio::spawn`、`Sleep::new` 等通过线程局部状态找到当前 runtime。Guard 的栈式退出很重要：错误嵌套或忘记 drop 会污染后续上下文判断。

## current-thread 与 multi-thread

| 模式 | 执行位置 | 适用场景 | 关键限制 |
| --- | --- | --- | --- |
| current-thread | 调用 `block_on` 的线程 | 测试、轻量服务、受控嵌入 | 没有线程持续 block_on 时任务不会推进 |
| multi-thread | 固定 async worker 集合 | 网络服务、并发任务 | 阻塞任一 worker 都会损害调度容量 |

Runtime 的 scheduler 枚举在 `runtime.rs:122-133`；这层统一了公开 API，但两种 scheduler 的队列和驱动所有权并不相同。

## 关键取舍

**替代方案**：所有功能隐式全开，并把运行时做成全局单例。

**问题**：嵌入式或测试环境承担不需要的线程和驱动成本，多 runtime 隔离也变得困难。

**设计**：Builder 按 feature 和配置组装组件；Runtime 负责所有权，Handle 负责共享使用，EnterGuard 负责动态上下文。

## 边界与踩坑

| 场景 | 风险 | 处理 |
| --- | --- | --- |
| current-thread 只 spawn 不 block_on | 任务已入队但无人 poll | 保持事件循环持续驱动 |
| 在 async worker 调用阻塞函数 | 整个 worker 停止推进 | 使用 `spawn_blocking` 或专用线程池 |
| 未启用 time/IO | 创建计时器或网络资源时 panic | 使用 `enable_all` 或精确 enable |
| 在 runtime 内再次 `Runtime::block_on` | 嵌套进入可能 panic | 复用 async 调用链或 Handle 的合适入口 |

## 可迁移知识

运行时 API 最好区分“拥有资源的生命周期对象”和“可复制的操作句柄”。这能让关闭语义保持唯一，同时允许多个模块低成本提交任务。

> **面试锚点**
> - `Runtime` 和 `Handle` 为什么要拆开？
> - current-thread runtime 的任务何时真正执行？
> - `enable_all` 改变了什么，而不只是一个便利方法？

## Related

- [Tokio 整体架构](/notes/source/rust/tokio/architecture/)
- [调度器与工作窃取](/notes/source/rust/tokio/scheduler/)
- [阻塞、取消与关闭](/notes/source/rust/tokio/blocking-cancellation/)

