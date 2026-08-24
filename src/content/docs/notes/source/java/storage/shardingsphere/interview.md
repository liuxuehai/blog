---
title: 面试专题
description: ShardingSphere 高频面试题：SQL 生命周期、路由改写、归并执行、事务与治理。
category: Backend
tags: [Source Reading, ShardingSphere, Interview, Database]
order: 29
updatedDate: 2026-08-24
difficulty: advanced
status: stable
lastReviewed: 2026-08-24
draft: false
sidebar:
  order: 29
---

ShardingSphere 面试题的关键不是背“分库分表”，而是能说明逻辑 SQL 如何变成物理执行单元，以及每个阶段为什么保持独立。

<!-- more -->

## 先给答案：ShardingSphere 面试题的关键不是背“分库分表”，而是能说明逻辑 SQL 如何变成物理执行单元…

ShardingSphere 面试题的关键不是背“分库分表”，而是能说明逻辑 SQL 如何变成物理执行单元，以及每个阶段为什么保持独立。 正文沿“高频题 -> 高难追问 -> 场景题”展开：先确认入口和状态归属，再跟踪控制流或数据流的推进，最后落到对外可观察的结果。

主要失效边界集中在“线上出现跨库查询变慢，怎么排查、跨分片写入部分成功怎么办”这些场景。它们破坏的是容量、顺序、并发或生命周期前提；排查时应先确认状态是否仍由正确对象持有，再核对推进条件和清理路径。

## 高频题

### 一条 SQL 如何被执行？

**30 秒版**：JDBC Statement 先生成 `QueryContext`，再经过解析、路由和改写生成 `ExecutionContext`。执行准备引擎把它拆成 `JDBCExecutionUnit`，真实数据库返回 `QueryResult` 后由 `MergeEngine` 归并。

**展开**：入口在 `ShardingSphereStatement#executeQuery`，执行门面选择 query executor，`KernelProcessor` 组织 route/rewrite，最后 JDBC executor 执行物理 SQL：`jdbc/src/main/java/org/apache/shardingsphere/driver/jdbc/core/statement/ShardingSphereStatement.java:114`、`infra/context/src/main/java/org/apache/shardingsphere/infra/connection/kernel/KernelProcessor.java:53`。

**加分项**：路由和改写都使用结构化上下文，不是对 JDBC 字符串做多次 replace。

**常见错答**：说“路由阶段直接执行数据库”，忽略了执行准备和归并。

### 路由和改写有什么区别？

**30 秒版**：路由决定访问哪些真实数据源/表，改写决定下发的具体 SQL 和参数。前者产出 `RouteContext`，后者产出 `SQLRewriteUnit`。

**展开**：`SQLRouteEngine#route` 通过规则 SPI 生成 `RouteUnit`；`SQLRewriteEntry#rewrite` 再根据路由选择 `RouteSQLRewriteEngine`：`infra/route/core/src/main/java/org/apache/shardingsphere/infra/route/engine/SQLRouteEngine.java:89`、`infra/rewrite/core/src/main/java/org/apache/shardingsphere/infra/rewrite/SQLRewriteEntry.java:69`。

**加分项**：改写阶段还可能按数据源合并成 `UNION ALL`，因此不是“一条路由单元对应一条 SQL”这么简单。

**常见错答**：把真实表名替换直接归为路由。

### 为什么需要归并引擎？

**30 秒版**：多个物理查询必须重新提供一个 JDBC ResultSet 语义。排序、分页、聚合和流式读取需要不同算法，因此通过 `MergedResult` 和 ResultMerger SPI 解耦。

**展开**：`MergeEngine#merge` 找到规则对应的 `ResultMergerEngine` 后返回具体 `MergedResult`，无匹配时使用透明结果：`infra/merge/src/main/java/org/apache/shardingsphere/infra/merge/MergeEngine.java:81`、`:89`。

