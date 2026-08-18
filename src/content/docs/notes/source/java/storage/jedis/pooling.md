---
title: 连接池与资源管理
description: ConnectionFactory、Commons Pool 和 JedisPool 如何创建、验证、借还与销毁 Redis 连接。
category: Backend
tags: [Source Reading, Jedis, Pool]
order: 54
updatedDate: 2026-08-16
sidebar:
  order: 54
---

Jedis 的传统池化实现把连接对象生命周期委托给 Apache Commons Pool；Jedis 自己实现 `PooledObjectFactory`，负责连接级初始化、验证和销毁。

<!-- more -->

```text
borrowObject
   └─► ConnectionFactory#makeObject
        └─► Connection.Builder#build
             └─► initialize
returnObject ──► validate/passivate
                       └─► destroy on failure
```

## 工厂职责

`ConnectionFactory` 负责创建 `Connection`，并在 `activate/passivate/validate/destroy` 中处理池状态和连接状态：见 `ConnectionFactory.java:22-109`、`ConnectionFactory.java:112-190`、`ConnectionFactory.java:192-236`。

`ConnectionPool` 是面向连接的池；旧 `JedisPool` 则把连接包装为 Jedis API。两者都通过 `Pool` 统一 close 和 borrow/return：见 `ConnectionPool.java:13-75`、`Pool.java:24-60`、`JedisPool.java:19-40`、`JedisPool.java:430-500`。

## 验证策略

验证不能只看 Java 对象是否存在，还要确认 socket 和 Redis 状态可用。验证失败的对象应销毁而非继续回池，否则坏连接会在高峰期反复被借出：见 `ConnectionFactory.java:162-190`、`Connection.java:431-468`。

## 为什么不在每次命令后重置所有连接状态

**替代方案**：每条命令之后都执行全面 reset。
**为什么不行**：大量 reset 命令会增加往返成本，而且普通 Redis 命令并不改变所有连接状态。
**证据**：Jedis 把连接初始化放在创建/激活阶段，把事务、订阅和 blocking 等特殊使用场景交给独占资源管理。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| transaction 连接归还过早 | 后续命令落入事务 | MULTI 状态仍在连接上 | 事务对象完整执行后再 close |
| pub/sub 放回普通池 | 借到订阅态连接 | 连接协议状态已改变 | 订阅连接独立管理 |
| maxTotal 太小 | 请求排队 | Redis 命令耗时或阻塞命令占满池 | 分离池并设置超时 |

## 可迁移知识

池工厂是资源正确性的边界：创建、验证、钝化和销毁必须成对设计，不能只实现“对象生产”。

> **面试锚点**
> - `PooledObjectFactory` 的几个生命周期回调分别做什么？
> - 为什么坏连接要 destroy 而不是 return？
> - 事务连接能否和普通命令共享？

## Related

- [HikariCP 连接池并发控制](/notes/source/java/storage/hikaricp/concurrent-bag/)
- [Jedis 连接生命周期](/notes/source/java/storage/jedis/connection-lifecycle/)
