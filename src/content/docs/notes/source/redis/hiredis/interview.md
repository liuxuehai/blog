---
title: 面试专题
description: hiredis 的 RESP 增量解析、同步 pipeline、异步 callback 和事件适配高频问题。
category: Database
tags:
  - Source Reading
  - hiredis
  - Interview
order: 49
updatedDate: 2026-08-24
difficulty: advanced
status: stable
lastReviewed: 2026-08-24
draft: false
sidebar:
  order: 49
---

hiredis 面试的关键不是记住几个 C 函数，而是说清楚四个边界：socket 与协议、输出缓冲与 reply、同步驱动与异步驱动、核心状态与事件库适配。

<!-- more -->

## 先给答案：hiredis 的回答框架是缓冲、解析、驱动、回调四层

命令先进入输出缓冲，socket 读写允许部分完成，RESP reader 跨多次读取保存解析进度，完整 reply 才交给同步调用者或异步 callback。pipeline 只是把 append 与取 reply 解耦，并没有绕过协议状态机。

异步 API 不创建线程，它依赖外部事件循环调用 read/write handler；adapter 若漏注册写事件、过早清理或重复驱动，同样会让请求停住或回调错配。context 应由一个执行序列独占，跨线程共享需要调用方自行串行化。

## 高频题

### `redisCommand` 做了什么？

**30 秒版**：它先把命令编码并追加到输出缓冲，再阻塞推进 write/read，最后从 `redisReader` 取出一个完整 reply。源码上是 `redisvCommand`（`hiredis.c:1211`）组合 `redisAppendCommand` 和 `redisGetReply`。

**加分项**：append/get reply 分离，所以 pipeline 不需要重新设计协议层。

**常见错答**：说成一次 `send` 后立刻一次 `recv`；socket 可能 partial write，reply 也可能半包。

### hiredis 如何处理半包？

**30 秒版**：`redisBufferRead` 把新字节 feed 到持久化的 `redisReader`，reader 保存缓冲、offset 和未完成聚合对象，直到完整 RESP 对象可构造。

**展开**：入口是 `hiredis.c:983`、`read.c:789` 和 `read.c:820`。一个 read 可以包含多个 reply，所以取出一个后剩余字节仍留在 reader 中。

**加分项**：reader 使用 `redisReplyObjectFunctions`，解析和 reply 对象分配解耦。

### async API 是否创建线程？

**30 秒版**：不创建线程。它把命令、callback 和 socket 兴趣交给调用者的事件循环，读写事件触发 `redisAsyncHandleRead/Write`。

**源码级加分**：`redisAsyncContext` 在 `async.c:106` 从同步 context 扩展，事件 hook 由 `adapters/*.h` 注入。

### 普通 reply 为什么必须按顺序匹配？

RESP 普通响应没有请求 ID，客户端只能按发送顺序消费 callback 队列。订阅和 push 消息是例外，代码在 `async.c:470` 与 `hiredis.c:1042` 分流处理。

### hiredis 如何支持多个事件循环？

核心只依赖 `redisAsyncContext.ev` 的读、写、timer、cleanup hook；ae、libevent、libev、libuv 和 poll 各自实现 adapter。这样协议层不需要链接任何具体事件库。

## 高难追问

### partial write 与 partial read 的区别？

write 需要保留输出缓冲偏移，直到缓冲清空；read 只需把新字节追加到 reader，解析器决定是否已有完整 reply。对应 `redisBufferWrite`（`hiredis.c:1011`）和 `redisBufferRead`（`:983`）。

### 为什么 async free 不能简单 `free(ac)`？

释放时可能仍在 callback dispatch、外部 loop watcher 或 timer 回调中。`redisAsyncFree`（`async.c:415`）进入状态化清理，内部 `__redisAsyncFree`（`:362`）处理 pending callback 和 adapter cleanup。

### pipeline 是否要求服务端并行执行？

不要求。pipeline 只是客户端批量发送多个命令、减少往返；服务端仍按协议顺序处理并返回，hiredis 按同序取 reply。

## 场景题：命令发送后无回调

排查顺序：确认 `redisAsyncCommand` 返回成功；检查输出缓冲是否触发 `addWrite`；确认外部 loop 实际监听 fd；确认写完后注册了 read；最后检查 `redisProcessCallbacks` 是否被 `redisAsyncHandleRead` 调用。adapter 坐标：`adapters/ae.h:59-91`。

## 场景题：线上出现 reply 错配

优先检查是否多个线程共享同一个 context、是否把 push reply 当普通 reply、是否跨连接混用了 callback 状态。reader 和 callback 队列都是单 context 状态，不提供并发消费语义。

## Related

- [整体架构](/notes/source/redis/hiredis/architecture/)
- [RESP Reader 状态机](/notes/source/redis/hiredis/resp-reader/)
- [异步 API 与回调队列](/notes/source/redis/hiredis/async-api/)
- [事件循环适配层](/notes/source/redis/hiredis/event-adapters/)
