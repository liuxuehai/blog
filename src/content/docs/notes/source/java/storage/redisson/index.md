---
title: Redisson
description: Redisson 源码解析：异步命令管线、分布式锁、看门狗续期、Lua 原子化、集合与限流器。
category: Backend
tags: [Source Reading, Redisson, Redis, Distributed Systems]
order: 4
updatedDate: 2026-08-20
difficulty: advanced
status: stable
lastReviewed: 2026-08-20
draft: false
sidebar:
  order: 4
---

Redisson 把 Redis 命令封装成带同步、异步、Reactive 和 Rx 入口的分布式对象 API。它的关键价值不只是“连接 Redis”，而是把锁、信号量、集合、限流器等并发语义编排成 Lua、Pub/Sub 和 Netty 异步执行链。

<!-- more -->

## 本册问题地图

Redisson 的重点是“Java 对象语义如何落到 Redis 原子操作上”：

1. **对象门面何时真正访问 Redis？** `RBucket`、`RMap` 等通常先构造客户端对象，真正的编码、命令发送和状态创建发生在调用方法时，因此对象存在不等于 Redis 中已有数据。
2. **一次命令经过哪些边界？** 参数编码、连接选择、写入命令、Future 完成、结果解码层层串联；超时可能发生在任一段，不能只看 Redis 是否收到命令。
3. **分布式锁为什么不只是写一个 key？** 必须同时管理 owner、租约、续期和释放条件；删除别人持有的锁比拿不到锁更危险。
4. **看门狗解决什么，不能解决什么？** 它延长客户端仍存活时的锁租约，却无法证明业务线程一定没有停顿，也无法消除网络分区和 Redis 故障。
5. **Lua 的价值在哪里？** 把“检查持有者—修改状态—返回结果”放进 Redis 单线程执行边界，避免多个客户端在中间观察到半完成状态。
6. **RedLock 是否等于更强一致？** 多节点加锁增加了故障假设和时钟/延迟约束，不能替代对业务幂等、 fencing token 和存储一致性的设计。

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
