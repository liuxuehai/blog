---
title: 客户端缓存与扩展
description: CacheConnection、Push consumer、Builder 和 Connection.Builder 如何扩展 Jedis 的命令执行。
category: Backend
tags: [Source Reading, Jedis, Client Cache]
order: 57
updatedDate: 2026-08-24
lastReviewed: 2026-08-24
sidebar:
  order: 57
---

Jedis 的扩展点集中在连接创建、命令前 hook、响应 builder 和 push 消息处理，因此客户端缓存可以复用普通命令执行管线。

<!-- more -->

## 先给答案：Jedis 的扩展点集中在连接创建、命令前 hook、响应 builder 和 push 消息处理，因此客…

Jedis 的扩展点集中在连接创建、命令前 hook、响应 builder 和 push 消息处理，因此客户端缓存可以复用普通命令执行管线。 理解客户端缓存与扩展时，要先确认入口与状态归属，再跟踪控制流或数据流的推进顺序，最后落到对外可观察的结果。

主要失效边界集中在“自定义 eviction 非线程安全、RESP2 使用 push 特性、缓存 key 未含参数”这些场景。它们破坏的是容量、顺序、并发或生命周期前提；排查时应先确认状态是否仍由正确对象持有，再核对推进条件和清理路径。

主要失效边界集中在“自定义 eviction 非线程安全、RESP2 使用 push 特性、缓存 key 未含参数”这些场景。它们破坏的是容量、顺序、并发或生命周期前提；排查时应先确认状态是否仍由正确对象持有，再核对推进条件和清理路径。

```text
command
  └─► CacheConnection
       ├─ tracking state / cache lookup
       ├─ normal Connection#executeCommand
       └─ push invalidate consumer updates cache
```

`CacheConnection` 继承 `Connection`，在 `executeCommand(CommandObject)` 前后加入缓存命中和缓存写入；`DefaultCache` 管理 entry 与 eviction policy：见 `CacheConnection.java:17-160`、`AbstractCache.java:17-80`、`AbstractCache.java:120-215`、`DefaultCache.java:7-100`。

RESP3 push 响应不属于某个同步命令的普通返回值，连接需要把它分派给 `PushConsumer`；这解释了为什么协议读取必须允许异步消息穿插：见 `Protocol.java:131-170`、`PushConsumer.java:1-40`、`PushInvalidateConsumer.java:19-90`、`CacheEntry.java:12-80`。

## 为什么缓存放在 Connection 子类

**替代方案**：在 `UnifiedJedis` API 层缓存每个命令的结果。
**为什么不行**：服务端失效通知、RESP3 push 和二进制命令都发生在连接/协议层，API 层无法可靠观察所有变化。
**证据**：`CacheConnection` 复用底层发送和读取逻辑，只在命令执行边界增加缓存语义。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| 自定义 eviction 非线程安全 | 并发缓存异常 | policy 明确要求调用线程约束 | 选择合适实现并隔离连接 |
| RESP2 使用 push 特性 | 收不到失效通知 | client-side cache 依赖 RESP3 | 显式配置 protocol |
| 缓存 key 未含参数 | 返回错误数据 | 命令语义不适合简单 key cache | 只缓存明确支持的命令 |

## 可迁移知识

需要被服务端主动失效的客户端缓存，必须把缓存和协议读取器绑定，而不是只包裹业务 API。

> **面试锚点**
> - Redis client-side caching 的失效通知从哪里进入？
> - 为什么 push response 不能按普通 response 解析？
> - Jedis 如何通过 Connection.Builder 扩展连接类型？

## Related

- [Jedis 命令与协议](/notes/source/java/storage/jedis/command-protocol/)
- [Redisson 命令管线](/notes/source/java/storage/redisson/command-pipeline/)
