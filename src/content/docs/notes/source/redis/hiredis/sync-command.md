---
title: 同步命令链
description: redisCommand 从命令格式化、输出缓冲到阻塞收取 reply 的完整调用链。
category: Database
tags:
  - Source Reading
  - hiredis
  - Redis
  - Blocking IO
order: 42
updatedDate: 2026-08-15
difficulty: advanced
status: stable
lastReviewed: 2026-08-15
draft: false
sidebar:
  order: 42
---

`redisCommand` 看起来是一个函数调用，内部却是“编码、写出、读入、解析、返回”五个阶段。理解它，就能解释为什么 hiredis 同时提供 `redisAppendCommand` 和 `redisGetReply`，也能解释 pipeline 如何工作。

<!-- more -->

## 调用链

```text
redisCommand
  -> redisvCommand
  -> redisAppendCommand / Argv
  -> redisGetReply
       -> redisBufferWrite
       -> redisBufferRead
       -> redisGetReplyFromReader
```

`redisCommand` 入口在 `hiredis.c:1217`，`redisvCommand` 在 `:1211`；命令编码最终进入 `__redisAppendCommand`（`:1116`），而同步等待由 `__redisBlockForReply`（`:1200`）和 `redisGetReply`（`:1073`）完成。

## 输出缓冲与 partial write

`redisAppendCommandArgv` 位于 `hiredis.c:1170`，只负责把 RESP command 追加到 context 的 output buffer。`redisBufferWrite` 在 `:1011` 调用底层 `redisNetWrite`，通过 `done` 告诉上层缓冲是否已经清空。

```text
output buffer: [已写部分 | 未写部分]
                         |
                  socket writable
                         v
                  offset 前移
```

这使 pipeline 不需要每条命令立即写 socket：可以连续 append 多条命令，再统一 write 和按顺序读取 reply。

## 阻塞等待

`redisGetReply` 先尝试从 reader 取已有 reply；若不足，再循环 `redisBufferWrite` 和 `redisBufferRead`。因此“同步”不是协议层的特殊格式，而是驱动方式：调用线程主动推进 IO，直到取得一个完整 reply。

## 为什么拆成 Append/GetReply

**替代方案**：每个 `redisCommand` 都强制完成一次 write/read。
**为什么不行**：无法自然支持 pipeline，也无法让调用者控制批量写出和 reply 消费节奏。
**证据**：头文件 `hiredis.h:347-355` 同时公开 append、get reply 和 command 三组 API；`redisCommand` 只是 append 后阻塞取 reply 的便捷包装。

## 错误传播

连接错误、协议错误和超时都写入 `redisContext` 的错误字段；`redisGetReplyFromReader` 在 `hiredis.c:1052` 把 reader 错误转成 context 错误。调用者不能只判断 reply 指针，还要检查返回码和 context 状态。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| append 后不 get reply | 输出正常但 reply 不可见 | append API 不负责消费响应 | 明确维护 request/reply 数量 |
| partial write | 命令只发送一部分 | 非阻塞 socket 一次写不完 | 继续关注可写事件或循环写 |
| reply 顺序错配 | 业务拿到错误结果 | pipeline 必须按发送顺序取 reply | 不跨 context 并发消费 reader |
| timeout 后继续复用 | 后续调用持续失败 | context 已记录错误状态 | 关闭并重连，或明确清理状态 |

## 可迁移知识

“追加请求”和“消费响应”分离，是批处理协议、HTTP/2 stream 管理和数据库 pipeline 的共同结构。同步 API 只是这个异步内核上的阻塞驱动器。

> **面试锚点**
> - `redisCommand` 为什么能支持 pipeline 的底层能力？
> - `redisBufferWrite` 的 `done` 解决什么问题？
> - partial write 和半包 read 分别如何处理？

## Related

- [RESP Reader 状态机](/notes/source/redis/hiredis/resp-reader/)
- [同步命令链与异步 API](/notes/source/redis/hiredis/async-api/)
- [Redis ae 事件循环](/notes/source/redis/redis/event-loop/)

