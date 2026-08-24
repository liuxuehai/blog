---
title: 限流器
description: RedissonRateLimiter 使用 Lua、计数 key 和 ZSET 实现可等待的分布式限流。
category: Backend
tags: [Source Reading, Redisson, Rate Limiter, Redis]
order: 47
updatedDate: 2026-08-24
difficulty: advanced
status: stable
lastReviewed: 2026-08-24
draft: false
sidebar:
  order: 47
---

`RedissonRateLimiter` 以 Redis Hash 保存配置，以 String 保存剩余量，以 ZSET 记录已发放 permit 的时间和数量；申请、回收和 TTL 维护在 Lua 中完成。

<!-- more -->

## 先给答案：RedissonRateLimiter 以 Redis Hash 保存配置，以 String 保存剩余量，…

RedissonRateLimiter 以 Redis Hash 保存配置，以 String 保存剩余量，以 ZSET 记录已发放 permit 的时间和数量；申请、回收和 TTL 维护在 Lua 中完成。 正文沿“数据结构 -> 申请流程 -> 为什么用 ZSET”展开：先确认入口和状态归属，再跟踪控制流或数据流的推进，最后落到对外可观察的结果。

主要失效边界集中在“请求 permits 大于 rate、无限等待、客户端 key 隔离”这些场景。它们破坏的是容量、顺序、并发或生命周期前提；排查时应先确认状态是否仍由正确对象持有，再核对推进条件和清理路径。

## 数据结构

```text
{name}             -> rate / interval / type / keepAliveTime
{name}:value       -> shared remaining permits
{name}:permits     -> ZSET(score = timestamp, member = token+amount)
{name}:...:{client} -> per-client variants when type requires it
```

key 名称方法位于 `RedissonRateLimiter.java:38-58`。入口 `tryAcquireAsync` 位于 `:60-75`，带等待时间的重试逻辑位于 `:112-142`。

## 申请流程

```text
tryAcquire(permits)
  -> Lua read config
     -> remove expired ZSET entries
        -> restore released permits
           -> enough? ZADD + DECRBY + success
           -> not enough? return next delay
  -> Java timer waits delay and retries
```

Lua 主体位于 `RedissonRateLimiter.java:143-218`。返回 nil 表示成功，返回 delay 表示当前窗口内不可用；Java 侧用 Netty timer 重新尝试，而不是阻塞线程。

## 为什么用 ZSET

**替代方案**：固定窗口计数器，每个周期重置。
**为什么不行**：边界处会产生突发流量，且无法精确知道哪些 permit 已过期。
**证据**：脚本用 `ZRANGEBYSCORE` 找到窗口外的发放记录，再用 `ZREMRANGEBYSCORE` 删除并恢复额度。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| 请求 permits 大于 rate | 脚本断言失败 | 单次请求无法在配置速率内满足 | 先校验请求大小 |
| 无限等待 | Future 长时间未完成 | `timeout = -1` 会按 delay 持续重试 | 为业务请求设置总超时 |
| 客户端 key 隔离 | 多实例额度看似不共享 | limiter type 使用 client-specific key | 明确使用全局还是客户端级限流 |
| 时钟跳变 | delay 计算异常 | score 使用客户端当前时间 | 统一时间来源并监控时间漂移 |

> **面试锚点**
> - RedissonRateLimiter 的 ZSET score 表示什么？
> - 为什么申请失败后不立即自旋？
> - 固定窗口和滑动窗口在边界处有什么差异？

## Related

- [Lua 原子化与命令编排](/notes/source/java/storage/redisson/lua-atomicity/)
- [分布式对象](/notes/source/java/storage/redisson/distributed-objects/)
- [Spring Cloud Gateway 限流](/notes/source/java/spring/spring-cloud-gateway/)
