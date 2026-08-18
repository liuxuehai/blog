---
title: 总体架构
description: Valkey 主线程、IO worker、BIO 与 fork 子进程的分层和请求路径。
category: Database
tags:
  - Source Reading
  - Valkey
  - Event Loop
order: 31
updatedDate: 2026-08-15
difficulty: advanced
status: stable
lastReviewed: 2026-08-15
draft: false
sidebar:
  order: 31
---

Valkey 的架构核心是“数据状态单线程化，外围工作并行化”。读码时要把 IO worker、BIO 和 fork child 分成三种不同的并发模型，不能笼统称作后台线程。

<!-- more -->

## 分层图

```text
                    +----------------------+
                    |      主线程          |
                    | ae event loop        |
                    | command + data state |
                    +----+------------+----+
                         |            |
                 IO inbox/outbox     BIO queues
                         |            |
              +----------v--+     +---v--------+
              | IO workers  |     | BIO threads |
              | read/write  |     | fs/free     |
              +-------------+     +------------+
                         |
                    fork child
                 RDB/AOF/Module
```

## 启动主流程

`src/server.c:7558` 的主入口完成配置解析、服务初始化和事件循环进入；`initServer` 位于 `src/server.c:2959`，负责监听 socket、事件注册以及线程相关初始化。IO 线程在 `src/io_threads.c:484` 附近创建并启动，BIO 在 `src/bio.c:155` 初始化。

```text
main
 └─ initServer
     ├─ create listening/client events
     ├─ initIOThreads
     ├─ bioInit
     └─ aeMain
         └─ beforeSleep / aeProcessEvents / afterSleep
```

## 请求主流程

```text
socket readable
   -> IO worker read / poll
   -> shared inbox / client state
   -> 主线程解析命令
   -> 数据结构 mutation
   -> response 入 outbox
   -> IO worker write
```

`src/server.c:7890` 进入 `aeMain` 后，事件循环按 sleep 前、事件处理、sleep 后的边界推进；IO worker 的睡眠前后钩子分别在 `src/io_threads.c:116` 与 `src/io_threads.c:152`。这意味着线程调度不是独立于事件循环的另一套业务循环，而是围绕主循环协作。

## 为什么不把命令执行也并行化

如果多个 worker 直接修改 dict、quicklist、zset 等共享对象，就必须为每条命令引入锁、事务边界或分片所有权。那会把 Redis 原本容易推理的顺序语义，换成锁竞争、锁顺序和可见性问题。Valkey 选择保留主线程的数据所有权，把收益集中在 socket read/write 和 poll 上。

## 边界与坑

- IO worker 加速的是网络路径；CPU 很重的 Lua、模块命令和大范围 key 扫描仍会阻塞主线程。
- `fork` 子进程不是线程，复制的是进程地址空间，写时复制带来额外内存压力。
- BIO 的“异步”只表示调用线程不等待，任务仍可能因队列积压延迟完成。

## 可迁移知识

这是“单一所有权 + 外围流水线”的通用模式：把必须顺序化的状态留在一个 owner，把可分段的输入输出搬到 worker。它适合事件循环服务器、日志代理和协议网关，但不适合天然需要跨分片原子 mutation 的工作负载。

> 面试锚点：Valkey 的多线程到底并行了什么？为什么命令执行仍在主线程？BIO 和 fork child 有何区别？

## Related

- [IO Threads 队列与任务生命周期](/notes/source/redis/valkey/io-threads/)
- [后台工作边界](/notes/source/redis/valkey/background-work/)
- [Redis 事件循环](/notes/source/redis/redis/event-loop/)