**加分项**：归并后还可以通过 `ResultDecorator` 做额外语义处理。

**常见错答**：认为多个 ResultSet 可以直接串接而不需要处理列和排序语义。

### ShardingSphere 如何支持多种事务？

**30 秒版**：连接管理器协调物理连接，事务引擎通过 `TransactionType` 和 SPI 选择 LOCAL、XA 或 AT 实现。XA 将全局提交委托给 JTA provider，而不是让多个 JDBC connection 独立提交。

**展开**：`DriverDatabaseConnectionManager#commit` 先处理物理连接，再调用事务对象；`ShardingSphereTransactionManagerEngine` 只在非 LOCAL 时装载分布式管理器：`jdbc/src/main/java/org/apache/shardingsphere/driver/jdbc/core/connection/DriverDatabaseConnectionManager.java:152`、`kernel/transaction/core/src/main/java/org/apache/shardingsphere/transaction/ShardingSphereTransactionManagerEngine.java:39`。

**加分项**：`rollbackOnly` 会让 XA manager 的 commit 分支转为 rollback。

**常见错答**：把本地多连接 commit 当成两阶段提交。

## 高难追问

### 解析缓存会不会导致内存问题？

**30 秒版**：会，SQL 文本作为缓存 key，动态拼接 SQL 会造成高基数。应优先使用 PreparedStatement，并设置合理缓存上限。

**源码依据**：`SQLParserEngine` 用 `ParseTreeCacheBuilder` 创建缓存，并在 `parse` 中按 `useCache` 读取：`parser/sql/engine/core/src/main/java/org/apache/shardingsphere/sql/parser/engine/api/SQLParserEngine.java:34`、`:61`。

### 为什么路由使用入口/装饰两类 SPI？

**30 秒版**：入口路由建立初始映射，装饰路由在已有结果上叠加数据源或策略。这样分片、读写分离等规则可以组合，而不是互相覆盖。

**源码依据**：`SQLRouteEngine` 只有在路由单元为空时调用 `EntranceSQLRouter`，否则调用 `DecorateSQLRouter`：`infra/route/core/src/main/java/org/apache/shardingsphere/infra/route/engine/SQLRouteEngine.java:111`、`:114`。

### 为什么 SQL 改写需要参数重写器？

**30 秒版**：SQL 结构变化会改变参数位置和数量，例如生成键、分页或聚合改写。只改文本会让 PreparedStatement 绑定错位，所以必须让 `ParameterBuilder` 与 SQL Token 同步工作。

**源码依据**：`RouteSQLRewriteEngine#getParameters` 通过 `ParameterBuilder` 生成路由参数：`infra/rewrite/core/src/main/java/org/apache/shardingsphere/infra/rewrite/engine/RouteSQLRewriteEngine.java:163`、`:167`。

## 场景题

### 线上出现跨库查询变慢，怎么排查？

先看路由单元数量，再看是否触发 `UNION ALL` 聚合改写，最后检查归并策略是否把结果全部加载到内存。源码证据分别落在 `SQLRouteEngine#route`、`RouteSQLRewriteEngine#createAggregatedRewriteUnits` 和 `MergeEngine#merge`。

### 跨分片写入部分成功怎么办？

先确认事务类型；LOCAL 只能协调物理连接，不能提供跨库原子性。若业务要求强一致，评估 XA；若接受最终一致或补偿，评估 AT/TCC 等协议，并记录每个执行单元的成功状态。

## 反向问面试官

- 你们使用 JDBC、Proxy 还是两者同时部署？
- 分片规则是否允许跨库排序、聚合和分页？
- 事务场景更看重强一致、吞吐还是故障恢复？

## Related

- [整体架构](/notes/source/java/storage/shardingsphere/architecture/)
- [分布式事务](/notes/source/java/storage/shardingsphere/distributed-transaction/)
- [执行引擎](/notes/source/java/storage/shardingsphere/execution-engine/)