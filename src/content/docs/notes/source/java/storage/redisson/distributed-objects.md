---
title: 分布式对象
description: Redisson 集合、Map、Semaphore 与对象工厂的 key 布局和原子操作模式。
category: Backend
tags: [Source Reading, Redisson, Distributed Objects]
order: 46
updatedDate: 2026-08-24
difficulty: advanced
status: stable
lastReviewed: 2026-08-24
draft: false
sidebar:
  order: 46
---

Redisson 的对象体系不是把 Java 集合序列化成一个 value，而是按对象语义映射到 Hash、List、Set、ZSet、Stream 或多个辅助 key，再用 Lua 保证跨 key 的状态转换。

<!-- more -->

## 先给答案：Redisson 的对象体系不是把 Java 集合序列化成一个 value，而是按对象语义映射到 Hash…

Redisson 的对象体系不是把 Java 集合序列化成一个 value，而是按对象语义映射到 Hash、List、Set、ZSet、Stream 或多个辅助 key，再用 Lua 保证跨 key 的状态转换。 正文沿“对象工厂 -> 数据布局 -> 为什么不统一成一个序列化 value”展开：先确认入口和状态归属，再跟踪控制流或数据流的推进，最后落到对外可观察的结果。

主要失效边界集中在“key 数量膨胀、大集合扫描、codec 不一致”这些场景。它们破坏的是容量、顺序、并发或生命周期前提；排查时应先确认状态是否仍由正确对象持有，再核对推进条件和清理路径。

## 对象工厂

```text
getMap(name)       -> RedissonMap
getSet(name)       -> RedissonSet
getSemaphore(name) -> RedissonSemaphore
getLock(name)      -> RedissonLock
                         all share CommandAsyncExecutor
```

`Redisson#getMap` 位于 `Redisson.java:419-447`，`getSet` 位于 `:740-752`，`getSemaphore` 位于 `:1250-1257`。这类方法只决定实现、codec 和 name，不提前创建 Redis 数据。

## 数据布局

| 对象 | 主要结构 | 典型辅助状态 |
| --- | --- | --- |
| `RMap` | Redis Hash | 过期、监听、索引或本地缓存元数据 |
| `RSet` | Redis Set | 监听和过期辅助 key |
| `RSemaphore` | List/计数或脚本状态 | 发布订阅通知 |
| `RLock` | Hash | TTL、unlock latch、通知 channel |

## 为什么不统一成一个序列化 value

**替代方案**：读取整个 Java Map，修改后整体写回。
**为什么不行**：并发修改需要传输和覆盖全部数据，无法利用 Redis 原生数据结构，也会把冲突处理搬回客户端。
**证据**：`RedissonMap`、`RedissonSet` 等对象分别使用 `CommandAsyncExecutor` 和结构化 Redis 命令；列表操作还通过 `evalWriteAsync` 处理复合变更。

## 一致性模型

单个 Redis key 内的脚本操作具有原子性；对象之间的组合操作不自动构成事务。客户端缓存、订阅通知和异步 Future 还会引入可见性延迟，调用方不能把“API 返回成功”扩展解释成跨对象全局一致。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| key 数量膨胀 | 一个对象产生多个 key | 过期、索引和客户端隔离状态 | 规划命名空间，定期清理 |
| 大集合扫描 | 单次操作耗时高 | Redis 仍需遍历结构 | 使用分页/迭代 API，限制批量大小 |
| codec 不一致 | 读不到旧数据 | 同名 key 使用不同编码 | 固定客户端 codec 和迁移策略 |

> **面试锚点**
> - Redisson 集合为什么不是一个 Java value？
> - 一个对象为什么可能对应多个 Redis key？
> - Redis 单 key 原子性和跨对象事务有什么区别？

## Related

- [整体架构](/notes/source/java/storage/redisson/architecture/)
- [命令执行与异步管线](/notes/source/java/storage/redisson/command-pipeline/)
