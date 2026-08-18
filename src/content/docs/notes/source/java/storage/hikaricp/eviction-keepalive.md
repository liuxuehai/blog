---
title: 保活、驱逐与故障检测
description: HouseKeeper、maxLifetime、idleTimeout、keepalive 和 soft eviction 的协同机制。
category: Backend
tags: [Source Reading, HikariCP, Reliability]
order: 46
updatedDate: 2026-08-16
difficulty: advanced
status: stable
lastReviewed: 2026-08-16
draft: false
sidebar:
  order: 46
---

HikariCP 不把所有连接检查都塞进借出线程，而是把时间驱动的维护拆给 HouseKeeper 和每条连接的定时任务；借出路径只处理已经暴露的失效条目。

<!-- more -->

```text
HikariPool
  |
  +--> HouseKeeper: idleTimeout / pool refill / clock anomaly
  +--> MaxLifetimeTask: soft evict after lifetime
  +--> KeepaliveTask: test idle connection
  +--> connection close executor
```

## HouseKeeper

- `HouseKeeper`：`src/main/java/com/zaxxer/hikari/pool/HikariPool.java:793-842`。
- 周期任务调度：`:118`。
- 软驱逐全部连接：`:820`。
- idleTimeout 清理：`:834-836`。
- 连接补充判断：`:528-533`。

## 生命周期和保活

- `createPoolEntry` 设置 maxLifetime：`HikariPool.java:485-498`。
- keepalive 周期与随机偏移：`:498-503`。
- `MaxLifetimeTask`：`:855-868`。
- `KeepaliveTask`：`:870-889`。
- 失效连接 soft evict：`:883`。
- `softEvictConnection`：`:614-630`。
- `PoolEntry#close` 取消任务：`PoolEntry.java:175-190`。

## Soft eviction

软驱逐先把条目标记为不可继续使用；如果连接空闲，可以立即保留并关闭，如果连接正在使用，则等代理归还时由 owner 路径完成关闭。这避免强行中断业务线程持有的 JDBC 连接。

## 为什么使用随机化 maxLifetime/keepalive

**替代方案**：所有连接严格在同一时间到达 maxLifetime 并同时重连。
**为什么不行**：批量过期会形成连接重建尖峰，给数据库和网络造成周期性压力。
**证据**：`HikariPool.java:498-503` 为 keepalive 引入 `keepaliveTime / 5` 的随机偏移；maxLifetime 任务通过独立调度错开生命周期。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| maxLifetime 太短 | 连接频繁重建 | 小于数据库稳定连接周期 | 结合数据库 wait_timeout 配置 |
| keepalive 太密 | 空闲连接持续被探测 | 网络/数据库负载增加 | 只在确有中间设备断连时启用 |
| 时钟跳变 | HouseKeeper 触发异常清理 | 系统时间不稳定 | 使用稳定时钟并监控 NTP |
| 使用中驱逐 | 当前请求不立即失败 | soft eviction 等待归还 | 理解“标记后关闭”语义 |

## 可迁移知识

后台维护应与业务线程解耦，但不能粗暴强杀正在使用的资源。软驱逐、延迟关闭和随机化调度是连接池、缓存和租约系统都能复用的可靠性模式。

> **面试锚点**
> - maxLifetime 和 idleTimeout 的区别是什么？
> - 为什么驱逐连接要采用 soft eviction？
> - keepalive 为什么需要随机偏移？

## Related

- [配置与启动](/notes/source/java/storage/hikaricp/config-startup/)
- [连接借还生命周期](/notes/source/java/storage/hikaricp/connection-lifecycle/)
- [指标与 JMX](/notes/source/java/storage/hikaricp/metrics-jmx/)
