---
title: 连接抽象与工厂
description: RedisConnectionFactory 如何隔离 Lettuce、Jedis、连接池、Sentinel 与 Cluster。
category: Backend
tags: [Source Reading, Spring Data Redis, Connection]
order: 72
updatedDate: 2026-08-19
difficulty: advanced
status: stable
lastReviewed: 2026-08-19
draft: false
sidebar:
  order: 72
---

连接工厂不是简单的对象工厂，而是驱动客户端、拓扑资源和 Spring 生命周期之间的边界。

<!-- more -->

## 先给答案：ConnectionFactory 把连接生命周期从业务代码中收口

业务不应该每次命令都手动创建、选择、关闭连接；ConnectionFactory 根据客户端实现提供连接、共享连接、连接池和事务绑定。Lettuce 与 Jedis 的线程模型不同，但上层通过统一接口暴露连接操作。

“拿到连接”也不等于“可以在任何线程和模式下使用”。订阅连接、事务连接和普通命令连接有不同约束；排查连接泄漏或命令错乱时要看连接来源、是否绑定线程/事务以及释放路径。


## 设计概览

```text
RedisConnectionFactory
  + getConnection()
  + getClusterConnection()
  + getSentinelConnection()
          |
   +------+----------------+
   |                       |
LettuceConnectionFactory  JedisConnectionFactory
   |                       |
client/provider          pool/client/topology
```

接口在 `connection/RedisConnectionFactory.java:27-68`，还要求实现 `getConvertPipelineAndTxResults()`，把驱动原始结果是否转换纳入统一契约。

## Lettuce 生命周期

`LettuceConnectionFactory#start` 在 `connection/lettuce/LettuceConnectionFactory.java:922-948` 使用状态 CAS 防止重复启动，创建 client、普通 provider、响应式 provider，并在 Cluster 模式创建 `ClusterCommandExecutor`。`stop` 位于 `:963-984`，按连接、provider、client 顺序释放。

`getConnection` 位于 `:1046-1062`：先断言已启动，Cluster 返回 Cluster 连接，否则从 shared connection/provider 构造 `LettuceConnection`。

## Jedis 生命周期

`JedisConnectionFactory#start` 位于 `connection/jedis/JedisConnectionFactory.java:771-805`，按 unified client、pool、Cluster 三种路径创建资源。`getConnection` 位于 `:1001-1016`，统一处理 Cluster、Unified Jedis 和 legacy Jedis 三种模式。

## 关键取舍

**替代方案**：每次命令都直接新建驱动连接。
**为什么不行**：连接握手和认证成本高，事务、Pub/Sub 又要求连接具有会话粘性。
**证据**：工厂将 `getConnection` 与 `start/stop` 分开，Lettuce 还维护 provider 和 shared connection，见 `LettuceConnectionFactory.java:932-947`。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| 把 Pub/Sub 连接用于普通命令 | 命令失败或阻塞 | 订阅连接进入专用模式 | 使用 listener container 管理 |
| Cluster 仍假设单连接 | MOVED/事务异常 | Cluster 需要节点路由 | 使用 Cluster API 和 hash slot 约束 |
| 忽略 stop | 线程、连接泄漏 | client/provider 未释放 | 让 Bean 实现 `DisposableBean` |

## 可迁移知识

工厂接口应暴露稳定能力，不暴露驱动对象；生命周期对象应把创建和销毁对称实现，并在状态转换处防止重复启动。

> **面试锚点**
> - Lettuce 与 Jedis 工厂的共同契约是什么？
> - 为什么 Cluster 连接不能简单复用普通连接？
> - `start` 和 `stop` 如何保证资源对称？

## Related

- [整体架构](/notes/source/java/spring/spring-data-redis/architecture/)
- [事务与管道](/notes/source/java/spring/spring-data-redis/transaction-pipeline/)
