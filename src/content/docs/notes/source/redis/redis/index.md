---
title: Redis
description: Redis 8.10 源码解析：ae 事件循环、数据结构、持久化、复制与内存回收。
category: Database
tags:
  - Source Reading
  - Redis
  - C
  - Database
order: 1
updatedDate: 2026-08-15
difficulty: advanced
status: stable
lastReviewed: 2026-08-15
draft: false
sidebar:
  order: 1
---

Redis 是一个把高频数据访问压缩到内存、把命令执行保持在事件循环单线程中的数据服务器。源码的关键不只是“字典加 epoll”，而是如何把对象编码、后台 fork、复制 offset、惰性过期和渐进式维护组织成一个可持续运行的状态机。

<!-- more -->

## 版本快照

| 项 | 值 |
| --- | --- |
| 仓库 | `redis/redis` |
| 本地路径 | `E:\source\redis\redis` |
| 分支 | `unstable` |
| Commit | `cbdad795d8d75746e501aae06f14a3398bd190a2`（2026-08-13） |
| 最近 tag | `8.10-m04-int` |

> 本册所有源码坐标均基于上述 commit。当前快照使用 `kvstore`/`kvobj` 命名、multi-part AOF manifest 和带 `rax` 索引的 replication backlog；旧版文章中的字段名可能已经过时。

## 模块地图

| 模块 | 职责 | 关键源码 |
| --- | --- | --- |
| `src/ae.*` | 文件事件、时间事件、主循环 | `ae.c`、`ae_epoll.c` |
| `src/networking.c` | 连接读写、协议解析、输入缓冲 | `readQueryFromClient`、`processInputBuffer` |
| `src/server.c` | 启动、命令分派、cron、beforeSleep | `main`、`initServer`、`processCommand` |
| `src/object.*`、`src/kvstore.*` | 对象头、编码和 DB 存储 | `createObject`、`tryObjectEncodingEx` |
| `src/dict.*` | 哈希表、双表 rehash | `dictRehash` |
| `src/rdb.c`、`src/aof.c` | 快照、AOF 重写与加载 | `rdbSaveRio`、`rewriteAppendOnlyFile` |
| `src/replication.c` | backlog、PSYNC、主从状态 | `replicationFeedSlaves`、`syncCommand` |
| `src/expire.c`、`src/evict.c` | 过期和淘汰 | `activeExpireCycle`、`performEvictions` |

## 读码入口顺序

1. `server.c:8065` 的 `main` → `initServer` → `aeMain`。
2. `ae.c:497` 的 `aeMain` 和 `server.c:1956` 的 `beforeSleep`。
3. `networking.c:3982` → `processInputBuffer` → `server.c:4477`。
4. `object.c:107`、`object.c:939`、`dict.c:406`。
5. `rdb.c`、`aof.c`、`replication.c`。
6. `expire.c`、`evict.c`。

## 本册目录

- [整体架构](/notes/source/redis/redis/architecture/)
- [ae 事件循环与单线程模型](/notes/source/redis/redis/event-loop/)
- [对象编码与内存布局](/notes/source/redis/redis/object-encoding/)
- [渐进式 rehash](/notes/source/redis/redis/incremental-rehash/)
- [RDB 与 AOF 重写](/notes/source/redis/redis/persistence/)
- [主从复制与 PSYNC](/notes/source/redis/redis/replication/)
- [过期与内存淘汰](/notes/source/redis/redis/expiry-eviction/)
- [面试专题](/notes/source/redis/redis/interview/)

## 横向对照

| 对象 | 对照点 |
| --- | --- |
| Netty `EventLoop` | 都把 IO 和任务纳入事件循环；Redis 的命令执行边界更集中 |
| Disruptor | 都用顺序位置和批处理摊薄协调成本；Redis 更强调单线程所有权 |
| Valkey | 对照 Redis fork 后的线程化 IO 和后台任务边界 |
| hiredis | 从客户端 reader 对照 Redis 的 RESP 输入输出路径 |

## Related

- [Redis 系](/notes/source/redis/)
- [Netty](/notes/source/java/base/netty/)
- [Disruptor](/notes/source/java/base/disruptor/)