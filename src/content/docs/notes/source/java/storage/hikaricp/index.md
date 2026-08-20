---
title: HikariCP
description: HikariCP 源码解析总览：配置初始化、ConcurrentBag、连接借还、代理重置、故障检测与指标。
category: Backend
tags: [Source Reading, Java, HikariCP, Database]
order: 4
updatedDate: 2026-08-20
difficulty: advanced
status: stable
lastReviewed: 2026-08-20
draft: false
sidebar:
  order: 4
---

HikariCP 把连接池的核心热路径压缩到一个低竞争资源容器和一个清晰的连接生命周期：配置完成后封存，借出时包装代理，归还时重置状态，后台任务负责驱逐、保活和补充。

<!-- more -->

## 本册问题地图

HikariCP 的关键不是“连接池 API”，而是高并发下连接从可用到失效的状态管理：

1. **ConcurrentBag 优化了什么？** 优先从线程熟悉的连接和等待线程中快速匹配，减少热路径竞争；它不是完全无锁，也不能消除数据库连接创建成本。
2. **连接何时创建、借出、归还和驱逐？** 池启动和补充任务负责创建，业务线程借用后必须归还，生命周期、空闲和健康检查决定何时淘汰。
3. **为什么代理归还要 reset？** 一个请求改变的事务、只读、隔离级别等状态必须清掉，否则下一个请求会继承隐式上下文。
4. **keepalive 与 maxLifetime 如何配合？** 前者防止长期空闲连接被网络设备清理，后者错峰淘汰老连接；两者都不能修复数据库本身不可用。
5. **泄漏检测如何解释？** 它发现的是连接长期未归还的迹象，慢 SQL 或长事务可能是合法占用，必须结合调用栈和业务时长判断。

## 版本快照

| 项 | 值 |
| --- | --- |
| 仓库 | `brettwooldridge/HikariCP` |
| 本地路径 | `E:\source\java\storage\hikaricp` |
| 分支 | `dev` |
| Commit | `a4d93f4f85517f90e632b795486d7102e933d7ff`（2026-06-15） |
| 最近 tag | `HikariCP-7.1.0` |

> 本册坐标均基于上述 commit；上游演进后行号可能漂移。

## 模块地图

| 模块 | 职责 | 关键类 |
| --- | --- | --- |
| 配置 | 校验、默认值和不可变封存 | `HikariConfig`、`HikariDataSource` |
| 池核心 | 创建、借还、驱逐和关闭 | `HikariPool`、`PoolBase` |
| 并发容器 | 低竞争资源分配 | `ConcurrentBag` |
| 资源条目 | 连接状态、生命周期任务 | `PoolEntry` |
| JDBC 代理 | 状态追踪、重置和泄漏检测 | `ProxyConnection`、`ProxyStatement` |
| 指标 | 等待、使用、创建、超时和池状态 | `MetricsTracker`、`PoolStats` |

## 读码入口顺序

1. `HikariDataSource#getConnection`：延迟启动和配置封存。
2. `HikariPool#getConnection`：等待、借出和代理创建。
3. `ConcurrentBag#borrow/requite`：理解热路径。
4. `ProxyConnection#close`：连接关闭为何变成回收与重置。
5. `HouseKeeper`、`MaxLifetimeTask`、`KeepaliveTask`：后台维护。
6. `MetricsTracker` 与 `PoolStats`：指标如何不侵入池逻辑。

## 本册目录

- [整体架构](/notes/source/java/storage/hikaricp/architecture/)
- [配置与启动](/notes/source/java/storage/hikaricp/config-startup/)
- [ConcurrentBag 并发容器](/notes/source/java/storage/hikaricp/concurrent-bag/)
- [连接借还生命周期](/notes/source/java/storage/hikaricp/connection-lifecycle/)
- [代理、状态重置与泄漏检测](/notes/source/java/storage/hikaricp/proxy-reset-leak/)
- [保活、驱逐与故障检测](/notes/source/java/storage/hikaricp/eviction-keepalive/)
- [指标与 JMX](/notes/source/java/storage/hikaricp/metrics-jmx/)
- [面试专题](/notes/source/java/storage/hikaricp/interview/)

## 横向对照

| 对象 | 对照点 |
| --- | --- |
| Druid | Druid 横切能力更丰富；HikariCP 更聚焦连接池热路径 |
| ShardingSphere | HikariCP 管理物理连接；ShardingSphere 管理 SQL 路由和执行上下文 |
| ConcurrentHashMap | 都强调低锁竞争，但 `ConcurrentBag` 还要表达资源借用状态和等待唤醒 |

## Related

- [Druid](/notes/source/java/storage/druid/)
- [存储与 ORM](/notes/source/java/storage/)
- [ShardingSphere](/notes/source/java/storage/shardingsphere/)
