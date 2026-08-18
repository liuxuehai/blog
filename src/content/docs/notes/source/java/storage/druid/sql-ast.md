---
title: AST 与 Visitor
description: Druid SQL AST 的节点组织、Visitor 遍历和动态条件注入。
category: Backend
tags: [Source Reading, Druid, AST]
order: 35
updatedDate: 2026-08-16
difficulty: advanced
status: stable
lastReviewed: 2026-08-16
draft: false
sidebar:
  order: 35
---

AST 是 Druid 把 SQL 从文本提升到语义对象的关键。节点负责保存结构，Visitor 负责把格式化、参数化、安全检查和改写等行为从节点模型中分离出来。

<!-- more -->

```text
SQLSelect
  -> SQLSelectQueryBlock
       -> selectList
       -> from
       -> where
       -> groupBy / orderBy
              |
              v
       SQLASTVisitor.accept
```

## 关键节点

- `SQLSelectQueryBlock` 类定义：`sql/ast/statement/SQLSelectQueryBlock.java:32`。
- `addWhere`：`:144`，向查询块加入条件。
- `addWhereForDynamicFilter`：`:215`，面向动态过滤场景。
- `accept0`：`:731`，节点向 Visitor 暴露子节点。
- `computeSelecteListAlias`：`:1638`，计算选择列表别名。
- Parser 创建查询块：`SQLStatementParser.java:5290` 附近。
- 方言 Parser 对 select 的扩展：`MySqlStatementParser.java:1046` 附近。
- Wall Visitor 从 `WallProvider.java:468-572` 附近消费 AST。

## Visitor 的价值

同一棵树可以被多个 Visitor 复用：格式化 Visitor 关心输出，Wall Visitor 关心危险语义，统计逻辑关心表名和条件，改写 Visitor 关心 token 位置。节点类不需要知道所有下游功能。

## 为什么把动态条件注入放在 AST 层

**替代方案**：在 SQL 字符串尾部拼接 `where tenant_id = ?`。
**为什么不行**：原 SQL 可能已有 `where`、子查询、Union、Limit 或注释，字符串拼接无法可靠定位语义位置。
**证据**：`SQLSelectQueryBlock#addWhere` 在 `:144` 直接操作条件节点，`addWhereForDynamicFilter` 在 `:215` 进一步处理动态过滤。

## 别名和作用域

`computeSelecteListAlias` 说明列别名不是简单字符串属性。Visitor 在处理投影、排序和聚合时需要区分列名、表达式别名和表作用域，避免把不同层级的同名字段混淆。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| Visitor 漏节点 | 安全规则绕过 | `accept0` 未覆盖子节点 | 检查所有递归边界 |
| 修改原树 | 后续功能结果异常 | 多个阶段共享 AST | 明确可变节点的所有权 |
| Union 条件 | 条件注入位置错误 | 查询块层级不同 | 在目标 query block 注入 |
| 别名冲突 | 排序或统计字段错误 | 作用域解析不完整 | 使用 AST 语义信息而非文本 |

## 可迁移知识

Visitor 适合“数据结构稳定、操作持续增加”的系统。编译器、配置校验器和查询优化器都可以通过节点稳定化、行为 Visitor 化来降低耦合。

> **面试锚点**
> - AST 节点和 Visitor 为什么要分离？
> - 动态过滤条件为什么不能用字符串拼接？
> - Visitor 如何处理 Union、子查询和别名作用域？

## Related

- [SQL Parser 与方言](/notes/source/java/storage/druid/sql-parser/)
- [Wall 防火墙](/notes/source/java/storage/druid/wall-firewall/)
- [StatFilter 统计](/notes/source/java/storage/druid/stat-filter/)
