---
title: MultiLock 与 RedLock
description: Redisson 多锁组合、RedLock 工厂和分布式锁安全边界。
category: Backend
tags: [Source Reading, Redisson, RedLock, Distributed Systems]
order: 45
updatedDate: 2026-08-16
difficulty: advanced
status: stable
lastReviewed: 2026-08-16
draft: false
sidebar:
  order: 45
---

Redisson 同时提供 `MultiLock` 和 `RedLock` API。源码上，RedLock 是在多个独立 `RLock` 上建立组合策略；它不是把单实例锁 magically 变成共识系统，工程上仍需明确 Redis 节点故障模型和业务可接受风险。

<!-- more -->

## 组合结构

```text
RedissonClient
  -> getLock(nameA), getLock(nameB), ...
     -> RedissonMultiLock / RedissonRedLock
        -> acquire each underlying lock
           -> rollback already acquired locks on failure
```

`Redisson#getMultiLock` 位于 `Redisson.java:689-694`；`RedissonRedLock` 位于 `RedissonRedLock.java:25-63`，负责把多个锁传给组合实现。底层每把锁仍执行自己的 Hash + Lua + TTL 逻辑。

## MultiLock 与 RedLock 的区别

| API | 目标 | 关键语义 |
| --- | --- | --- |
| `MultiLock` | 多个资源必须同时持有 | 任一失败通常触发已获锁的回滚 |
| `RedLock` | 多个独立 Redis 实例上的多数派获取 | 以多数成功作为获取条件，并受时间窗口约束 |
| 单 `RLock` | 单 Redis 拓扑内互斥 | 依赖该 Redis 部署的可用性和故障转移 |

## 为什么不是简单 `AND`

**替代方案**：顺序获取全部锁，失败就返回。
**为什么不行**：已经获取的锁会泄漏，且不同客户端可能以不同顺序获取造成死锁。
**证据**：`RedissonMultiLock` 持有底层锁集合并实现失败后的释放路径；组合锁的正确性包含“回滚部分成功”而不只是成功条件。

## 安全边界

RedLock 的争议核心不是 API 能否工作，而是它是否满足特定故障模型下的互斥保证。网络分区、长 GC、时钟和租约耗尽都可能使“多数派已获取”与业务实际执行时间脱节。对资金、库存等高价值临界区，建议配合 fencing token、幂等写入和数据库约束，而不是只依赖锁名。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| 节点延迟高 | 获取多数派但剩余有效时间很短 | 获取耗时挤压 lease window | 记录耗时并拒绝短租约 |
| 部分成功 | 少数锁仍残留 | 回滚也可能失败 | 后台清理、短 TTL、可重入幂等 |
| 业务执行超租约 | 两个客户端都进入临界区 | 锁已过期 | fencing token 或版本号校验 |

> **面试锚点**
> - MultiLock 和 RedLock 的目标有什么不同？
> - 为什么组合锁必须有回滚？
> - RedLock 为什么不能替代 fencing token？

## Related

- [分布式锁与看门狗](/notes/source/java/storage/redisson/lock-watchdog/)
- [Lua 原子化与命令编排](/notes/source/java/storage/redisson/lua-atomicity/)
