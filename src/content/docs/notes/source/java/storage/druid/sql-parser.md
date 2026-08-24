---
title: SQL Parser 与方言
description: Druid 从 SQL 字符串创建方言 Parser、解析多语句并产出 AST 的入口。
category: Backend
tags: [Source Reading, Druid, SQL Parser]
order: 34
updatedDate: 2026-08-24
difficulty: advanced
status: stable
lastReviewed: 2026-08-24
draft: false
sidebar:
  order: 34
---

Druid 的 SQL 解析先选择数据库方言，再由 Parser 将 token 组织成 AST。后续 Wall、格式化、参数化和统计都消费同一棵结构化树，而不是重复扫描字符串。

<!-- more -->

## 先给答案：Druid 的 SQL 解析先选择数据库方言，再由 Parser 将 token 组织成 AST

Druid 的 SQL 解析先选择数据库方言，再由 Parser 将 token 组织成 AST。后续 Wall、格式化、参数化和统计都消费同一棵结构化树，而不是重复扫描字符串。 正文沿“入口 -> 方言分层 -> 为什么先产出 token/AST 而不是直接正则匹配”展开：先确认入口和状态归属，再跟踪控制流或数据流的推进，最后落到对外可观察的结果。

主要失效边界集中在“方言选错、多语句、注释 Hint”这些场景。它们破坏的是容量、顺序、并发或生命周期前提；排查时应先确认状态是否仍由正确对象持有，再核对推进条件和清理路径。

## 入口

- `SQLUtils#parseStatements(String, DbType, SQLParserFeature...)`：`sql/SQLUtils.java:680`。
- 创建 parser、解析 statement list、EOF 检查：`:680-687`。
- `parseSingleStatement`：`:709` 附近。
- 通用 `SQLStatementParser`：`sql/parser/SQLStatementParser.java:49`。
- `parseStatementList`：`:111-131`。
- `parseStatement`：`:5290`。
- MySQL 方言 Parser：`sql/dialect/mysql/parser/MySqlStatementParser.java:50`。
- MySQL `parseStatementListDialect`：`:1046`。

## 方言分层

通用 Parser 处理跨数据库共享语法，方言 Parser 覆盖关键字、函数、Limit、Hint 和特殊 DDL。`SQLUtils` 负责入口统一，方言类负责语法差异，避免上层调用者感知大量 Parser 子类。

## 为什么先产出 token/AST 而不是直接正则匹配

**替代方案**：用正则寻找 `select`、`from`、`where` 等片段。
**为什么不行**：嵌套查询、字符串字面量、注释、函数和方言关键字会让文本位置不等于语义位置。
**证据**：`SQLUtils.java:680` 进入 Parser，`SQLStatementParser.java:111` 解析 statement list，并在入口校验 EOF。

## 多语句与 EOF

解析列表不是简单地“解析第一条然后返回”。Parser 需要决定是否允许多语句，并在结束时确认没有无法消费的 token。Wall 的多语句策略、格式化器和 JDBC 批处理都依赖这个边界。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| 方言选错 | 合法 SQL 解析失败 | 关键字或函数属于特定数据库 | 明确传入 `DbType` |
| 多语句 | 安全检查漏掉后续语句 | 只取第一 AST | 检查 statement list 全部元素 |
| 注释 Hint | SQL 结构被误判 | 注释影响语义或策略 | 使用 Parser feature 控制 |
| 解析失败 | 业务 SQL 直接报错 | Parser 不承诺容错所有扩展 | 记录原 SQL 与数据库类型 |

## 可迁移知识

编译器、策略引擎和配置语言都应把“词法边界”和“语义结构”交给 Parser。上层功能越多，越应共享 AST，而不是各自写字符串规则。

> **面试锚点**
> - Druid Parser 的通用层和方言层如何分工？
> - 为什么必须做 EOF 检查？
> - 多语句解析对 Wall 防火墙有什么意义？

## Related

- [AST 与 Visitor](/notes/source/java/storage/druid/sql-ast/)
- [Wall 防火墙](/notes/source/java/storage/druid/wall-firewall/)
- [ShardingSphere SQL 解析](/notes/source/java/storage/shardingsphere/sql-parser/)
