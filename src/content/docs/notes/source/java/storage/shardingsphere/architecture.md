---
title: 整体架构
description: JDBC 请求经过解析、路由、改写、执行与归并的完整链路，以及 SPI 和上下文边界。
category: Backend
tags: [Source Reading, ShardingSphere, Architecture]
order: 21
updatedDate: 2026-08-16
difficulty: advanced
status: stable
lastReviewed: 2026-08-16
draft: false
sidebar:
  order: 21
---

ShardingSphere 的核心不是某一个分片算法，而是把 SQL 生命周期切成可替换阶段。每个阶段通过上下文对象传递中间结果，让规则实现可以在不侵入 JDBC 外壳的情况下参与处理。

<!-- more -->

## 分层

```text
JDBC Driver / Connection / Statement
                |
                v
        QueryContext + metadata
                |
     parse -> route -> rewrite
                |
       ExecutionContext / units
                |
        physical JDBC execution
                |
       QueryResult -> merge -> ResultSet
```

| 层 | 核心职责 | 代表类 |
| --- | --- | --- |
| 接入层 | 兼容 JDBC API，捕获 SQL 和参数 | `ShardingSphereDriver`、`ShardingSphereStatement` |
| 内核层 | 组装请求上下文和执行上下文 | `KernelProcessor` |
| 规划层 | 将逻辑 SQL 物理化 | `ShardingSphereSQLParserEngine`、`SQLRouteEngine`、`SQLRewriteEntry` |
| 执行层 | 连接、Statement、批量与事务 | `DriverExecutorFacade`、`JDBCExecutor` |
| 结果层 | 透明返回、流式/内存归并、装饰 | `MergeEngine`、`MergedResult` |
| 治理层 | SPI、事务类型、状态和持久化 | `TypedSPILoader`、`StatePersistService` |

## 核心抽象

- `QueryContext` 保存 SQL、参数、`SQLStatementContext` 和执行意图，是解析之后各阶段共享的请求对象：`infra/session/src/main/java/org/apache/shardingsphere/infra/session/query/QueryContext.java:30`。
- `RouteContext` 保存 `RouteUnit` 集合和阶段上下文；一个 `RouteUnit` 描述数据源映射与表映射：`infra/route/core/src/main/java/org/apache/shardingsphere/infra/route/context/RouteContext.java:40`、`:152`。
- `SQLRewriteResult` 将改写后的 SQL/参数按路由单元组织，供执行准备引擎消费：`infra/rewrite/core/src/main/java/org/apache/shardingsphere/infra/rewrite/engine/result/SQLRewriteResult.java:23`。
- `ExecutionContext` 是执行阶段输入，包含 `QueryContext` 和执行单元：`infra/executor/src/main/java/org/apache/shardingsphere/infra/executor/sql/context/ExecutionContext.java:31`。

## 主流程一：JDBC 请求

```text
Statement.executeQuery
  -> DriverExecutorFacade
  -> KernelProcessor.generateExecutionContext
  -> SQLParser / SQLRoute / SQLRewrite
  -> DriverExecutionPrepareEngine
  -> JDBCExecutor
  -> MergeEngine
  -> ShardingSphereResultSet
```

1. `ShardingSphereStatement#executeQuery` 创建 `QueryContext` 并调用执行门面：`jdbc/src/main/java/org/apache/shardingsphere/driver/jdbc/core/statement/ShardingSphereStatement.java:114`。
2. `DriverExecutorFacade` 按 query/update/execute 选择不同执行器：`jdbc/src/main/java/org/apache/shardingsphere/driver/executor/engine/facade/DriverExecutorFacade.java:104`、`:125`、`:144`。
3. `KernelProcessor#generateExecutionContext` 串起 route 与 rewrite，再生成 `ExecutionContext`：`infra/context/src/main/java/org/apache/shardingsphere/infra/connection/kernel/KernelProcessor.java:53`、`:91`。
4. JDBC 执行器把 `JDBCExecutionUnit` 分组，交给真实连接执行：`jdbc/src/main/java/org/apache/shardingsphere/driver/executor/engine/pushdown/jdbc/DriverJDBCPushDownExecuteQueryExecutor.java:92`、`:116`。
5. 查询结果交给归并引擎，最终由 JDBC ResultSet 适配器暴露：`infra/merge/src/main/java/org/apache/shardingsphere/infra/merge/MergeEngine.java:81`。

## 启动与扩展点

```text
JDBC URL
  -> ShardingSphereDriver.connect
  -> DataSourceCache
  -> ContextManager / MetaDataContexts
  -> SPI rules + data sources
  -> ShardingSphereConnection
```

| 扩展点 | 接口/机制 | 触发时机 |
| --- | --- | --- |
| SQL 解析 | `SQLStatementParserEngine`、DistSQL facade | 解析 SQL |
| 路由 | `SQLRouter`、`EntranceSQLRouter`、`DecorateSQLRouter` | 计算或修饰路由 |
| 改写 | `SQLRewriteContextDecorator`、Token generator | 生成实际 SQL |
| 归并 | `ResultMergerEngine`、`ResultDecorator` | 合并结果或补充语义 |
| 事务 | `ShardingSphereDistributedTransactionManager` | begin/commit/rollback |
| Mode | `PersistRepository` | 持久化状态和元数据 |

## 为什么用上下文管线而不是让规则直接改 JDBC

**替代方案**：让每个分片规则直接包装 `Statement`，在 JDBC 调用时自行解析、改写和执行。
**为什么不行**：规则之间会共享解析树、路由单元和参数状态，直接改 JDBC 会把方言、事务和归并逻辑耦合到连接对象，难以支持 Proxy、DistSQL 和 SQL Federation。
**证据**：`KernelProcessor` 明确以 `QueryContext -> RouteContext -> SQLRewriteResult -> ExecutionContext` 组装阶段结果，JDBC 只在执行阶段消费 `JDBCExecutionUnit`：`infra/context/src/main/java/org/apache/shardingsphere/infra/connection/kernel/KernelProcessor.java:53`。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| 单库单表 | 不一定经过复杂路由 | `RouteContext` 可退化为单个 `RouteUnit` | 不要用“是否分片”判断是否需要执行上下文 |
| 多真实结果 | JDBC 只返回一个 ResultSet | 必须经过 `MergeEngine` | 关注归并规则与列元数据 |
| 规则顺序 | 同一 SQL 结果不同 | SPI 按 order 装载并分阶段执行 | 查看 `OrderedSPILoader` 和规则 order |
| 事务中途失败 | 部分物理连接已执行 | 本地提交与分布式事务语义不同 | 按事务类型选择 XA/AT，并设计补偿 |

## 可迁移知识

把复杂请求拆成“输入上下文、规划上下文、执行上下文、输出适配器”，可以迁移到查询网关、编译器和多租户数据访问层。阶段间只传稳定数据结构，能让扩展点保持可测试。

> **面试锚点**
> - ShardingSphere 一条 SQL 的五个核心阶段是什么？
> - `RouteContext` 和 `ExecutionContext` 的职责差异是什么？
> - 为什么 JDBC 层不应该直接实现分片算法？

## Related

- [SQL 解析与 AST](/notes/source/java/storage/shardingsphere/sql-parser/)
- [路由引擎](/notes/source/java/storage/shardingsphere/route-engine/)
- [SQL 改写引擎](/notes/source/java/storage/shardingsphere/rewrite-engine/)