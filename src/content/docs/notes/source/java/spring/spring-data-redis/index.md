---
title: Spring Data Redis
description: Spring Data Redis 源码解析：连接工厂、RedisTemplate、序列化、发布订阅、Stream 与事务管线。
category: Backend
tags: [Source Reading, Spring Data Redis, Redis, Data Access]
order: 7
updatedDate: 2026-08-16
difficulty: advanced
status: stable
lastReviewed: 2026-08-16
draft: false
sidebar:
  order: 7
---

Spring Data Redis 将 Lettuce、Jedis、Standalone、Sentinel、Cluster 统一到 `RedisConnectionFactory`，再由 `RedisTemplate` 组合连接、序列化、事务与命令操作。

<!-- more -->

## 版本快照

| 项 | 值 |
| --- | --- |
| 仓库 | `spring-projects/spring-data-redis` |
| 本地路径 | `E:\source\java\spring\spring-data-redis` |
| 分支 | `main` |
| Commit | `bc6fa4abeb186521f8cb5ec30e855340a3c5f3a3`（2026-08-13） |
| 最近 tag | `4.1.0` |

> 本册坐标均基于上述 commit，上游演进后行号可能漂移。

## 它解决什么问题

- 统一不同 Redis 驱动的连接、池、Sentinel 和 Cluster 生命周期。
- 把 Java 对象与 Redis 的 `byte[]` 协议边界隔离开。
- 将事务绑定、管道、脚本、Pub/Sub 和 Stream 接入 Spring 生命周期。

## 模块地图

| 模块 | 职责 | 关键类 |
| --- | --- | --- |
| `connection` | 驱动无关连接抽象 | `RedisConnectionFactory`、`RedisConnection` |
| `connection/lettuce`、`connection/jedis` | 驱动适配 | `LettuceConnectionFactory`、`JedisConnectionFactory` |
| `core` | 模板、操作对象、事务和脚本 | `RedisTemplate`、`RedisConnectionUtils` |
| `serializer` | String、Java、JSON 序列化 | `RedisSerializer`、`RedisSerializationContext` |
| `listener`、`stream` | Pub/Sub 与 Stream 消费 | `RedisMessageListenerContainer`、`StreamPollTask` |

## 读码入口顺序

1. `RedisConnectionFactory#getConnection`：驱动无关边界。
2. `LettuceConnectionFactory#start` / `JedisConnectionFactory#start`：资源创建。
3. `RedisTemplate#execute`：一次命令的完整链路。
4. `RedisConnectionUtils#doGetConnection`：线程绑定和事务同步。
5. `RedisSerializer`：对象到字节数组的边界。
6. `RedisMessageListenerContainer`、`StreamPollTask`：长连接消费。

## 本册目录

- [整体架构](/notes/source/java/spring/spring-data-redis/architecture/)
- [连接抽象与工厂](/notes/source/java/spring/spring-data-redis/connection-factory/)
- [RedisTemplate 调用链](/notes/source/java/spring/spring-data-redis/redis-template/)
- [序列化器体系](/notes/source/java/spring/spring-data-redis/serialization/)
- [发布订阅容器](/notes/source/java/spring/spring-data-redis/pubsub/)
- [Redis Stream 长轮询](/notes/source/java/spring/spring-data-redis/stream/)
- [事务与管道](/notes/source/java/spring/spring-data-redis/transaction-pipeline/)
- [面试专题](/notes/source/java/spring/spring-data-redis/interview/)

## 横向对照

| 对象 | 对照点 |
| --- | --- |
| Redis 原生客户端 | Spring Data Redis 增加生命周期、序列化和事务同步 |
| Spring JDBC | 都用回调屏蔽资源获取与释放 |
| Redisson | 本项目偏数据访问，Redisson 偏高层分布式对象 |

## Related

- [Redis 源码解析](/notes/source/redis/redis/)
- [Spring Framework 事务](/notes/source/java/spring/spring-framework/transaction/)
- [Spring Boot 自动装配](/notes/source/java/spring/spring-boot/)