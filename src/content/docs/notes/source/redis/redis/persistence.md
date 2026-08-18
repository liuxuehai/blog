---
title: RDB 与 AOF 重写
description: Redis 如何用快照、增量日志和 fork 重写平衡恢复速度与数据安全。
category: Database
tags: [Source Reading, Redis, Persistence]
order: 15
updatedDate: 2026-08-15
difficulty: advanced
status: stable
lastReviewed: 2026-08-15
draft: false
sidebar:
  order: 15
---

Redis 的持久化不是 RDB 与 AOF 二选一这么简单：RDB 提供紧凑快照，AOF 记录命令语义，重写阶段再把历史压缩成新的 base 文件和增量文件。

<!-- more -->

## 持久化路径

```text
主线程写命令
   ├─► RDB/AOF 状态更新
   ├─► fork child ─► 生成临时 base
   └─► 父进程继续写入 ─► AOF rewrite buffer
                              │
                              ▼
                    manifest 原子切换
```

RDB 写出入口为 `src/rdb.c:2027` 的 `rdbSaveRio`，后台调度为 `src/rdb.c:2223` 的 `rdbSaveBackground`；加载入口为 `src/rdb.c:4665` 的 `rdbLoadRio`。AOF 重写主体为 `src/aof.c:3117` 的 `rewriteAppendOnlyFile`，后台重写为 `src/aof.c:3197`。

## RDB 的取舍

`rdbSaveRio` 遍历数据库，将类型、过期时间和对象编码写入连续格式；`rdbLoadRio` 反向解析，并在 `src/rdb.c:4760` 附近读取数据库大小信息，尽量减少加载期间不必要的 rehash。

**替代方案**：每条写命令同步落盘。
**为什么不行**：磁盘延迟会直接进入命令路径；而每条命令的文本也比紧凑对象快照有更高空间开销。
**证据**：Redis 把快照工作放入 `rdbSaveBackground`，主线程通过 fork 与子进程隔离，见 `src/rdb.c:2223`。

## AOF 重写与 multi-part manifest

AOF 重写不是复制旧日志，而是遍历当前数据生成等价命令或 RDB preamble。当前版本用 `aofManifest` 管理 base 和 incremental 文件，创建、加载和持久化 manifest 的函数集中在 `src/aof.c:155`、`src/aof.c:266`、`src/aof.c:619`。重写期间父进程追加的写入由 rewrite buffer 保存，子进程完成后再合并，避免丢失重写开始后的命令。

### 为什么要 manifest 而不是覆盖单个 appendonly.aof

**替代方案**：重写完后直接 rename 一个新 AOF 文件。
**为什么不行**：在重写窗口内仍有增量写入；单文件覆盖会让“新快照”和“快照之后的命令”难以原子拼接，也不利于失败恢复。
**证据**：`aofManifest` 的 base/incr 文件列表和 `persistAofManifest` 位于 `src/aof.c:155-212`、`src/aof.c:619`，重写完成后通过 manifest 更新文件集合。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| fork 时写入量大 | 内存突然上涨 | COW 复制脏页 | 错峰重写，监控 RSS 和写入速率 |
| AOF fsync=always | 吞吐下降 | 每条命令都触发同步 | 按可靠性要求选择 everysec/no |
| 重写期间磁盘满 | 临时文件失败、旧文件仍在 | 新 manifest 尚未提交 | 保留磁盘余量并监控 rewrite 状态 |
| 恢复时文件不完整 | 启动报错或截断 | 崩溃发生在追加阶段 | 使用 AOF load/check 机制，不手工拼文件 |

## 可迁移知识

快照加增量日志是通用的 checkpoint + delta 设计：快照压缩历史，增量保持在线写入；提交点用 manifest 或元数据指针原子切换。它适用于 KV 存储、搜索索引和状态机快照。

> **面试锚点**
> - RDB 和 AOF 的恢复速度、数据安全和文件大小如何取舍？
> - AOF rewrite 期间的新写入如何保证不丢？
> - Redis 为什么需要 fork，fork 会带来什么成本？

## Related

- [整体架构](/notes/source/redis/redis/architecture/)
- [主从复制与 PSYNC](/notes/source/redis/redis/replication/)
- [Redis 过期与淘汰](/notes/source/redis/redis/expiry-eviction/)