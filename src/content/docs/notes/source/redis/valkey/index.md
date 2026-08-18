---
title: Valkey 源码解析
description: Redis 分叉后的兼容边界、多线程 IO、后台任务与源码阅读路线。
category: Database
tags:
  - Source Reading
  - Valkey
  - Redis
  - Concurrency
order: 3
updatedDate: 2026-08-15
difficulty: advanced
status: stable
lastReviewed: 2026-08-15
draft: false
sidebar:
  order: 3
---

Valkey 不是“把 Redis 改名后继续维护”的简单快照，而是从 Redis 7.2 兼容基线继续演进的独立服务端。本册只抓最值得对照阅读的部分：分叉如何保持兼容、主线程如何继续拥有数据状态，以及 IO 多线程究竟把什么工作移出了事件循环。

<!-- more -->

## 版本快照

- 源码：`E:\source\redis\valkey`
- 分支：`unstable`
- Commit：`8cd535ddb3dc80aceb154e6ef9dbe11d256e2209`（2026-08-13）
- 最近祖先 tag：`8.0.8`（仅作仓库快照参考）
- 兼容基线：`src/version.h` 保留 `REDIS_VERSION 7.2.4`，产品版本由 `VALKEY_VERSION` 表示

## 六页读码路线

1. [总体架构](/notes/source/redis/valkey/architecture/)
2. [分叉与兼容性](/notes/source/redis/valkey/fork-and-compatibility/)
3. [IO Threads 队列与任务生命周期](/notes/source/redis/valkey/io-threads/)
4. [后台工作边界](/notes/source/redis/valkey/background-work/)
5. [面试专题](/notes/source/redis/valkey/interview/)

## 模块地图

```text
server.c          主线程、命令执行、事件循环、cron
io_threads.c      socket read/write、poll、accept 的 IO worker
bio.c             后台 I/O、lazy free 等 BIO 任务
threads_mngr.c    线程创建、暂停、唤醒与生命周期管理
fork.c            RDB/AOF/Module 等 fork 子进程协作
version.h         Valkey 版本与 Redis 兼容基线
```

## 先建立一个判断

```text
网络字节流 / socket 状态       -> 可并行，交给 IO worker
命令解析后的数据结构 mutation   -> 主线程，保持单一所有权
文件 I/O、释放大对象             -> BIO 或 fork 子进程
```

因此 Valkey 的多线程不是“多线程执行 Redis 命令”。更准确的描述是：在不改变核心数据状态模型的前提下，扩大网络 IO 的吞吐窗口。

## 对照阅读

先读 [Redis 事件循环与单线程模型](/notes/source/redis/redis/event-loop/)，再看本册的 [IO Threads](./io-threads/)。与 [Netty](/notes/source/java/base/netty/) 对照时，重点不是都用了线程，而是比较“任务所有权”和“队列边界”放在哪里。

## Related

- [Redis 系索引](/notes/source/redis/)
- [Redis 源码解析](/notes/source/redis/redis/)
- [Netty 源码解析](/notes/source/java/base/netty/)
