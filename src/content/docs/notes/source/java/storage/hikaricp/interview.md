---
title: 面试专题
description: HikariCP 配置、ConcurrentBag、连接代理、状态重置、驱逐和指标的源码面试题。
category: Backend
tags: [Source Reading, HikariCP, Interview]
order: 48
updatedDate: 2026-08-24
difficulty: advanced
status: stable
lastReviewed: 2026-08-24
draft: false
sidebar:
  order: 48
---

HikariCP 面试题的主线是性能与正确性如何同时成立：借还要快，连接状态不能泄漏，故障检测不能阻塞业务，指标还要可解释。

<!-- more -->

## 先给答案：HikariCP 面试题的主线是性能与正确性如何同时成立：借还要快，连接状态不能泄漏，故障检测不能阻塞业务…

HikariCP 面试题的主线是性能与正确性如何同时成立：借还要快，连接状态不能泄漏，故障检测不能阻塞业务，指标还要可解释。 正文沿“高频问题 -> 故障分析题 -> 设计题”展开：先确认入口和状态归属，再跟踪控制流或数据流的推进，最后落到对外可观察的结果。

主要失效边界集中在“获取连接超时、连接状态串线、数据库连接周期性尖峰”这些场景。它们破坏的是容量、顺序、并发或生命周期前提；排查时应先确认状态是否仍由正确对象持有，再核对推进条件和清理路径。

## 高频问题

1. HikariCP 为什么快？
   - `ConcurrentBag` 用 thread-local、本地性、CAS 和等待通知降低共享竞争：`ConcurrentBag.java:139-229`。
2. 为什么不直接返回物理 Connection？
   - 代理需要捕获 close、状态变化、打开 Statement 和泄漏任务：`ProxyConnection.java:240-262`。
3. 连接关闭时做什么？
   - rollback、关闭 Statement、按 dirty bits 重置，然后 `HikariPool.recycle`：`ProxyConnection.java:240-262`、`HikariPool.java:434-447`。
4. maxLifetime 和 keepalive 如何工作？
   - `createPoolEntry` 安排独立任务：`HikariPool.java:485-503`；任务通过 soft eviction 关闭：`:614-630`。
5. 为什么配置启动后不能随意变更？
   - `validate` 后 `seal`，避免池状态与配置容量脱节：`HikariDataSource.java:76-83`、`HikariConfig.java:1010-1045`。

## 故障分析题

### 获取连接超时

先看 `connectionTimeout` 和 Wait 指标，再看 active 是否达到 maxPoolSize、是否存在连接泄漏、数据库响应是否变慢。`HikariPool#getConnection` 的等待和超时路径在 `HikariPool.java:152-183`。

### 连接状态串线

检查业务是否关闭连接、代理是否记录 dirty bits、`PoolBase#resetConnectionState` 是否执行，以及驱动是否在 setter/rollback 时抛错：`PoolEntry.java:104-106`、`PoolBase.java:213`。

### 数据库连接周期性尖峰

检查 maxLifetime、keepalive 和 HouseKeeper 是否同时触发，尤其关注连接创建任务和数据库端连接上限。随机化生命周期在 `HikariPool.java:498-503`。

## 设计题

### 如何增加连接标签

不要改 `ConcurrentBag` 状态机。可以在 `PoolEntry` 或 metrics tracker 旁路记录标签；如果标签影响租户隔离，则必须重新评估连接复用边界和状态重置成本。

### 如何增加自定义健康检查

优先接入 `MetricsTrackerFactory` 或池外探针，不要在每次 borrow 都执行额外 SQL。若必须主动探测，应放入 keepalive/维护周期并设置严格超时。

## 边界与踩坑

| 问题 | 判断重点 |
| --- | --- |
| 连接泄漏 | leak task 日志、调用栈、业务持有时间 |
| 池过小 | Wait/Timeout、active、数据库 CPU |
| 池过大 | 数据库连接上限、上下文切换和空闲资源 |
| 驱逐异常 | soft eviction 是否等待归还、closureReason |

## 可迁移知识

HikariCP 的源码题可以归纳为四个不变量：一个条目只能被一个线程借用；代理关闭必须最终归还；归还前必须清理状态；后台驱逐不能粗暴打断使用中的资源。

> **面试锚点**
> - `ConcurrentBag` 的核心优化是什么？
> - 如何保证连接状态不跨请求泄漏？
> - soft eviction 为什么比直接关闭更安全？
> - 连接池应该如何选择最大连接数？

## Related

- [整体架构](/notes/source/java/storage/hikaricp/architecture/)
- [ConcurrentBag 并发容器](/notes/source/java/storage/hikaricp/concurrent-bag/)
- [代理、状态重置与泄漏检测](/notes/source/java/storage/hikaricp/proxy-reset-leak/)
