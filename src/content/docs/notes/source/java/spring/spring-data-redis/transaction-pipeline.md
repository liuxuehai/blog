---
title: 事务与管道
description: RedisTemplate 如何绑定事务连接、执行 MULTI/EXEC，以及封装 pipeline。
category: Backend
tags: [Source Reading, Spring Data Redis, Transaction]
order: 77
updatedDate: 2026-08-19
difficulty: advanced
status: stable
lastReviewed: 2026-08-19
draft: false
sidebar:
  order: 77
---

Redis 事务和 pipeline 都要求多个命令共享连接，但两者语义不同：事务关注队列与原子提交，pipeline 关注批量往返。

<!-- more -->

## 先给答案：Pipeline 优化往返，事务定义提交边界，两者都不能替代业务一致性

Pipeline 把多条命令集中发送，减少网络往返；MULTI/EXEC 把命令排队并在 EXEC 时提交执行。Spring 的事务连接绑定保证同一线程中的命令进入同一事务上下文，但不会自动把数据库事务和 Redis 事务变成分布式事务。

事务中读取结果、序列化时机和异常处理都有特殊语义；Pipeline 中的返回值也可能延迟到批量执行。使用前要先确认目标是降低 RTT、保证 Redis 内部命令连续执行，还是需要跨资源一致性，三者不是同一个问题。


## 事务链路

```text
Spring transaction active
  -> RedisConnectionUtils.doGetConnection
     -> bind RedisConnectionHolder
     -> connection.multi()
     -> template commands are queued
  -> commit: connection.exec()
  -> rollback/unknown: connection.discard()
```

`RedisTemplate#setEnableTransactionSupport` 在 `core/RedisTemplate.java:220-232` 开启参与事务；执行时在 `:403-426` 把参数传给 `RedisConnectionUtils`。事务绑定逻辑位于 `core/RedisConnectionUtils.java:121-184`，非只读事务在 `:198-218` 注册同步并执行 `multi()`。

提交和回滚位于 `RedisConnectionUtils.java:401-425`：commit 执行 `exec`，rollback 或 unknown 执行 `discard`，最后解绑资源。

## Pipeline

`RedisTemplate#executePipelined(SessionCallback)` 位于 `core/RedisTemplate.java:447-482`，先绑定连接，再 `openPipeline`，执行 session，`closePipeline` 后用 serializer 转换混合结果。普通 callback 版本在 `:486-511`。

## 为什么事务连接要线程绑定

**替代方案**：事务中的每个命令重新取连接。
**为什么不行**：Redis 的 MULTI 队列是连接状态，换连接后命令不在同一事务里。
**证据**：`RedisConnectionUtils` 以 `TransactionSynchronizationManager` 绑定 `RedisConnectionHolder`，见 `:126-181`。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| 事务里读取结果 | 得到 null 或 queued | MULTI 阶段只入队 | 在 EXEC 后读取结果 |
| pipeline 误以为原子 | 部分命令已执行 | pipeline 只是批量发送 | 需要原子性时使用事务或 Lua |
| Cluster 跨槽事务 | CROSSSLOT | key 不在同一 hash slot | 使用 hash tag 或改模型 |

## 可迁移知识

连接绑定是“会话语义”的通用实现：数据库事务、MQ producer transaction、分布式锁都需要把一组操作固定到同一会话或资源 holder。

> **面试锚点**
> - pipeline 和 MULTI/EXEC 的区别？
> - 为什么 Redis 事务需要 ThreadLocal 资源绑定？
> - rollback 时为什么执行 DISCARD 而不是关闭连接即可？

## Related

- [RedisTemplate 调用链](/notes/source/java/spring/spring-data-redis/redis-template/)
- [连接抽象与工厂](/notes/source/java/spring/spring-data-redis/connection-factory/)
