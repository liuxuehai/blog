---
title: SQL 解析与 AST
description: ANTLR 词法与语法、解析树缓存、SQLStatementContext 以及 DistSQL 回退路径。
category: Backend
tags: [Source Reading, ShardingSphere, ANTLR, SQL]
order: 22
updatedDate: 2026-08-24
difficulty: advanced
status: stable
lastReviewed: 2026-08-24
draft: false
sidebar:
  order: 22
---

解析阶段把数据库方言 SQL 转成统一的 `SQLStatement` 和上下文。ShardingSphere 还把 DistSQL 纳入同一入口：普通 SQL 解析失败后，再尝试治理语句解析，而不是把两套调用协议暴露给 JDBC 层。

<!-- more -->

## 先给答案：解析阶段把数据库方言 SQL 转成统一的 SQLStatement 和上下文

解析阶段把数据库方言 SQL 转成统一的 SQLStatement 和上下文。ShardingSphere 还把 DistSQL 纳入同一入口：普通 SQL 解析失败后，再尝试治理语句解析，而不是把两套调用协议暴露给 JDBC 层。 正文沿“设计概览 -> 实现拆解 -> 为什么要做解析树缓存”展开：先确认入口和状态归属，再跟踪控制流或数据流的推进，最后落到对外可观察的结果。

主要失效边界集中在“SQL 动态文本很多、方言不支持、DistSQL 与普通 SQL 混淆”这些场景。它们破坏的是容量、顺序、并发或生命周期前提；排查时应先确认状态是否仍由正确对象持有，再核对推进条件和清理路径。

## 设计概览

```text
SQL text
  -> database SQLStatementParserEngine
       -> lexer -> token stream -> ANTLR parser -> AST
  -> failure?
       -> DistSQLStatementParserEngine
  -> SQLStatement
       -> SQLStatementContext
```

## 实现拆解

1. `ShardingSphereSQLParserEngine` 持有普通 SQL 和 DistSQL 两个解析器：`infra/parser/src/main/java/org/apache/shardingsphere/infra/parser/ShardingSphereSQLParserEngine.java:34`、`:40`。
2. 普通 SQL 解析调用数据库类型对应的 `SQLStatementParserEngine`：`ShardingSphereSQLParserEngine.java:51`、`:53`。
3. 捕获 `SQLParsingException` 与 `ParseCancellationException` 后，对去除首尾空白的 SQL 尝试 DistSQL：`ShardingSphereSQLParserEngine.java:55`、`:57`。
4. 底层 `SQLParserEngine` 根据 `useCache` 决定读取缓存还是直接解析：`parser/sql/engine/core/src/main/java/org/apache/shardingsphere/sql/parser/engine/api/SQLParserEngine.java:30`、`:61`。
5. `SQLParserFactory` 通过 Lexer/Parser 类反射创建实例：`parser/sql/engine/core/src/main/java/org/apache/shardingsphere/sql/parser/engine/core/SQLParserFactory.java:51`、`:56`。
6. 工厂给 ANTLR Parser 设置 `BailErrorStrategy` 并移除控制台错误监听器：`SQLParserFactory.java:57`、`:59`。
7. `SQLParserEngine` 的 `parseTreeCache` 使用 `ParseTreeCacheBuilder` 构建：`SQLParserEngine.java:34`、`:36`。
8. 上层 `SQLParserEngine` 接口把缓存策略隐藏在 `parse(String, boolean)` 合同之后：`infra/parser/src/main/java/org/apache/shardingsphere/infra/parser/SQLParserEngine.java:25`、`:34`。

## 为什么要做解析树缓存

**替代方案**：每次 JDBC 执行都重新跑 Lexer、Parser 和 AST 转换。
**为什么不行**：预编译语句和重复 SQL 会反复支付语法分析成本，且解析树是规则路由和改写的共同输入。
**证据**：`SQLParserEngine` 在构造时创建 `parseTreeCache`，`parse` 根据 `useCache` 选择 `parseTreeCache.get(sql)` 或 `sqlParserExecutor.parse(sql)`：`parser/sql/engine/core/src/main/java/org/apache/shardingsphere/sql/parser/engine/api/SQLParserEngine.java:34`、`:61`。

## 参数与边界

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| SQL 动态文本很多 | 缓存命中率低、内存上涨 | SQL 字符串本身是 cache key | 优先使用 PreparedStatement 和合理缓存上限 |
| 方言不支持 | 普通解析抛异常 | Lexer/Parser grammar 覆盖有限 | 使用对应数据库类型或升级方言模块 |
| DistSQL 与普通 SQL 混淆 | 解析后进入错误处理链 | 两类语句由不同 grammar 负责 | 统一从 `ShardingSphereSQLParserEngine` 进入 |
| 语法错误 | 直接取消而非恢复 | `BailErrorStrategy` 快速失败 | 在 API 边界转换为可诊断的 SQL 异常 |

## 可迁移知识

编译器、配置语言和协议解析都可以采用“类型选择器 + 可选缓存 + 快速失败 + 专用回退 grammar”的结构。缓存应绑定稳定输入，不能把含随机值或高基数文本无上限放入缓存。

> **面试锚点**
> - ShardingSphere 为什么同时有普通 SQL 和 DistSQL 解析入口？
> - ANTLR 的 Lexer、TokenStream、Parser 在源码中如何组装？
> - 解析树缓存的 key 和失效风险是什么？

## Related

- [整体架构](/notes/source/java/storage/shardingsphere/architecture/)
- [路由引擎](/notes/source/java/storage/shardingsphere/route-engine/)
- [治理与 Mode](/notes/source/java/storage/shardingsphere/governance/)