---
title: Reactor 线程模型
description: Netty 4.2 的 EventLoop 线程归属、I/O 与任务调度、Selector 注册和背压边界。
category: Backend
tags: [Source Reading, Netty, Reactor, Concurrency]
order: 22
updatedDate: 2026-08-15
difficulty: advanced
status: stable
lastReviewed: 2026-08-15
draft: false
sidebar:
  order: 22
---

Netty 的“主从 Reactor”只是部署形态，真正保证低锁开销的是更细的规则：一个 Channel 注册到一个 EventLoop，Channel 的状态变化和 Handler 回调尽量在这个 EventLoop 上串行执行。

<!-- more -->

## 结构

```text
boss EventLoopGroup
  └─ ServerChannel: accept
       │ next()
       ▼
worker EventLoopGroup
  ├─ EventLoop-0: ch1, ch4, ch7
  ├─ EventLoop-1: ch2, ch5
  └─ EventLoop-2: ch3, ch6
```

`MultithreadEventLoopGroup#register` 直接选择 `next()` 并委托给目标 EventLoop，坐标为 `transport/src/main/java/io/netty/channel/MultithreadEventLoopGroup.java:85-97`。选择发生在连接注册时，后续不会为同一个 Channel 反复挑线程。

## EventLoop 主循环

`SingleThreadIoEventLoop#run` 的顺序是：初始化 I/O handler，执行 `runIo()`，必要时准备销毁，再在最大时间片内执行普通任务，最后检查关闭或挂起，坐标为 `transport/src/main/java/io/netty/channel/SingleThreadIoEventLoop.java:192-205`。

```text
initialize
   │
   ▼
runIo() ──────┐
   │          │
   ▼          │
runAllTasks(quantum)
   │          │
   └── repeat ┘
```

这里没有采用“先把任务全部跑完再处理 I/O”的简单循环，因为任务队列可能被业务代码持续填满。`maxTaskProcessingQuantumNs` 是一种公平性边界：普通任务获得有限预算后，线程重新观察 I/O。

## 注册如何跨线程回到 EventLoop

`SingleThreadIoEventLoop#register(IoHandle)` 在当前线程是 EventLoop 时直接注册，否则调用 `execute(() -> registerForIo0(...))`，坐标为 `SingleThreadIoEventLoop.java:234-260`。底层 NIO 注册最终由 `NioIoHandler.DefaultNioRegistration` 调用 `SelectableChannel.register`，坐标为 `transport/.../NioIoHandler.java:318-337`。

这解决了 Java NIO 的线程约束：Selector、SelectionKey 和 Channel 的兴趣集合更新不需要暴露给业务线程。

## 为什么不是每个连接一个线程

替代方案是 thread-per-connection。它在连接数小、Handler 阻塞时简单，但线程栈、上下文切换和调度成本会随连接数增长。Netty 让一个 EventLoop 负责多个 Channel，把“连接状态”变成事件串行化问题。

代价是 Handler 必须短小且非阻塞。如果业务确实需要阻塞，应该把任务投递到独立 executor；否则吞吐下降不是 Selector 的问题，而是 EventLoop 被业务占住。

## 线程模型的边界

| 场景 | 行为 | 风险 |
| --- | --- | --- |
| 同一 EventLoop 内调用 `ctx.fireChannelRead` | 直接调用下一个 Handler | 低开销，但可能递归过深 |
| 不同 executor 的 Handler | `executor.execute` 异步切换 | 有排队和顺序成本 |
| 外部线程调用 `write` | 创建 `WriteTask` 投递 | 安全，但突发写会堆积 |
| EventLoop 任务持续增长 | I/O 仍按量子回访 | 业务延迟仍可能升高 |

## 可迁移知识

这是“单写者原则”的网络版：将共享状态收敛到一个执行上下文，跨线程只传递任务。它适合状态机、分片缓存、Actor 和数据库连接会话；不适合需要长期阻塞或 CPU 密集计算的工作。

> 面试锚点：一个 EventLoop 能否同时处理多个 Channel？外部线程 write 是否安全？答案都必须落到注册和 `WriteTask` 的源码路径。

## Related

- [整体架构](/notes/source/java/base/netty/architecture/)
- [Pipeline 与 Handler 责任链](/notes/source/java/base/netty/pipeline-handler/)
- [时间轮与 IdleStateHandler](/notes/source/java/base/netty/timer-idle/)
