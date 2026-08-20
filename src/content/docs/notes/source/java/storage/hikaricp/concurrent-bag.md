---
title: ConcurrentBag 并发容器
description: ConcurrentBag 的线程本地优先、共享列表、等待线程通知和资源状态转换。
category: Backend
tags: [Source Reading, HikariCP, Concurrency]
order: 43
updatedDate: 2026-08-20
difficulty: advanced
status: stable
lastReviewed: 2026-08-20
draft: false
sidebar:
  order: 43
---

`ConcurrentBag` 是 HikariCP 性能设计的核心：优先从当前线程的本地缓存取资源，失败后扫描共享列表，再通过等待线程队列和监听器触发补充。

<!-- more -->

## 先给答案：ConcurrentBag 优先优化“熟悉连接”的快速路径

借用时先尝试线程本地缓存，再尝试共享可用项；如果没有资源，线程登记为等待者，连接归还时直接唤醒匹配的等待线程。这个设计把常见的低竞争路径做快，同时保留高峰期的等待机制，所以“无锁”并不是它的准确描述。

连接状态变化必须与池的关闭和驱逐并发协调。归还一个已被软驱逐的连接不能重新变成可用连接，否则池会把正在淘汰的资源再次发出去。

```text
borrow
  |
  +--> thread-local list
  |       |
  |       +--> state CAS NOT_IN_USE -> IN_USE
  |
  +--> shared list scan
  |
  +--> handoff queue / wait
              |
              +--> IBagStateListener -> add connection
```

## 数据结构与状态

- 类定义：`src/main/java/com/zaxxer/hikari/util/ConcurrentBag.java:64`。
- 条目接口和状态：`:105-116`。
- 构造与线程本地列表：`:139-148`。
- `borrow`：`:161-213`。
- `requite`：`:216-229`。
- `add`：`:244-258`。
- `remove`/保留逻辑：`:261` 附近。
- `close`：`:289`。
- `HikariPool` 创建 bag：`HikariPool.java:92`。

## 借用策略

本地列表减少共享读竞争；共享列表保证其他线程能看到资源；CAS 状态转换保证同一个 `PoolEntry` 不会被两个线程同时借出。没有可用资源时，线程进入 handoff 等待并受 timeout 约束。

## 归还策略

`requite` 将状态改回可用，并优先交给等待线程；没有等待者时放回线程本地列表或共享结构。归还不是简单 `queue.offer`，而是和等待线程、公平性及后续补充关联的状态转换。

## 为什么不用 BlockingQueue

**替代方案**：用一个公平阻塞队列保存全部连接。
**为什么不行**：每次借还都需要经过共享队列，无法利用“同一线程很可能再次使用资源”的局部性，也增加锁和调度开销。
**证据**：`ConcurrentBag.java:161-229` 同时存在 thread-local、共享列表、CAS 状态和 handoff 逻辑。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| 忘记 requite | 线程持续等待 | 条目停留在 IN_USE | 确保代理 close 最终执行 |
| borrow 超时 | 获取连接抛异常 | 所有条目被占用或创建不足 | 观察 pending 和 active 指标 |
| 条目重复 add | 状态异常 | 同一资源被多次注册 | 生命周期只允许一次加入 |
| 关闭中 borrow | 抛池关闭异常 | bag 已关闭 | 应用停止时先阻止新请求 |

## 可迁移知识

资源池的并发容器应同时优化局部性、状态安全和等待通知。单独替换成“更熟悉”的队列，通常会丢掉原实现的性能假设。

> **面试锚点**
> - `ConcurrentBag` 为什么需要线程本地列表？
> - CAS 状态如何避免重复借出？
> - 没有资源时谁负责触发新连接创建？

## Related

- [连接借还生命周期](/notes/source/java/storage/hikaricp/connection-lifecycle/)
- [整体架构](/notes/source/java/storage/hikaricp/architecture/)
- [Druid 连接池生命周期](/notes/source/java/storage/druid/connection-pool/)
