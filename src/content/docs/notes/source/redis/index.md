---
title: Redis 系
description: Redis、Valkey 与 hiredis 的源码解析索引。
category: Database
tags:
  - Source Reading
  - Redis
  - Database
order: 2
updatedDate: 2026-08-15
difficulty: advanced
status: stable
lastReviewed: 2026-08-15
draft: false
sidebar:
  order: 2
---

对应源码目录 `E:\source\redis\`，本组覆盖 Redis 服务端、Valkey 分叉和 hiredis 客户端。先从 Redis 的事件循环、数据结构和持久化读起，再用 Valkey 做演进对照，用 hiredis 补齐协议客户端视角。

<!-- more -->

## 分册

| 仓库 | 主题 | 状态 |
| --- | --- | --- |
| [redis](/notes/source/redis/redis/) | 事件循环、对象编码、渐进式 rehash、持久化、复制、过期与淘汰 | ✅ 已完成 |
| [valkey](/notes/source/redis/valkey/) | Redis 分叉点、多线程 IO 演进与对照阅读 | ✅ 已完成 |
| [hiredis](/notes/source/redis/hiredis/) | RESP 编解码、同步 reader、异步事件适配 | ✅ 已完成 |

## Related

- [源码解析总览](/notes/source/)
