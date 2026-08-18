---
title: ae 事件循环与单线程模型
description: ae 文件事件、时间事件和 beforeSleep 的调度边界。
category: Database
tags: [Source Reading, Redis, Event Loop]
order: 12
updatedDate: 2026-08-15
difficulty: advanced
status: stable
lastReviewed: 2026-08-15
draft: false
sidebar:
  order: 12
---

`ae` 是一个小而关键的抽象：底层 multiplexing 只负责“哪些 fd 就绪”，Redis 再把时间事件、任务队列和睡眠前处理拼成完整主循环。

<!-- more -->

## 主循环

```text
计算最近时间事件
       │
       ▼
 beforeSleep ──► poll/epoll_wait ──► 文件事件回调
       ▲                                  │
       └──────────── 时间事件回调 ◄────────┘
```

`aeCreateEventLoop` 在 `src/ae.c:47` 分配 loop；`aeCreateFileEvent` 在 `src/ae.c:145` 注册 fd；`aeCreateTimeEvent` 在 `src/ae.c:218` 注册定时任务。主循环 `aeMain` 位于 `src/ae.c:497`，每轮执行 `beforesleep`、等待就绪事件，再处理时间事件。

## 文件事件与时间事件

Redis 把平台差异放在 `ae_epoll.c`、`ae_kqueue.c` 等实现中，`ae.c` 只依赖统一的 `aeApiPoll`。事件回调通过 `connection` 层挂到客户端，读回调最终进入 `readQueryFromClient`，坐标为 `src/networking.c:3982`。时间事件的典型回调是 `serverCron`，由 `src/server.c:3211` 注册。

### 为什么不直接把所有任务塞进 epoll fd

**替代方案**：用 eventfd/pipe 唤醒 epoll，把定时器和普通任务都伪装成文件事件。
**为什么不行**：时间事件需要按最近到期时间计算等待上限，普通任务还需要在命令后稳定执行；全部 fd 化会增加唤醒、排队和优先级管理成本。
**证据**：`aeMain` 同时维护时间事件和文件事件，`aeCreateTimeEvent` 使用独立时间事件链，见 `src/ae.c:218`、`src/ae.c:497`。

## 单线程的真实边界

“单线程”主要指主数据路径：`processCommand` 在 `src/server.c:4477` 执行命令，`lookupKey` 在 `src/db.c:298` 访问数据库。后台持久化由 fork 子进程完成，慢 IO、释放和部分辅助工作还可能走 bio/后台线程，但这些线程不取得主数据结构的写所有权。

## beforeSleep 的调度价值

`beforeSleep` 位于 `src/server.c:1956`，会在下一次等待前处理客户端写出、复制输出、过期维护和延迟清理。它是一个天然批处理点：命令执行阶段只追加 reply，统一出口再决定写多少、是否继续 poll。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| 回调中长时间阻塞 | epoll 看似正常但请求全部排队 | 回调运行在主线程 | 禁止同步网络/磁盘慢操作 |
| 时间事件回调超时 | 定时器抖动 | 时间事件不是抢占式线程 | 控制单次工作量，使用分批扫描 |
| 读回调一次读入多条命令 | 一轮执行多个命令 | 输入缓冲会继续解析 | 关注客户端 pipeline 和单轮预算 |

## 可迁移知识

“事件就绪”和“业务处理”应分层；底层 poll 只报告事实，上层决定公平性和批量上限。统一 before/after hook 还能承载 flush、metrics 和 backpressure。

> **面试锚点**
> - `aeMain` 如何同时处理文件事件和时间事件？
> - Redis 单线程为什么仍能利用多核做持久化？
> - pipeline 为什么会放大单线程延迟？

## Related

- [整体架构](/notes/source/redis/redis/architecture/)
- [过期与内存淘汰](/notes/source/redis/redis/expiry-eviction/)
- [Netty Reactor 线程模型](/notes/source/java/base/netty/reactor-threading/)