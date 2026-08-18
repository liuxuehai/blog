---
title: Redisson
description: Redisson 源码解析：异步命令管线、分布式锁、看门狗续期、Lua 原子化、集合与限流器。
category: Backend
tags: [Source Reading, Redisson, Redis, Distributed Systems]
order: 4
updatedDate: 2026-08-16
difficulty: advanced
status: stable
lastReviewed: 2026-08-16
draft: false
sidebar:
  order: 4
---

Redisson 把 Redis 命令封装成带同步、异步、Reactive 和 Rx 入口的分布式对象 API。它的关键价值不只是“连接 Redis”，而是把锁、信号量、集合、限流器等并发语义编排成 Lua、Pub/Sub 和 Netty 异步执行链。

<!-- more -->

## 版本快照

| 项 | 值 |
| --- | --- |
| 仓库 | `redisson/redisson` |
| 本地路径 | `E:\source\java\storage\redisson` |
| 分支 | `master` |
| Commit | `4b55a16b9`（2026-08-13） |
| 最近 tag | `redisson-4.7.0` |

> 本册坐标均基于上述 commit，上游演进后行号可能漂移。

## 它解决什么问题

- 用统一对象 API 隐藏 Redis key、codec、命令类型和拓扑路由。
- 用 Lua 把“检查、修改、过期、通知”合并成 Redis 端原子操作。
- 用 Netty Future、Pub/Sub 和定时任务实现非阻塞等待与锁续期。

## 模块地图

| 模块 | 职责 | 关键类 |
| --- | --- | --- |
| `org.redisson` | 分布式对象门面 | `Redisson`、`RedissonLock`、`RedissonRateLimiter` |
| `command` | 命令、脚本、批处理执行 | `CommandAsyncExecutor`、`CommandAsyncService` |
| `connection` / `client` | Redis 拓扑、连接和协议 | `ConnectionManager`、`RedisClient` |
| `renewal` | 锁、Map 等过期续期 | `LockRenewalScheduler`、`RenewalTask` |
| `pubsub` | 等待者通知与订阅复用 | `LockPubSub`、`PublishSubscribeService` |

## 读码入口顺序

1. `Redisson#create` 与 `Redisson#getLock`：对象如何绑定同一个命令执行器。
2. `CommandAsyncService#evalWriteAsync`：对象方法如何落到脚本和连接。
3. `RedissonLock#tryLockInnerAsync`：锁状态如何编码成 Redis Hash。
4. `RedissonBaseLock#unlockAsync`：释放、异常和续期任务如何联动。
5. `RedissonRateLimiter#tryAcquireAsync`：滑动时间窗如何由 ZSET 和 Lua 完成。

## 本册目录

- [整体架构](/notes/source/java/storage/redisson/architecture/)
- [命令执行与异步管线](/notes/source/java/storage/redisson/command-pipeline/)
- [分布式锁与看门狗](/notes/source/java/storage/redisson/lock-watchdog/)
- [Lua 原子化与命令编排](/notes/source/java/storage/redisson/lua-atomicity/)
- [MultiLock 与 RedLock](/notes/source/java/storage/redisson/redlock/)
- [分布式对象](/notes/source/java/storage/redisson/distributed-objects/)
- [限流器](/notes/source/java/storage/redisson/rate-limiter/)
- [面试专题](/notes/source/java/storage/redisson/interview/)

## 横向对照

| 对象 | 对照点 |
| --- | --- |
| Spring Data Redis | 偏连接、序列化和数据访问；Redisson 增加并发对象语义 |
| Jedis | 同为 Redis 客户端；Redisson 更强调异步对象和脚本编排 |
| Redis 原生命令 | Redisson 将多条命令的状态转换收敛到 Lua 脚本 |

## Related

- [Spring Data Redis](/notes/source/java/spring/spring-data-redis/)
- [Redis 源码解析](/notes/source/redis/redis/)
- [Java 存储与 ORM](/notes/source/java/storage/)
