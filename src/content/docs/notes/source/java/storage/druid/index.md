---
title: Druid
description: Druid 源码解析总览：连接池、JDBC 代理、SQL Parser、防火墙、统计与 Web 监控。
category: Backend
tags: [Source Reading, Java, Druid, Database]
order: 3
updatedDate: 2026-08-16
difficulty: advanced
status: stable
lastReviewed: 2026-08-16
draft: false
sidebar:
  order: 3
---

Druid 将数据库访问拆成连接池、JDBC 对象代理、过滤器链、SQL AST、安全检查和统计监控几层。它既是连接池，也是一个能够观察并约束 JDBC 行为的数据库访问基础设施。

<!-- more -->

## 版本快照

| 项 | 值 |
| --- | --- |
| 仓库 | `alibaba/druid` |
| 本地路径 | `E:\source\java\storage\druid` |
| 分支 | `master` |
| Commit | `fa8dc9912637a2f729eef9f55356621fec18d40e`（2026-08-01） |
| 最近 tag | `1.2.28` |

> 本册坐标均基于上述 commit；行号随上游演进可能漂移。

## 模块地图

| 模块 | 职责 | 关键类 |
| --- | --- | --- |
| `pool` | 连接创建、借还、回收和缩容 | `DruidDataSource`、`DruidPooledConnection` |
| `proxy` | 包装 Connection、Statement、ResultSet | `ConnectionProxyImpl`、`StatementProxyImpl` |
| `filter` | 统一扩展链 | `FilterChainImpl`、`Filter` |
| `sql` | SQL Parser、方言和 AST | `SQLUtils`、`SQLStatementParser` |
| `wall` | 基于 AST 的 SQL 安全策略 | `WallFilter`、`WallProvider` |
| `stat` | SQL、连接和结果集统计 | `StatFilter`、`DruidDataSourceStatManager` |
| `support/http` | Web 统计与管理 | `StatViewServlet`、`WebStatFilter` |

## 读码入口顺序

1. `DruidDataSource#getConnection`：先看连接如何借出。
2. `DruidPooledConnection#close`：理解关闭为何变成回收。
3. `ConnectionProxyImpl` 和 `FilterChainImpl`：跟踪 JDBC 调用如何逐层穿透。
4. `SQLUtils#parseStatements`：从 SQL 字符串进入 AST。
5. `WallProvider#check`、`StatFilter`：看安全和统计如何复用过滤器链。
6. Web Servlet：确认监控层如何消费统计对象。

## 本册目录

- [整体架构](/notes/source/java/storage/druid/architecture/)
- [连接池生命周期](/notes/source/java/storage/druid/connection-pool/)
- [JDBC 代理与过滤器链](/notes/source/java/storage/druid/filter-chain/)
- [SQL Parser 与方言](/notes/source/java/storage/druid/sql-parser/)
- [AST 与 Visitor](/notes/source/java/storage/druid/sql-ast/)
- [Wall 防火墙](/notes/source/java/storage/druid/wall-firewall/)
- [StatFilter 统计](/notes/source/java/storage/druid/stat-filter/)
- [Web 统计与管理](/notes/source/java/storage/druid/web-monitoring/)
- [面试专题](/notes/source/java/storage/druid/interview/)

## 横向对照

| 对象 | 对照点 |
| --- | --- |
| HikariCP | Druid 过滤器、SQL 解析和 Web 监控更重；HikariCP 更专注连接池热路径 |
| ShardingSphere | Druid 负责 JDBC 观察与约束；ShardingSphere 继续做路由、改写和归并 |
| MyBatis | MyBatis 在上层组织 Mapper 和 Executor；Druid 位于 JDBC 访问边界 |

## Related

- [存储与 ORM](/notes/source/java/storage/)
- [ShardingSphere](/notes/source/java/storage/shardingsphere/)
- [Redisson](/notes/source/java/storage/redisson/)
