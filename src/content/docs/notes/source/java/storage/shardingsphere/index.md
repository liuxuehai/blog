---
title: ShardingSphere
description: ShardingSphere 源码解析总览：JDBC 入口、ANTLR 解析、路由改写、归并执行、分布式事务与治理。
category: Backend
tags: [Source Reading, Java, ShardingSphere, Database]
order: 2
updatedDate: 2026-08-16
difficulty: advanced
status: stable
lastReviewed: 2026-08-16
draft: false
sidebar:
  order: 2
---

ShardingSphere 把一个 JDBC SQL 请求拆成解析、路由、改写、执行和结果归并五个阶段，在不改变业务访问方式的前提下，把逻辑表映射到多个真实数据源。当前源码还把事务、SPI 扩展和 Mode 持久化作为独立边界，形成可组合的数据库中间件内核。

<!-- more -->

## 版本快照

| 项 | 值 |
| --- | --- |
| 仓库 | `apache/shardingsphere` |
| 本地路径 | `E:\source\java\storage\shardingsphere` |
| 分支 | `master` |
| Commit | `9b423bee2b930b3f0cd9b637682b5abaf4ebcd5c`（2026-08-14） |
| 最近 tag | `4.0.0-RC2`（浅克隆祖先参考，不代表当前 release） |

> 本册坐标均基于上述 commit。上游演进后行号可能漂移，类名和阶段边界更稳定。

## 它解决什么问题

- 应用只写逻辑表名，但真实表和数据源可能按分片规则展开成多个执行单元。
- 一条 SQL 可能需要改写表名、补充参数、拆成多条 SQL，JDBC 结果又必须恢复成一个可迭代结果。
- 本地事务、XA、Seata AT 和集群治理需要共享元数据，但不能把所有实现硬编码进 JDBC 类。

## 模块地图

| 模块 | 职责 | 关键包 |
| --- | --- | --- |
| `jdbc` | Driver、Connection、Statement 和执行门面 | `org.apache.shardingsphere.driver` |
| `infra/parser` + `parser/sql` | SQL/DistSQL 解析与 AST | `org.apache.shardingsphere.infra.parser` |
| `infra/route` | SPI 路由器与 `RouteContext` | `org.apache.shardingsphere.infra.route` |
| `infra/rewrite` | SQL Token、参数和方言改写 | `org.apache.shardingsphere.infra.rewrite` |
| `infra/executor` + `jdbc/executor` | 执行单元、连接和 JDBC 执行 | `org.apache.shardingsphere.infra.executor` |
| `infra/merge` | 多结果集归并和结果装饰 | `org.apache.shardingsphere.infra.merge` |
| `kernel/transaction` + `mode` | 分布式事务、状态和持久化 | `org.apache.shardingsphere.transaction` |

## 读码入口顺序

1. `ShardingSphereDriver#connect`：JDBC URL 如何得到逻辑连接。
2. `ShardingSphereStatement#executeQuery`：请求如何进入 `DriverExecutorFacade`。
3. `KernelProcessor#generateExecutionContext`：解析后的上下文如何变成执行上下文。
4. `ShardingSphereSQLParserEngine#parse`：数据库 SQL 与 DistSQL 的双路解析。
5. `SQLRouteEngine#route`：规则 SPI 如何产出 `RouteUnit`。
6. `SQLRewriteEntry#rewrite`：路由结果如何变成实际 SQL 和参数。
7. `MergeEngine#merge`：多个 `QueryResult` 如何暴露成一个 `MergedResult`。
8. `DriverDatabaseConnectionManager#commit`：跨物理连接事务如何收口。

## 本册目录

- [整体架构](/notes/source/java/storage/shardingsphere/architecture/)
- [SQL 解析与 AST](/notes/source/java/storage/shardingsphere/sql-parser/)
- [路由引擎](/notes/source/java/storage/shardingsphere/route-engine/)
- [SQL 改写引擎](/notes/source/java/storage/shardingsphere/rewrite-engine/)
- [归并引擎](/notes/source/java/storage/shardingsphere/merge-engine/)
- [分布式事务](/notes/source/java/storage/shardingsphere/distributed-transaction/)
- [治理与 Mode](/notes/source/java/storage/shardingsphere/governance/)
- [执行引擎](/notes/source/java/storage/shardingsphere/execution-engine/)
- [面试专题](/notes/source/java/storage/shardingsphere/interview/)

## 横向对照

| 对象 | 对照点 |
| --- | --- |
| MyBatis | 都保留 JDBC 边界；MyBatis 重点是 Mapper/Executor，ShardingSphere 重点是 SQL 物理化 |
| Druid | 都解析 SQL；Druid 更偏 Parser/连接池/防火墙，ShardingSphere 继续做分布式路由与结果语义 |
| Seata | 都处理分布式事务；ShardingSphere 将事务实现接入 JDBC 数据库连接和规则上下文 |

## Related

- [存储与 ORM](/notes/source/java/storage/)
- [MyBatis](/notes/source/java/storage/mybatis-3/)
- [Seata 源码解析](/notes/source/java/rpc/seata/)