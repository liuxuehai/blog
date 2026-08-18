---
title: SQL 改写引擎
description: SQL Token、实际表名替换、参数重排、UNION ALL 聚合与方言翻译。
category: Backend
tags: [Source Reading, ShardingSphere, SQL Rewrite, JDBC]
order: 24
updatedDate: 2026-08-16
difficulty: advanced
status: stable
lastReviewed: 2026-08-16
draft: false
sidebar:
  order: 24
---

改写阶段把“逻辑 SQL + 路由结果”变成可直接发送给真实数据库的 SQL 和参数。它同时处理文本 Token 替换、参数顺序、生成键和跨分片查询的聚合改写。

<!-- more -->

## 调用链

```text
SQLRewriteEntry.rewrite
  -> create SQLRewriteContext
  -> decorators add tokens/parameters
  -> route empty? GenericSQLRewriteEngine
  -> route exists? RouteSQLRewriteEngine
  -> SQLRewriteUnit(sql, parameters)
```

## 实现拆解

- `SQLRewriteEntry` 收集规则提供的 `SQLRewriteContextDecorator`：`infra/rewrite/core/src/main/java/org/apache/shardingsphere/infra/rewrite/SQLRewriteEntry.java:53`、`:59`。
- `rewrite` 先创建上下文，再根据是否存在路由单元选择通用或路由改写引擎：`SQLRewriteEntry.java:69`、`:72`、`:73`。
- Hint 可以跳过 SQL 改写，说明改写不是不可绕过的黑盒：`SQLRewriteEntry.java:79`、`:80`。
- 路由改写引擎为每个 `RouteUnit` 创建 `SQLRewriteUnit`：`infra/rewrite/core/src/main/java/org/apache/shardingsphere/infra/rewrite/engine/RouteSQLRewriteEngine.java:76`、`:81`。
- 当多个路由单元可以合并时，改写器按批次拼接 `UNION ALL`：`RouteSQLRewriteEngine.java:85`、`:121`、`:150`。
- SQL 文本由 `SQLBuilderEngine` 根据 Token 生成实际 SQL：`RouteSQLRewriteEngine.java:159`、`:160`。
- 参数由 `ParameterBuilder` 生成，并根据路由单元决定参数顺序：`RouteSQLRewriteEngine.java:163`、`:167`。
- 没有路由单元时，`GenericSQLRewriteEngine` 仍会做 Token 和方言翻译：`infra/rewrite/core/src/main/java/org/apache/shardingsphere/infra/rewrite/engine/GenericSQLRewriteEngine.java:56`、`:63`。

## 为什么不直接替换字符串

**替代方案**：用字符串 `replace` 把逻辑表名替换成真实表名，并按出现次数重排参数。
**为什么不行**：表名可能出现在别名、字符串字面量、子查询和注释中；参数还可能被生成键、分页或聚合改写插入，纯字符串替换无法保持 SQL 语义。
**证据**：源码采用 `SQLRewriteContext`、Token builder 和 `ParameterBuilder`，并在 `RouteSQLRewriteEngine` 中先构造 `SQLRewriteUnit` 再执行：`infra/rewrite/core/src/main/java/org/apache/shardingsphere/infra/rewrite/engine/RouteSQLRewriteEngine.java:140`、`:159`、`:163`。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| 绑定参数顺序变化 | JDBC 报参数类型或值错误 | SQL Token 与参数重写未同步 | 同时验证 SQL 和参数列表 |
| 跨分片聚合 | 生成多条 SQL 或 `UNION ALL` | 单条 SQL 无法覆盖多个物理表 | 评估单库 union 上限和数据库执行计划 |
| Hint 跳过改写 | 逻辑表名直接下发 | `isSkipSQLRewrite` 生效 | 只对已物理化 SQL 使用该能力 |
| 方言差异 | 下游数据库拒绝 SQL | 翻译规则不完整 | 在目标数据库类型测试实际 SQL |

## 可迁移知识

编译器中的“Token 修改 + 参数环境”比字符串替换可靠；任何需要同时改变文本和伴随数据的系统，都应把两者建模成同一中间表示，例如模板渲染、查询优化和协议字段重排。

> **面试锚点**
> - SQL 改写为什么需要 Token，而不是字符串替换？
> - `GenericSQLRewriteEngine` 和 `RouteSQLRewriteEngine` 的分工是什么？
> - `UNION ALL` 聚合改写的收益和代价是什么？

## Related

- [路由引擎](/notes/source/java/storage/shardingsphere/route-engine/)
- [归并引擎](/notes/source/java/storage/shardingsphere/merge-engine/)
- [执行引擎](/notes/source/java/storage/shardingsphere/execution-engine/)