---
title: 整体架构
description: Redis 启动、请求处理和后台维护如何共享一个事件循环。
category: Database
tags: [Source Reading, Redis, Architecture]
order: 11
updatedDate: 2026-08-15
difficulty: advanced
status: stable
lastReviewed: 2026-08-15
draft: false
sidebar:
  order: 11
---

Redis 的架构核心是单线程拥有主状态，后台子进程承担持久化，主循环在文件事件、时间事件和 beforeSleep 之间切换。

<!-- more -->

## 分层

```text
客户端连接
   │
   ▼
connection / networking.c
   │ RESP 解析
   ▼
processCommand ──► 命令实现 ──► kvstore / object / dict
   │                                      │
   ├──────── beforeSleep ◄────────────────┤
   ├──────── serverCron                  │
   └──────── fork 子进程：RDB/AOF         │
```

| 层 | 职责 | 源码坐标 |
| --- | --- | --- |
| 事件循环 | 监听 fd、执行时间事件 | `src/ae.c:47` `aeCreateEventLoop`、`src/ae.c:497` `aeMain` |
| 网络层 | 读入协议、写出回复 | `src/networking.c:3778` `processInputBuffer`、`src/networking.c:3982` `readQueryFromClient` |
| 命令层 | 权限、参数、事务和命令分派 | `src/server.c:4427` `preprocessCommand`、`src/server.c:4477` `processCommand` |
| 数据层 | key/value 存储和对象编码 | `src/db.c:298` `lookupKey`、`src/object.c:939` `tryObjectEncodingEx` |
| 后台维护 | cron、过期、淘汰、复制推进 | `src/server.c:1571` `serverCron`、`src/server.c:1956` `beforeSleep` |

## 启动主流程

```text
main
 ├─ initServerConfig
 ├─ initServer
 │   ├─ aeCreateEventLoop
 │   ├─ 注册 serverCron 时间事件
 │   └─ 设置 beforeSleep
 └─ aeMain
```

`main` 位于 `src/server.c:8065`，完成配置解析后在 `src/server.c:8149` 初始化配置、在 `src/server.c:8350` 调用 `initServer`，最后于 `src/server.c:8424` 进入 `aeMain`。`initServer` 在 `src/server.c:3009` 创建事件循环，并在 `src/server.c:3211` 注册 `serverCron`，在 `src/server.c:3226` 设置 `beforeSleep`。

### 为什么不让 cron 使用独立线程

**替代方案**：用后台线程扫描过期 key、刷新统计和推进复制。
**为什么不行**：主线程正在修改同一批 key、客户端状态和 reply buffer，线程会把原本依靠所有权保证的 C 结构变成锁协议；锁竞争还会直接进入请求延迟。
**证据**：`serverCron` 和 `beforeSleep` 都由 `aeMain` 调用，维护任务与命令处理共享同一执行上下文，见 `src/ae.c:497`、`src/server.c:1571`。

## 请求主流程

```text
socket readable
  └─► readQueryFromClient
       └─► processInputBuffer
            └─► preprocessCommand
                 └─► processCommand
                      └─► addReply*
                           └─► beforeSleep 刷新输出
```

`readQueryFromClient` 在 `src/networking.c:3982` 读取连接数据；`processInputBuffer` 在 `src/networking.c:3778` 循环切出完整命令；`preprocessCommand` 位于 `src/server.c:4427`，`processCommand` 位于 `src/server.c:4477`。输出并非每条命令立刻 `write(2)`，而是进入客户端 reply 链，在 `beforeSleep` 中集中刷新，相关路径见 `src/server.c:1956` 和 `src/networking.c:273`。

## 扩展点全景

| 扩展点 | 触发点 | 用途 |
| --- | --- | --- |
| 命令表 | `processCommand` | 新命令、权限和参数声明 |
| module API | 命令执行和 RDB/AOF 回调 | 外部数据类型、持久化和阻塞操作 |
| 文件事件 | `aeCreateFileEvent` | 网络协议和异步 fd |
| 时间事件 | `aeCreateTimeEvent` | cron、重试、超时 |
| beforeSleep hook | `aeSetBeforeSleepProc` | 批量刷写、复制和延迟释放 |

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| 单条命令 CPU 很重 | 所有客户端延迟升高 | 命令执行占用主线程 | 拆分数据、异步化或迁移到模块/外部任务 |
| fork 后写入密集 | RSS 暴涨 | COW 导致页面复制 | 控制 fork 时机、降低写入峰值 |
| 输出缓冲过大 | 客户端被断开或内存升高 | 慢客户端拖住 reply 链 | 监控 output buffer，限制大批量返回 |

## 可迁移知识

事件循环不等于“只处理 IO”：把低频维护安排在统一调度点，可以避免共享状态锁；把输出延迟到批处理边界，则能把系统调用和复制开销摊薄。这一模式可迁移到代理、消息 broker 和游戏服务器。

> **面试锚点**
> - Redis 为什么说是单线程，但后台又有 fork 和 bio 线程？
> - `beforeSleep` 为什么是请求路径的重要组成部分？
> - 一条命令从 socket 到执行经过哪些函数？

## Related

- [ae 事件循环与单线程模型](/notes/source/redis/redis/event-loop/)
- [RDB 与 AOF 重写](/notes/source/redis/redis/persistence/)
- [Netty 整体架构](/notes/source/java/base/netty/architecture/)