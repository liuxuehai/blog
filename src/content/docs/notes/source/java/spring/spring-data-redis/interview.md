---
title: 面试专题
description: Spring Data Redis 高频题、高难追问与源码级回答。
category: Backend
tags: [Source Reading, Spring Data Redis, Interview]
order: 79
updatedDate: 2026-08-24
difficulty: advanced
status: stable
lastReviewed: 2026-08-24
draft: false
sidebar:
  order: 79
---

面试重点不是背 `RedisTemplate` API，而是能解释连接所有权、序列化边界和消费语义。

<!-- more -->

## 先给答案：先确认连接归属，再确认序列化与消费语义

`RedisTemplate` 的核心价值是把连接获取释放、命令回调和对象到字节的转换放在统一边界内；事务开启后，相关命令必须落到绑定的同一连接，提交或回滚时再由事务同步完成收尾。

排查数据问题要先看 serializer 是否一致，排查事务要看连接是否真正参与同步，排查消息则要区分 Pub/Sub 的在线即收与 Stream 的 pending/ack 状态。Lettuce 与 Jedis 被统一的是接口，不是线程模型和底层连接能力。

## 高频题

### `RedisTemplate` 做了什么？

**30 秒版**：它用 callback 统一获取和释放连接，并在命令前后完成序列化和反序列化。

**展开**：核心逻辑在 `core/RedisTemplate.java:397-427`，连接来自 `RedisConnectionUtils`，callback 可获得代理连接，最后统一 release。

**加分项**：默认不暴露 native connection，`createRedisConnectionProxy` 位于 `:545-550`。

**常见错答**：说它只是 Redis 命令的门面，忽略了事务和资源生命周期。

### Lettuce 和 Jedis 如何被统一？

**30 秒版**：二者实现 `RedisConnectionFactory`，上层只依赖 `RedisConnection` 和命令接口。

**展开**：接口坐标为 `connection/RedisConnectionFactory.java:27-68`；Lettuce 和 Jedis 各自负责 client、pool、Cluster 资源。

**加分项**：两者的 `start/stop` 都是生命周期边界，而不是每次命令创建客户端。

**常见错答**：认为 Spring Data Redis 直接把 Jedis API 暴露给模板。

### serializer 为什么重要？

**30 秒版**：Redis 只保存 bytes，serializer 决定数据格式、跨语言能力和兼容策略。

**展开**：`RedisSerializer.java:31-104` 定义最小契约；`DefaultRedisSerializationContext.java:30-45` 为 key/value/hash 分别持有 pair。

**加分项**：动态 JSON 类型由 `GenericJackson2JsonRedisSerializer.java:301-316` 解析，但有类型信任风险。

**常见错答**：只看 Java 泛型，不看真实 Redis bytes。

### Pub/Sub 与 Stream 如何选择？

**30 秒版**：Pub/Sub 适合实时广播，离线期间消息不保留；Stream 有 ID、消费组和 pending 语义。

**展开**：Pub/Sub 用一个 subscriber 复用连接，见 `listener/RedisMessageListenerContainer.java:73-90`；Stream 使用 `StreamPollTask` 长轮询，见 `stream/StreamPollTask.java:119-170`。

**加分项**：Stream 的 `latest` offset 可能跳过轮询期间到达的消息。

**常见错答**：把 Pub/Sub 当作可靠队列。

## 高难追问

### pipeline 是事务吗？

不是。pipeline 在 `RedisTemplate.java:447-511` 批量发送并集中取回结果；MULTI/EXEC 在 `:946-982` 和连接同步器中提供事务队列与提交语义。

### Redis 事务为什么需要绑定连接？

因为 MULTI 队列属于单个 Redis 连接。`RedisConnectionUtils#doGetConnection` 在 `:126-181` 通过 `TransactionSynchronizationManager` 绑定 holder，事务结束时 `:401-425` 统一 exec/discard 并解绑。

### Stream 消费如何停止？

`DefaultStreamMessageListenerContainer#stop` 在 `stream/DefaultStreamMessageListenerContainer.java:164-175` 遍历取消订阅；任务在 `StreamPollTask.java:84-87` 委托给 poll state。

## 场景题

### 线上出现 Redis 连接泄漏，如何排查？

先确认是否绕过 `RedisTemplate` 直接获取连接，再检查 callback 是否自行关闭或异常路径是否跳过释放，重点看 `RedisTemplate.java:425-427` 与工厂 `stop` 实现。

### Stream 消费重复或丢失怎么办？

核对 offset 选择、消费组 ACK、listener 异常策略和任务取消时机。不要默认使用 `latest`，接口文档已在 `StreamMessageListenerContainer.java:80-82` 提示其丢消息风险。

## 反向问面试官

- 业务更需要广播，还是需要可追踪、可重放的消费组？
- Redis Cluster 下是否要求事务跨 key 原子？
- serializer 是否有跨版本迁移方案？

## Related

- [整体架构](/notes/source/java/spring/spring-data-redis/architecture/)
- [事务与管道](/notes/source/java/spring/spring-data-redis/transaction-pipeline/)
