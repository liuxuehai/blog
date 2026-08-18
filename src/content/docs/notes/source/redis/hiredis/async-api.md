---
title: 异步 API 与回调队列
description: redisAsyncContext 的命令队列、连接状态、回调派发与释放时机。
category: Database
tags:
  - Source Reading
  - hiredis
  - Async IO
  - Callback
order: 44
updatedDate: 2026-08-15
difficulty: advanced
status: stable
lastReviewed: 2026-08-15
draft: false
sidebar:
  order: 44
---

hiredis 异步 API 的核心不是创建线程，而是把“发送命令”和“回调 reply”放入事件循环驱动的状态机。一个 async context 维护连接状态、待处理 callback 队列、读写兴趣和超时回调。

<!-- more -->

## 生命周期

```text
CONNECTING -> CONNECTED -> COMMANDS_PENDING
    |             |              |
 failure      read/write       callbacks
    v             v              v
 DISCONNECTED <- error <- redisProcessCallbacks
```

`redisAsyncConnectWithOptions` 位于 `async.c:172`，内部通过 `redisAsyncInitialize`（`:106`）从同步 context 扩展；连接/断开回调注册在 `:252`、`:260`。异步释放从 `redisAsyncFree`（`:415`）进入，真正释放由内部流程决定。

## 命令与 callback

`__redisAsyncCommand` 在 `async.c:831` 把编码后的 command 写入输出缓冲，同时把 callback 和 privdata 放入待处理队列。读事件进入 `redisAsyncHandleRead`（`:724`），随后 `redisProcessCallbacks`（`:570`）从 reader 取 reply，并按顺序执行 callback。

```text
redisAsyncCommand
  -> output buffer + callback list
  -> addWrite
  -> socket writable
  -> addRead
  -> reader reply
  -> redisProcessCallbacks
```

## 连接和断开

非阻塞 connect 的可写事件会触发 `__redisAsyncHandleConnect`（`:672`）；失败路径进入 `__redisAsyncHandleConnectFailure`（`:664`）。断开时不能只关闭 fd，还必须处理剩余 callback：`__redisAsyncFree`（`:362`）负责清理上下文和待处理状态。

## 为什么回调按队列顺序匹配

**替代方案**：给每个命令分配独立 future，并允许 reply 任意顺序匹配。
**为什么不行**：RESP 普通响应本身没有请求 ID，客户端只能按发送顺序关联 in-band reply；强行乱序需要改变协议或额外 multiplex 层。
**证据**：`redisProcessCallbacks` 按 callback 队列取出 reply；订阅场景由 `__redisGetSubscribeCallback`（`:470`）单独处理 push/订阅消息。

## 超时和释放

`redisAsyncHandleTimeout` 位于 `async.c:776`，超时通常通过 adapter 的 timer 回调进入。调用 `redisAsyncFree` 不等于立即在任意回调中释放；源码保留延迟清理路径，以避免正在派发 callback 时释放当前 context。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| callback 中直接 free 当前 context | 崩溃或 use-after-free | 仍在 callback dispatch 栈上 | 使用库允许的 disconnect/free 路径 |
| 未注册 write 事件 | 命令 callback 永不触发 | 输出缓冲没有被冲刷 | 正确实现 `ev.addWrite` |
| timeout 未接入 timer | 连接永久挂起 | async core 只提供 timer hook | adapter 实现 `scheduleTimer` |
| 订阅连接按普通请求处理 | reply 对应关系错误 | push/订阅消息改变匹配规则 | 使用订阅 callback 分支 |

## 可迁移知识

异步客户端的安全释放必须是状态机的一部分，而不是调用者随时 `free()`。回调队列、延迟销毁和断开收尾是所有 callback-based 网络库的共同问题。

> **面试锚点**
> - async context 如何把 reply 匹配回 callback？
> - 为什么普通 RESP reply 不能乱序完成？
> - `redisAsyncFree` 为什么可能延迟释放？

## Related

- [RESP Reader 状态机](/notes/source/redis/hiredis/resp-reader/)
- [事件循环适配层](/notes/source/redis/hiredis/event-adapters/)
- [同步命令链](/notes/source/redis/hiredis/sync-command/)

