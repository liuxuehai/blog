---
title: Lua 原子化与命令编排
description: Redisson 如何把检查、修改、过期、清理和通知组合成 Redis 端原子脚本。
category: Backend
tags: [Source Reading, Redisson, Redis, Lua]
order: 44
updatedDate: 2026-08-16
difficulty: advanced
status: stable
lastReviewed: 2026-08-16
draft: false
sidebar:
  order: 44
---

Redisson 的高层对象通常不是一条 Redis 命令的包装，而是一段带状态机语义的 Lua 程序。脚本把竞态窗口从 Java 网络往返中移到 Redis 单线程执行边界内。

<!-- more -->

## 原子化结构

```text
读取状态
  -> 校验 owner / 配置 / 参数
     -> 修改 Hash/String/ZSET
        -> 设置或继承 TTL
           -> 返回 nil / bool / ttl / delay
```

锁脚本的典型顺序是 `exists/hexists -> hincrby -> pexpire`，失败则返回 `pttl`，见 `RedissonLock.java:184-199`。限流脚本则在一次执行中清理过期 permit、计算可用量、写入 ZSET、扣减计数并刷新 TTL，见 `RedissonRateLimiter.java:143-218`。

## Java 侧如何组织脚本

对象实现通过 `evalWriteAsync(key, codec, command, script, keys, params)` 提交脚本；`keys` 用于 Redis Cluster 路由，`params` 进入 `ARGV`。脚本返回值由 `RedisCommand` 描述，避免 Java 侧再次猜测结果类型。

## 为什么不拆成多条命令

**替代方案**：Java 先 `HEXISTS`，再 `HINCRBY`，最后 `PEXPIRE`。
**为什么不行**：任意两条命令之间都可能被其他客户端插入，导致锁重入、过期和释放出现竞态。
**证据**：锁获取把三个动作放在同一段 `evalWriteSyncedNoRetryAsync` 脚本中；限流器也把窗口回收和扣减放在一段脚本中。

## 脚本返回值是协议

返回 `nil`、TTL 或 delay 并不是实现细节，而是对象层与 Redis 状态机之间的协议：锁用 nil 表示成功、正数表示下一次尝试的等待线索；限流器用 nil 表示拿到 permit、正数表示建议等待时间。变更脚本时必须同步检查 decoder 和重试逻辑。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| Cluster 多 key | `CROSSSLOT` | keys 未落在同一 slot | 使用 hash tag，或改为单 key 数据布局 |
| 脚本过长 | Redis 主线程执行延迟 | 单次 Lua 阻塞其他命令 | 控制循环规模，避免在脚本内扫描大集合 |
| 时间单位混用 | TTL 或 delay 错误 | ms、秒、Redis score 混杂 | 参数名明确单位，统一转换入口 |
| 重试脚本 | 重复扣减 | 脚本虽原子但业务可能重发 | 设计幂等 token 或可检测的 owner |

> **面试锚点**
> - 为什么 Lua 能解决 Redis 客户端竞态？
> - `KEYS` 和 `ARGV` 在 Cluster 路由中有什么区别？
> - Lua 原子性是否等于分布式事务？

## Related

- [命令执行与异步管线](/notes/source/java/storage/redisson/command-pipeline/)
- [分布式锁与看门狗](/notes/source/java/storage/redisson/lock-watchdog/)
- [限流器](/notes/source/java/storage/redisson/rate-limiter/)
