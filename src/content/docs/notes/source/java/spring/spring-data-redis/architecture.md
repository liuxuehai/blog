---
title: 整体架构
description: RedisConnectionFactory、RedisTemplate、序列化和监听容器之间的分层与主流程。
category: Backend
tags: [Source Reading, Spring Data Redis, Architecture]
order: 71
updatedDate: 2026-08-24
difficulty: advanced
status: stable
lastReviewed: 2026-08-24
draft: false
sidebar:
  order: 71
---

Spring Data Redis 可以拆成连接生命周期链、同步命令链和异步消费链。

<!-- more -->

## 先给答案：模板统一操作，连接与字节仍有明确所有权

Spring Data Redis 通过 `RedisConnectionFactory` 屏蔽 Lettuce/Jedis 差异，`RedisTemplate` 在 callback 边界获取连接、序列化键值、执行命令并释放资源；事务场景则由 ConnectionUtils 把连接绑定到当前线程与事务同步。

抽象不会消除 Redis 语义：序列化决定实际字节协议，事务要求同一连接，Pub/Sub 是瞬时推送，Stream 才有可确认的消费状态。连接复用、阻塞命令和监听容器各有独立生命周期，不能把 template 当成无状态网络客户端。

## 分层

```text
业务代码
  ├─ RedisTemplate
  │    ├─ Operations -> RedisConnection 命令接口
  │    ├─ Serializer -> byte[]
  │    └─ ConnectionUtils -> Thread-bound resource
  ├─ RedisMessageListenerContainer -> Pub/Sub subscriber
  └─ StreamMessageListenerContainer -> StreamPollTask
                                      |
                         RedisConnectionFactory
                           ├─ LettuceConnectionFactory
                           └─ JedisConnectionFactory
```

| 层 | 核心抽象 | 作用 |
| --- | --- | --- |
| 驱动层 | `RedisConnectionFactory` | 普通、Cluster、Sentinel 连接入口 |
| 访问层 | `RedisTemplate` | 回调执行、序列化、操作对象 |
| 事务层 | `RedisConnectionUtils` | 线程绑定和事务同步 |
| 消费层 | Listener / Stream Container | 长连接、分发、重试、取消 |

## 启动主流程

```text
ApplicationContext
  -> SmartLifecycle.start()
     -> Lettuce/JedisConnectionFactory.start()
        -> create client / pool / provider
        -> state = STARTED
     -> listener container starts subscriber lazily
     -> stream container submits StreamPollTask
```

`LettuceConnectionFactory#start` 位于 `connection/lettuce/LettuceConnectionFactory.java:922-948`，先创建 client 和 provider，再置为 `STARTED`；`afterPropertiesSet` 位于 `:992-997`。Jedis 的对应逻辑在 `connection/jedis/JedisConnectionFactory.java:771-805`。

## 请求主流程

```text
opsForValue().get(key)
  -> RedisTemplate.execute(RedisCallback)
     -> RedisConnectionUtils.getConnection()
     -> rawKey / command
     -> deserialize(result)
     -> releaseConnection()
```

`RedisTemplate#execute` 位于 `core/RedisTemplate.java:371-427`；`RedisConnectionFactory#getConnection` 位于 `connection/RedisConnectionFactory.java:42-48`。这使上层不需要感知 Lettuce 或 Jedis。

## 扩展点

| 扩展点 | 接口 | 触发时机 |
| --- | --- | --- |
| 连接工厂 | `RedisConnectionFactory` | 获取普通、Cluster、Sentinel 连接 |
| 序列化 | `RedisSerializer` / `SerializationPair` | 命令入参和返回值 |
| 监听 | `MessageListener` / `StreamListener` | 收到消息或 Stream 记录 |
| 生命周期 | `SmartLifecycle` | Context 启停 |

## 为什么不让模板直接持有驱动客户端

**替代方案**：`RedisTemplate` 直接依赖 Lettuce 或 Jedis。
**为什么不行**：池化、拓扑和驱动切换会泄漏到业务层。
**证据**：`RedisConnectionFactory` 只暴露驱动无关的 `getConnection`、`getClusterConnection` 和 `getSentinelConnection`，见 `connection/RedisConnectionFactory.java:27-68`。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| 工厂未启动 | 获取连接失败 | 驱动资源尚未创建 | 交给 Spring 生命周期管理 |
| 没有 listener | 容器启动但无连接 | Pub/Sub 连接 lazy | 先注册 listener |
| Stream 线程不足 | 消费停滞 | 每个订阅是长任务 | 配置独立 executor |

## 可迁移知识

把驱动适配、资源生命周期和业务操作分层，可迁移到 JDBC、消息客户端和对象存储 SDK。长连接消费应建模成可取消任务，而不是藏在业务线程中的无限循环。

> **面试锚点**
> - 为什么同时提供普通、Cluster、Sentinel 连接？
> - 同步模板和异步容器为什么采用两套生命周期？
> - Listener 容器为什么 lazy 建立连接？

## Related

- [连接抽象与工厂](/notes/source/java/spring/spring-data-redis/connection-factory/)
- [RedisTemplate 调用链](/notes/source/java/spring/spring-data-redis/redis-template/)
