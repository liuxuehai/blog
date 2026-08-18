---
title: Jedis
description: Jedis 源码解析总览：RESP 编解码、连接生命周期、连接池、集群路由与 Pipeline。
category: Backend
tags: [Source Reading, Java, Jedis, Redis]
order: 5
updatedDate: 2026-08-16
difficulty: advanced
status: stable
lastReviewed: 2026-08-16
draft: false
sidebar:
  order: 5
---

Jedis 是 Redis 的 Java 客户端。当前版本把命令建模、RESP 协议、连接提供者和集群路由拆开，既保留轻量单连接 API，也支持池化、Pipeline、事务和 Cluster。

<!-- more -->

## 版本快照

| 项 | 值 |
| --- | --- |
| 仓库 | `redis/jedis` |
| 本地路径 | `E:\source\java\storage\jedis` |
| 分支 | `master` |
| Commit | `ccfc0809fcb5ad7d4a8ca6819d16ea5baa6574fc`（2026-08-13） |
| 最近 tag | `v8.0.0` |

> 本册坐标均基于上述 commit；上游演进后行号可能漂移。

## 模块地图

| 模块 | 职责 | 关键类 |
| --- | --- | --- |
| 命令层 | 类型安全参数与返回值构造 | `CommandArguments`、`CommandObject`、`CommandObjects` |
| 连接层 | Socket、认证、读写和状态 | `Connection`、`Protocol` |
| 客户端层 | 单机 API 与统一 API | `Jedis`、`UnifiedJedis` |
| 资源层 | 连接复用与生命周期 | `ConnectionFactory`、`ConnectionPool` |
| 路由层 | Cluster slot、重试与多节点执行 | `ClusterConnectionProvider`、`JedisCluster` |

## 读码入口

1. `UnifiedJedis#executeCommand`，看公共 API 如何下沉到命令对象。
2. `Connection#executeCommand`，看发送前 hook、写请求和读响应。
3. `Protocol#sendCommand/process`，看 RESP 编码与类型分派。
4. `ConnectionFactory` 和 `ConnectionPool`，看池化资源如何创建、验证、销毁。
5. `ClusterConnectionProvider`，看 slot 路由、重定向和故障恢复。

## 本册目录

- [整体架构](/notes/source/java/storage/jedis/architecture/)
- [命令与 RESP 协议](/notes/source/java/storage/jedis/command-protocol/)
- [连接生命周期](/notes/source/java/storage/jedis/connection-lifecycle/)
- [连接池与资源管理](/notes/source/java/storage/jedis/pooling/)
- [Pipeline 与事务](/notes/source/java/storage/jedis/pipeline-transaction/)
- [Cluster 路由与重试](/notes/source/java/storage/jedis/cluster-routing/)
- [客户端缓存与扩展](/notes/source/java/storage/jedis/client-cache-extension/)
- [面试专题](/notes/source/java/storage/jedis/interview/)

## 横向对照

| 对象 | 对照点 |
| --- | --- |
| [Redisson](/notes/source/java/storage/redisson/) | Jedis 更接近 Redis 协议和连接，Redisson 在其上提供对象与分布式同步抽象 |
| [HikariCP](/notes/source/java/storage/hikaricp/) | 都把资源借用与生命周期分离；Jedis 连接池委托 Apache Commons Pool |
| [Redis](/notes/source/redis/redis/) | Jedis 负责客户端协议与路由，Redis 负责服务端事件循环和数据结构 |

## Related

- [存储与 ORM](/notes/source/java/storage/)
