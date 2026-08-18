---
title: 连接生命周期
description: Connection 从构造、认证、命令读写到关闭的状态变化和故障处理。
category: Backend
tags: [Source Reading, Jedis, Connection]
order: 53
updatedDate: 2026-08-16
sidebar:
  order: 53
---

Jedis 的连接是有状态资源：Socket、Redis protocol、认证、数据库选择和 client name 都绑定在连接上。连接复用的前提是归还前状态已经可控。

<!-- more -->

```text
NEW ──connect──► CONNECTED ──HELLO/AUTH/SELECT──► READY
 │                                      │
 └──────────── close/error ◄────────────┘
READY ──send/read──► READY
```

## 创建与初始化

`Connection.Builder#build` 创建连接后调用初始化逻辑；`DefaultJedisSocketFactory` 负责 socket、SSL、连接超时和读超时：见 `Connection.java:35-120`、`Connection.java:150-190`、`DefaultJedisSocketFactory.java:20-120`、`Connection.java:744-850`。

初始化会协商 Redis protocol，随后按配置执行 `AUTH`、`SELECT`、`CLIENT SETNAME` 等命令。配置来源集中在 `DefaultJedisClientConfig`，避免构造器参数无限增长：见 `DefaultJedisClientConfig.java:15-120`、`DefaultJedisClientConfig.java:242-340`、`Connection.java:830-919`。

## 命令期间

`Connection#sendCommand` 只负责写入，`executeCommand` 负责写入后读取响应。异常时连接会进入不可复用状态，池工厂随后销毁它，而不是把半断开的 socket 重新交给业务：见 `Connection.java:304-373`、`Connection.java:431-468`、`ConnectionFactory.java:147-190`。

## 为什么关闭要幂等

**替代方案**：由调用方保证只 close 一次。
**为什么不行**：try-with-resources、池回收、异常清理和显式关闭可能叠加，非幂等 close 会把清理路径变成新的异常源。
**证据**：`Connection#close` 先检查 socket/状态，再关闭底层资源；`Pool#close` 也统一吞并清理异常。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| 连接被阻塞命令占用 | 后续命令超时 | 同一连接只能顺序读写 | 独占连接或使用异步/池化策略 |
| 借出后未 close | 池耗尽 | 连接没有归还 | `try-with-resources` |
| 连接异常后继续复用 | 大量协议错误 | 输入流已失步 | 失败连接直接 destroy |

## 可迁移知识

有状态客户端资源必须把“可复用”作为显式状态，而不是仅凭对象未被 GC 判断；异常路径应优先保证资源不回池。

> **面试锚点**
> - Jedis 连接为什么不能并发共享？
> - 认证和 SELECT 在何时执行？
> - 为什么连接异常后不能简单 reset？

## Related

- [Jedis 连接池](/notes/source/java/storage/jedis/pooling/)
- [HikariCP 连接生命周期](/notes/source/java/storage/hikaricp/connection-lifecycle/)
