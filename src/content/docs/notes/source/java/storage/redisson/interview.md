---
title: 面试专题
description: Redisson 源码面试题：锁、watchdog、Lua、异步管线、RedLock 与限流器。
category: Backend
tags: [Source Reading, Redisson, Interview]
order: 48
updatedDate: 2026-08-24
difficulty: advanced
status: stable
lastReviewed: 2026-08-24
draft: false
sidebar:
  order: 48
---

<!-- more -->

## 先给答案：Redisson 源码面试题：锁、watchdog、Lua、异步管线、RedLock 与限流器

Redisson 源码面试题：锁、watchdog、Lua、异步管线、RedLock 与限流器。 正文沿“高频问题 -> 代码坐标速查”展开：先确认入口和状态归属，再跟踪控制流或数据流的推进，最后落到对外可观察的结果。

主要失效边界是 watchdog 续期线程停顿导致锁提前过期、Pub/Sub 唤醒后多个客户端重新竞争而非直接获得锁，以及跨主节点锁在故障切换时缺少 fencing token 保护。排查时要同时核对 Redis 中的锁值与 TTL、客户端线程标识、订阅重试状态和下游资源是否拒绝旧持有者。

## 高频问题

### 1. Redisson 锁如何支持重入？

Redis Hash 的 field 是客户端 ID 与线程 ID 的组合，value 是重入次数。相同 field 走 `HINCRBY`，非持有者只能看到 TTL 并等待。

### 2. watchdog 解决什么问题？

未指定固定 lease time 时，客户端通过 `LockRenewalScheduler` 注册共享续期任务，周期性刷新锁 TTL。它解决的是临界区执行时间未知，不解决进程暂停、网络分区和业务执行超过租约的问题。

### 3. Pub/Sub 是否保证抢锁成功？

不保证。通知只是唤醒等待者；唤醒后必须重新运行 Lua 获取脚本，所有权判断仍以 Redis 状态为准。

### 4. Lua 是否等于分布式事务？

不是。Lua 保证脚本在单个 Redis 执行边界内连续运行，但不提供跨 Redis、跨数据库或跨服务的提交协议。

### 5. RedLock 为什么常被要求配合 fencing token？

租约可能在客户端暂停期间过期，旧持有者恢复后仍可能继续写业务资源。fencing token 让资源服务按单调递增版本拒绝旧请求。

### 6. Redisson 为什么有同步和异步两套 API？

同步 API 本质上等待 `RFuture`；核心命令仍由同一执行器完成，因此 codec、路由、重试和 decoder 不需要复制。

### 7. 限流器为什么返回 delay？

Lua 根据最早过期的 permit 计算下一次可尝试时间，Java 侧用定时器等待后重试，避免线程阻塞和高频自旋。

## 代码坐标速查

| 主题 | 坐标 |
| --- | --- |
| 对象工厂 | `Redisson.java:419-447`, `:646-653` |
| 锁 Hash 与释放 | `RedissonBaseLock.java:119-177` |
| 锁 Lua 与等待 | `RedissonLock.java:87-199` |
| 续期调度 | `LockRenewalScheduler.java:48-80` |
| 脚本入口 | `CommandAsyncService.java:471-494` |
| 限流器脚本 | `RedissonRateLimiter.java:112-218` |

## Related

- [分布式锁与看门狗](/notes/source/java/storage/redisson/lock-watchdog/)
- [MultiLock 与 RedLock](/notes/source/java/storage/redisson/redlock/)
- [限流器](/notes/source/java/storage/redisson/rate-limiter/)
