---
title: 分布式锁与看门狗
description: RedissonLock 的 Hash 锁模型、重入、Pub/Sub 等待、释放和 watchdog 续期。
category: Backend
tags: [Source Reading, Redisson, Distributed Lock]
order: 43
updatedDate: 2026-08-16
difficulty: advanced
status: stable
lastReviewed: 2026-08-16
draft: false
sidebar:
  order: 43
---

`RedissonLock` 用 Redis Hash 保存“客户端实例 + 线程”的重入次数，用 TTL 作为租约；未指定 lease time 时，再由 watchdog 周期性延长 TTL。

<!-- more -->

## 锁模型

```text
lock:{name} (Hash)
  field = {clientId}:{threadId}
  value = reentrant hold count
  TTL   = lease time / watchdog lease

waiter -> subscribe(lock channel)
       -> Lua retry
       -> unlock publishes notification
```

`RedissonBaseLock#getLockName` 位于 `RedissonBaseLock.java:72-75`；持有判断使用 `HEXISTS`，见 `:119-124`。锁入口 `Redisson#getLock` 位于 `Redisson.java:646-653`。

## 获取锁

`RedissonLock#tryLockInnerAsync` 位于 `RedissonLock.java:184-199`。Lua 先判断 key 不存在，或当前线程字段已存在；成功时 `HINCRBY`，再 `PEXPIRE`，返回 nil 表示成功。已有其他持有者时返回 `PTTL`，调用方据此决定等待多久。

阻塞等待不是忙轮询：`lock` 在首次失败后订阅 `LockPubSub`，然后按 TTL 或通知信号再次执行 Lua，见 `RedissonLock.java:87-129`。因此通知只是减少等待延迟，真正的所有权判断仍由 Redis 脚本完成。

## 看门狗续期

```text
acquire without leaseTime
  -> scheduleExpirationRenewal(threadId)
     -> LockRenewalScheduler.renewLock
        -> shared LockTask
           -> periodic Lua PEXPIRE
unlock / failure
  -> cancelExpirationRenewal
```

`RedissonLock` 在成功获取后调用 `scheduleExpirationRenewal`，见 `RedissonLock.java:146-177`；调度器在 `LockRenewalScheduler.java:48-56` 创建共享 `LockTask`。释放路径在 `RedissonBaseLock#unlockAsync0`，见 `RedissonBaseLock.java:156-177`。

## 为什么用 Hash 而不是 String

**替代方案**：String value 只存一个 owner token。
**为什么不行**：无法自然表达同一线程的重入次数，也无法区分同一 JVM 中不同线程的释放权限。
**证据**：脚本使用 `HINCRBY` 和字段 `getLockName(threadId)`；`getHoldCountAsync` 用 `HGET` 读取重入计数，见 `RedissonBaseLock.java:133-140`。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| 进程长时间暂停 | 锁可能过期后被他人获取 | watchdog 依赖客户端调度和网络 | 临界区设计为可重试，必要时使用 fencing token |
| 指定 lease time | 不再按默认 watchdog 续期 | 显式租约覆盖默认策略 | lease time 必须覆盖最坏执行时间 |
| 非持有线程 unlock | `IllegalMonitorStateException` | Hash field 不匹配 | 只由持有线程释放，或使用 force unlock 并承担风险 |
| 只依赖通知 | 竞争下仍可能误判成功 | Pub/Sub 不是所有权证明 | 每次唤醒都重新执行 Lua |

> **面试锚点**
> - Redisson 锁的 Redis 数据结构是什么？
> - watchdog 什么时候启动，什么时候取消？
> - 为什么通知后还必须重新抢锁？
> - lease time 和 watchdog 的关系是什么？

## Related

- [Lua 原子化与命令编排](/notes/source/java/storage/redisson/lua-atomicity/)
- [MultiLock 与 RedLock](/notes/source/java/storage/redisson/redlock/)
- [Redisson source index](/notes/source/java/storage/redisson/)
