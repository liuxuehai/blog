---
title: 整体架构
description: Redisson 对象门面、命令执行器、连接管理、Pub/Sub 与续期调度的分层和主流程。
category: Backend
tags: [Source Reading, Redisson, Architecture]
order: 41
updatedDate: 2026-08-16
difficulty: advanced
status: stable
lastReviewed: 2026-08-16
draft: false
sidebar:
  order: 41
---

Redisson 的主线可以概括成“对象方法生成 Redis 命令，命令执行器选择节点并解码结果，必要时再由 Pub/Sub 或定时任务驱动下一步”。

<!-- more -->

## 分层

```text
业务代码
  -> RedissonClient#getLock / getMap / getRateLimiter
     -> 分布式对象实现
        -> CommandAsyncExecutor
           -> codec + RedisCommand + Lua
              -> ConnectionManager / Netty channel
                 -> Redis Server
        -> Pub/Sub 等待或 Renewal Scheduler
```

| 层 | 核心抽象 | 作用 |
| --- | --- | --- |
| 门面层 | `Redisson` / `RedissonClient` | 按名字创建对象，复用命令执行器 |
| 对象层 | `RedissonLock`、`RedissonMap` | 表达分布式语义和 key 布局 |
| 执行层 | `CommandAsyncExecutor` | 路由、编码、发送、重试、Future |
| 协调层 | `LockPubSub`、`LockRenewalScheduler` | 等待通知与租约维护 |

## 创建与调用主流程

```text
Redisson.create(config)
  -> new Redisson(config)
     -> connectionManager + commandExecutor
业务调用 getLock("order")
  -> new RedissonLock(commandExecutor, "order")
     -> tryLockInnerAsync(...)
        -> evalWriteSyncedNoRetryAsync(...)
           -> Redis EVAL + result decoder
```

`Redisson#getLock` 位于 `redisson/src/main/java/org/redisson/Redisson.java:646-653`；`Redisson` 的初始化与对象工厂集中在同文件 `:70-140`。锁并不在创建时访问 Redis，真正的网络动作发生在对象方法调用时。

## 为什么对象是轻量门面

**替代方案**：每个 `RLock` 自己创建连接池和线程。
**为什么不行**：同一客户端的拓扑、连接池、订阅连接和定时器会被对象数量放大。
**证据**：`RedissonBaseLock` 只保存 `CommandAsyncExecutor`、对象名和 `LockRenewalScheduler`，见 `RedissonBaseLock.java:48-70`；对象工厂统一从 `Redisson` 注入执行器。

## 生命周期关系

对象本身几乎无状态；状态位于 Redis key、连接管理器和客户端调度器中。锁的持有者字段、续期任务和 Pub/Sub 订阅必须一起观察，否则只看 Hash 会误判“为什么等待者没有被唤醒”或“为什么 TTL 没有归零”。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| 创建大量对象 | Java 对象多但 Redis 无 key | 对象是 lazy 门面 | 关注实际命令和 key 生命周期 |
| 客户端关闭 | 后续 Future 失败 | 连接管理器和执行器已停止 | 统一管理 `RedissonClient` 生命周期 |
| 多节点集群 | 脚本报 CROSSSLOT | 多 key 不在同一 hash slot | 使用 hash tag 或选择支持多节点的实现 |

## 可迁移知识

将“业务对象 API”和“资源执行器”分离，可以让同步、异步和响应式 API 共享同一套协议实现；而把等待、续期和释放建模为独立协调器，能降低对象实现的状态复杂度。

> **面试锚点**
> - Redisson 对象为什么可以廉价创建？
> - 命令执行器承担哪些职责？
> - 为什么锁对象的本地状态不足以描述分布式锁？

## Related

- [命令执行与异步管线](/notes/source/java/storage/redisson/command-pipeline/)
- [分布式锁与看门狗](/notes/source/java/storage/redisson/lock-watchdog/)
