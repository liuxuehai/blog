---
title: 整体架构
description: hiredis 连接上下文、协议 reader、同步阻塞层和异步事件层的组件关系。
category: Database
tags:
  - Source Reading
  - hiredis
  - Architecture
  - RESP
order: 41
updatedDate: 2026-08-24
difficulty: advanced
status: stable
lastReviewed: 2026-08-24
draft: false
sidebar:
  order: 41
---

hiredis 的架构价值在于复用：同步 API 和异步 API 不各自实现一套协议，而是共享连接状态、输出缓冲和 RESP reader；差异只体现在“谁驱动 socket”和“reply 何时交给调用者”。

<!-- more -->

## 先给答案：hiredis 复用同一协议状态机，只替换驱动 socket 的方式

同步与异步 API 都围绕 `redisContext`、输出缓冲和持久化 `redisReader` 工作。同步层主动阻塞推进读写，异步层保存 callback，并通过 adapter 把读、写和定时器兴趣交给外部事件循环。

因此半包、粘包和 partial write 都由共享状态机处理，而不是由调用者猜测一次系统调用是否完成。主要边界是 context 非线程安全、异步 adapter 必须正确维护事件兴趣、非阻塞 connect 完成前不能把连接当作可用。

## 分层

```text
应用 API
  +----------------------+----------------------+
  | redisCommand         | redisAsyncCommand    |
  +----------+-----------+----------+-----------+
             |                      |
      redisContext             redisAsyncContext
             |                      |
      output buffer       callbacks + event hooks
             +----------+-----------+
                        |
                 redisReader / RESP
                        |
                 net.c socket layer
```

```text
外部 event loop
  -> addRead/addWrite/scheduleTimer
  -> redisAsyncHandleRead/Write/Timeout
  -> redisBufferRead/Write
  -> redisReaderFeed/GetReply
  -> redisProcessCallbacks
```

## 核心抽象

`redisContext` 在 `hiredis.c:716` 初始化，保存 fd、错误状态、超时、输出缓冲和 `redisReader`；连接函数 `redisConnectWithOptions` 位于 `hiredis.c:815`。底层读写通过 `redisContextFuncs` 抽象，默认实现绑定 `net.c` 的 `redisNetRead` 和 `redisNetWrite`，见 `hiredis.c:50-56`。

`redisAsyncContext` 在 `async.c:106` 从同步 context 扩展而来，加入连接/断开回调、待处理命令队列和事件回调表。它没有重新定义 RESP 解析器，而是复用父 context 的 reader。

## 启动主流程

```text
redisConnectWithOptions
  -> redisContextInit
  -> redisContextUpdateConnectTimeout
  -> redisContextConnectTcp / Unix
  -> redisContextSetTimeout
  -> return redisContext
```

`redisContextConnectBindTcp` 等连接路径在 `hiredis.c:859` 和 `net.c:447` 附近完成；非阻塞连接不会假设 connect 立即完成，而是由后续事件驱动确认。

## 请求主流程

```text
command format/argv
  -> redisAppendCommand*
  -> output buffer
  -> redisBufferWrite
  -> Redis server
  -> redisBufferRead
  -> redisReaderFeed
  -> reply object
```

同步 API 在 `hiredis.c:1200` 的阻塞等待辅助函数中组合读写；异步 API 则由 `async.c:724`、`:759` 的 read/write handler 推进。

## 为什么协议层不绑定事件库

**替代方案**：在 hiredis 核心里直接依赖 libevent 或 libuv。
**为什么不行**：每个应用的事件循环、线程模型和依赖选择不同，核心库绑定某个 loop 会扩大依赖并限制嵌入场景。
**证据**：`redisAsyncContext.ev` 只暴露 `addRead`、`delRead`、`addWrite`、`cleanup` 和可选 timer 回调，具体实现留在 `adapters/*.h`。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| 非阻塞 connect 未完成 | 立刻发送命令失败 | fd 尚未进入 connected 状态 | 等待可写事件并调用 async handler |
| 外部 loop 未注册写事件 | 命令停在输出缓冲 | `addWrite` 没有真正打开 | 检查 adapter 的写事件生命周期 |
| 多线程共享 context | 随机错配 reply | context、reader、回调队列非线程安全 | 每线程独占 context 或自行串行化 |

## 可迁移知识

把协议状态机与事件源解耦，是 C 网络库适配多种运行时的通用方法：核心只表达“需要读/写/定时器”，adapter 决定如何注册。

> **面试锚点**
> - `redisContext` 和 `redisAsyncContext` 如何复用协议层？
> - 为什么 hiredis 不直接绑定 libevent？
> - 非阻塞 connect 的完成状态由谁确认？

## Related

- [同步命令链](/notes/source/redis/hiredis/sync-command/)
- [异步 API 与回调队列](/notes/source/redis/hiredis/async-api/)
- [事件循环适配层](/notes/source/redis/hiredis/event-adapters/)
