---
title: 存储与 ORM
description: MyBatis、MyBatis-Plus、ShardingSphere、Druid、Redisson、Jedis 与 HikariCP 的源码解析索引。
category: Backend
tags: [Source Reading, Java, Storage, ORM]
order: 4
updatedDate: 2026-08-16
difficulty: advanced
status: learning
lastReviewed: 2026-08-16
draft: false
sidebar:
  order: 4
---

对应源码目录 `E:\source\java\storage\`，共 7 个仓库，覆盖 ORM 映射、分库分表、连接池、Redis 客户端和分布式对象。

<!-- more -->

## 分册

| 仓库 | 主题 | 状态 |
| --- | --- | --- |
| [MyBatis](/notes/source/java/storage/mybatis-3/) | 配置解析、Mapper 代理、Executor、缓存、插件与结果映射 | ✅ 7 篇 |
| [MyBatis-Plus](/notes/source/java/storage/mybatis-plus/) | Mapper 增强、条件构造器、插件与代码生成 | ✅ 8 篇 |
| [ShardingSphere](/notes/source/java/storage/shardingsphere/) | SQL 解析、路由、改写、分布式事务与治理 | ✅ 10 篇 |
| [Druid](/notes/source/java/storage/druid/) | 连接池、SQL Parser、监控与防火墙 | ✅ 10 篇 |
| [Redisson](/notes/source/java/storage/redisson/) | Netty 连接、命令编解码、分布式对象与锁 | ✅ 8 篇 |
| [Jedis](/notes/source/java/storage/jedis/) | RESP 客户端、连接池、Pipeline 与集群 | ✅ 8 篇 |
| [HikariCP](/notes/source/java/storage/hikaricp/) | 连接池并发控制、借还连接与故障检测 | ✅ 8 篇 |

## 阅读顺序

先读 MyBatis，建立“声明式 SQL -> 元数据 -> 执行器 -> 结果对象”的 ORM 基线；再读 ShardingSphere 的 SQL 路由和 Druid/HikariCP 的连接池实现，最后对照 Redis 客户端与 Redisson 的异步对象抽象。

## Related

- [Java 源码解析索引](/notes/source/java/)
- [源码解析总览](/notes/source/)
