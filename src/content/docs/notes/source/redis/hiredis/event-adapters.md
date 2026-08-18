---
title: 事件循环适配层
description: hiredis 如何用最小 ev 接口接入 ae、libevent、libev、libuv 与 poll。
category: Database
tags:
  - Source Reading
  - hiredis
  - Event Loop
  - Adapter
order: 45
updatedDate: 2026-08-15
difficulty: advanced
status: stable
lastReviewed: 2026-08-15
draft: false
sidebar:
  order: 45
---

hiredis 把事件循环适配压缩为几个动作：打开/关闭读事件、打开/关闭写事件、安排定时器、清理私有状态。核心 async 代码只调用这些 hook，不需要知道外部 loop 的 watcher 类型。

<!-- more -->

## 适配接口

```text
redisAsyncContext.ev
  addRead()       -> monitor socket readable
  delRead()       -> stop readable
  addWrite()      -> monitor socket writable
  delWrite()      -> stop writable
  scheduleTimer() -> optional timeout
  cleanup()       -> release adapter state
```

`adapters/ae.h:102` 的 `redisAeAttach` 创建 ae 私有状态并赋值这些函数指针；libevent 版本在 `adapters/libevent.h:146`，libev 版本在 `:151`，poll 版本在 `adapters/poll.h:166`。

## 读写映射

以 ae adapter 为例，`redisAeReadEvent`（`adapters/ae.h:45`）调用 `redisAsyncHandleRead`，写事件函数（`:52`）调用 `redisAsyncHandleWrite`。add/del 操作在 `:59-91` 中把 hiredis 的兴趣变化翻译成 `aeCreateFileEvent` / `aeDeleteFileEvent`。

```text
core wants read
  -> adapter.addRead
  -> external loop registers fd
  -> readable callback
  -> redisAsyncHandleRead
```

## 定时器差异

libev、libevent 和 poll 都有不同的 timer 模型。libev 通过 `redisLibevSetTimeout`（`adapters/libev.h:136`）管理 `ev_timer`；poll adapter 在 `adapters/poll.h:159` 记录 deadline，再由 `redisPollTick`（`:52`）主动检查。

## 为什么 adapter 用头文件

**替代方案**：为每个事件库编译一个统一的动态适配模块。
**为什么不行**：hiredis 的 adapter 需要包含外部库类型和宏，头文件形式让应用在自己的编译单元中选择依赖，不增加核心库的链接耦合。
**证据**：`adapters/*.h` 都通过静态函数和 `redisAsyncContext.ev` 注入实现，示例程序直接 `redisLibeventAttach`、`redisAeAttach` 或 `redisPollAttach`。

## cleanup 的责任

adapter 不只是注册回调，还必须在 context 销毁时撤销读写 watcher、timer 并释放私有结构。比如 ae 的 `redisAeCleanup` 位于 `adapters/ae.h:95`，先删除读写事件，再释放 `redisAeEvents`。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| addWrite 未幂等 | watcher 重复注册 | adapter 状态没有记录当前 flags | 保持 add/del 与 loop API 对称 |
| cleanup 漏删 timer | 释放后仍收到回调 | 外部 loop 持有悬挂指针 | cleanup 同时撤销 fd 和 timer |
| poll tick 不调用 | timeout 不生效 | poll adapter 没有 loop 自带 timer | 周期执行 `redisPollTick` |
| 跨线程驱动同一 context | 随机状态损坏 | adapter hook 不是线程安全协议 | 固定一个 loop/thread owner |

## 可迁移知识

事件适配器的最小接口应描述“兴趣变化”和“回调归属”，不要泄漏具体 watcher 类型。这样核心状态机可以复用于多种 loop，也便于用 fake adapter 做测试。

> **面试锚点**
> - hiredis adapter 的最小职责是什么？
> - poll adapter 如何补足外部 loop 没有的 timer？
> - cleanup 为什么必须同时处理 fd 和 timer？

## Related

- [异步 API 与回调队列](/notes/source/redis/hiredis/async-api/)
- [总体架构](/notes/source/redis/hiredis/architecture/)
- [Redis ae 事件循环](/notes/source/redis/redis/event-loop/)

