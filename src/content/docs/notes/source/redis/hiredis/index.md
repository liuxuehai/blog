---
title: hiredis 源码解析
description: C 客户端连接上下文、RESP reader、同步 API、异步回调与事件适配层。
category: Database
tags:
  - Source Reading
  - hiredis
  - Redis
  - C
order: 4
updatedDate: 2026-08-19
difficulty: advanced
status: stable
lastReviewed: 2026-08-19
draft: false
sidebar:
  order: 4
---

hiredis 是 Redis 官方 C 客户端的底层实现。它把网络连接、命令编码、RESP 增量解析和异步事件适配拆成可组合的几层，既能提供阻塞式 `redisCommand`，也能把同一套协议状态接入 libevent、libev、libuv、Redis `ae` 或自定义 poll 循环。

<!-- more -->

## 本册问题地图

hiredis 是 Redis 客户端协议栈的轻量实现，本册不从 API 列表开始，而是追踪“一条命令如何变成 reply”：

1. **RESP 数据如何在不完整的网络字节中被识别？** reader 状态机如何保存半包和嵌套结构。
2. **同步 API 为什么拆成 Append 和 GetReply？** 写命令与等待响应分离后，批量请求获得了什么能力。
3. **异步 API 如何保证 reply 不错配？** 命令队列、callback 队列和连接状态怎样共同推进。
4. **为什么协议层不绑定某个事件库？** adapter 只映射读写、计时器和 cleanup，事件循环所有权留给调用方。
5. **断线和超时后谁负责释放？** context、pending command、reader 和外部 event loop 的生命周期如何收口。


## 版本快照

| 项 | 值 |
| --- | --- |
| 仓库 | `redis/hiredis` |
| 本地路径 | `E:\source\redis\hiredis` |
| 分支 | `master` |
| Commit | `458ea27ac4f9d4842d1bafb18f7b6cec81ec5bb3`（2026-08-10） |
| 最近 tag | `v1.4.0` |

> 本册源码坐标均基于上述 commit；行号随上游演进可能漂移。

## 模块地图

```text
hiredis.c       redisContext、连接、命令缓冲、同步 API
read.c          RESP reader 增量解析与 reply 对象构造
net.c           TCP/Unix socket、超时、阻塞/非阻塞读写
async.c         redisAsyncContext、回调队列、连接状态
adapters/*.h    把 ev.addRead/addWrite/timer 映射到外部 loop
dict.c          异步请求回调和订阅状态所需的字典
```

## 读码入口顺序

1. `redisConnectWithOptions` → `redisContextInit`，理解连接状态。
2. `redisAppendCommand` → `redisBufferWrite`，理解命令如何进入输出缓冲。
3. `redisBufferRead` → `redisReaderFeed` → `redisReaderGetReply`，理解半包处理。
4. `redisCommand` → `redisGetReply`，理解同步 API 只是组合层。
5. `redisAsyncCommand` → `redisProcessCallbacks`，理解异步请求和回调匹配。
6. `redisLibeventAttach` / `redisAeAttach`，理解事件循环适配的最小接口。

## 本册目录

- [整体架构](/notes/source/redis/hiredis/architecture/)
- [同步命令链](/notes/source/redis/hiredis/sync-command/)
- [RESP Reader 状态机](/notes/source/redis/hiredis/resp-reader/)
- [异步 API 与回调队列](/notes/source/redis/hiredis/async-api/)
- [事件循环适配层](/notes/source/redis/hiredis/event-adapters/)
- [面试专题](/notes/source/redis/hiredis/interview/)

## 横向对照

| 对象 | 对照点 |
| --- | --- |
| Redis `networking.c` | 服务端输入缓冲与 hiredis 客户端 reader 的相反视角 |
| Valkey IO Threads | 服务端把 socket IO 并行化，hiredis 把 IO 交给外部 loop |
| Netty `ByteToMessageDecoder` | 都要处理半包和增量解析，但 hiredis 用 C 状态结构而非 handler pipeline |

## Related

- [Redis 源码解析](/notes/source/redis/redis/)
- [Valkey 源码解析](/notes/source/redis/valkey/)
- [Netty 源码解析](/notes/source/java/base/netty/)
