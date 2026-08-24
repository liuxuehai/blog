---
title: 执行引擎
description: ExecutionContext、JDBCExecutionUnit、连接准备、批量执行和原始下推路径。
category: Backend
tags: [Source Reading, ShardingSphere, Execution, JDBC]
order: 28
updatedDate: 2026-08-24
difficulty: advanced
status: stable
lastReviewed: 2026-08-24
draft: false
sidebar:
  order: 28
---

执行引擎把改写结果落实为真实连接上的 JDBC 操作。它将准备、分组、执行回调和事务处理拆开，查询、更新和通用 `execute` 可以共享相同的执行单元模型。

<!-- more -->

## 先给答案：执行引擎把改写结果落实为真实连接上的 JDBC 操作

执行引擎把改写结果落实为真实连接上的 JDBC 操作。它将准备、分组、执行回调和事务处理拆开，查询、更新和通用 execute 可以共享相同的执行单元模型。 正文沿“执行链 -> 实现拆解 -> 为什么要先准备执行单元”展开：先确认入口和状态归属，再跟踪控制流或数据流的推进，最后落到对外可观察的结果。

主要失效边界集中在“连接数过多、批量 SQL、Raw 下推”这些场景。它们破坏的是容量、顺序、并发或生命周期前提；排查时应先确认状态是否仍由正确对象持有，再核对推进条件和清理路径。

## 执行链

```text
SQLRewriteUnit
  -> DriverExecutionPrepareEngine
  -> JDBCExecutionUnit(connection, statement)
  -> ExecutionGroupContext
  -> JDBCExecutor
  -> callback
  -> QueryResult / update count
```

## 实现拆解

- `DriverExecutorFacade` 初始化 JDBC executor、Raw executor 和 SQL Federation engine：`jdbc/src/main/java/org/apache/shardingsphere/driver/executor/engine/facade/DriverExecutorFacade.java:79`、`:84`、`:85`。
- Query、update、execute 分别委托不同执行器，但都先创建 `DriverExecutionPrepareEngine`：`DriverExecutorFacade.java:104`、`:125`、`:144`、`:150`。
- 查询下推执行器将执行分组交给 `JDBCExecutor`：`jdbc/src/main/java/org/apache/shardingsphere/driver/executor/engine/pushdown/jdbc/DriverJDBCPushDownExecuteQueryExecutor.java:92`、`:116`。
- 更新下推执行器也通过同一 JDBC executor 返回更新计数：`jdbc/src/main/java/org/apache/shardingsphere/driver/executor/engine/pushdown/jdbc/DriverJDBCPushDownExecuteUpdateExecutor.java:72`、`:111`。
- `ExecutionPrepareEngine` 定义准备阶段的通用合同：`infra/executor/src/main/java/org/apache/shardingsphere/infra/executor/sql/prepare/ExecutionPrepareEngine.java:24`。
- `JDBCExecutionUnit` 表达单个物理连接上的 JDBC 执行目标：`infra/executor/src/main/java/org/apache/shardingsphere/infra/executor/sql/execute/engine/driver/jdbc/JDBCExecutionUnit.java:27`。
- `ExecutionContext` 汇总查询上下文和执行单元：`infra/executor/src/main/java/org/apache/shardingsphere/infra/executor/sql/context/ExecutionContext.java:31`。

## 为什么要先准备执行单元

**替代方案**：路由阶段直接打开连接并立即执行 SQL。
**为什么不行**：路由/改写还可能产生多个物理 SQL，需要统一处理连接复用、最大连接数、批量分组、事务和执行监听；提前执行会让规划阶段无法回滚或重排。
**证据**：执行门面先创建 `DriverExecutionPrepareEngine`，再将 `JDBCExecutionUnit` 交给查询/更新执行器：`jdbc/src/main/java/org/apache/shardingsphere/driver/executor/engine/facade/DriverExecutorFacade.java:125`、`:150`。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| 连接数过多 | 单条查询打开大量连接 | 路由单元数量高 | 调整 max connections per query 和分片键 |
| 批量 SQL | 更新计数与参数组不匹配 | PreparedStatement 参数批次独立 | 验证 batch parameter sets |
| Raw 下推 | 绕过部分改写/归并 | 选择了 raw executor 路径 | 只对已是物理 SQL 的语句使用 |
| 执行异常 | 部分分片已成功 | 多执行单元不是天然原子 | 结合事务类型和重试策略 |

## 可迁移知识

将“计划生成”和“副作用执行”分离，是编译器、任务调度器和批处理系统的通用设计。执行单元应携带足够的资源定位信息，但不在构建时产生不可逆副作用。

> **面试锚点**
> - `ExecutionContext`、`JDBCExecutionUnit`、`ExecutionGroupContext` 各自是什么？
> - 为什么查询和更新使用不同 executor？
> - Raw pushdown 路径的风险是什么？

## Related

- [整体架构](/notes/source/java/storage/shardingsphere/architecture/)
- [分布式事务](/notes/source/java/storage/shardingsphere/distributed-transaction/)
- [归并引擎](/notes/source/java/storage/shardingsphere/merge-engine/)