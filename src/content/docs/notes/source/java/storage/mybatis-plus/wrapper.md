---
title: Wrapper 条件构造
description: AbstractWrapper 如何维护表达式片段、参数映射、实体条件和 Lambda 列名。
category: Backend
tags: [Source Reading, MyBatis-Plus, Wrapper]
order: 64
updatedDate: 2026-08-16
sidebar:
  order: 64
---

Wrapper 把链式条件 API 编译成 SQL 片段和参数映射，调用方写的是领域条件，注入 SQL 时仍使用预编译参数而不是字符串拼接值。

<!-- more -->

```text
eq("status", 1).like("name", "A")
          │
          ▼
MergeSegments + paramNameValuePairs
          │
          ▼
WHERE status = #{ew.paramNameValuePairs.MPGENVAL1}
```

`AbstractWrapper` 保存实体、表达式片段、参数序列和参数值映射；`addCondition` 等方法只增加 SQL 结构和绑定参数：见 `AbstractWrapper.java:50-125`、`AbstractWrapper.java:150-250`、`AbstractWrapper.java:300-420`、`AbstractWrapper.java:603-680`。

Lambda wrapper 通过 `SFunction` 解析实体 getter，再借助 `LambdaUtils` 获得列名，避免手写字符串列名：见 `LambdaQueryWrapper.java:30-100`、`AbstractLambdaWrapper.java:40-150`、`LambdaUtils.java:100-180`。

条件最终由 `MergeSegments#getSqlSegment` 合并，并由 `SqlScriptUtils#convertIf` 等工具嵌入动态 SQL：见 `MergeSegments.java:30-92`、`NormalSegmentList.java:25-110`、`SqlScriptUtils.java:35-105`。

## 为什么参数值不能直接拼进 SQL

**替代方案**：把 `eq("name", value)` 直接拼成 `name = 'value'`。
**为什么不行**：有注入风险，且无法复用 PreparedStatement；字符串、日期和特殊字符转义也会复杂化。
**证据**：Wrapper 将值放入 `paramNameValuePairs`，SQL 只生成参数占位符。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| Wrapper 跨线程复用 | 参数互相污染 | 内部 segment 和 map 可变 | 每次请求新建 |
| `in` 传空集合 | SQL 不合法或语义变化 | 条件生成需要特殊处理 | 先判断集合是否为空 |
| `apply` 直接拼接 | 注入风险 | 绕过参数绑定 | 只用于受控模板并使用占位符 |

## 可迁移知识

链式 DSL 的关键不是 fluent API，而是把结构和数据分离：结构进入 AST/片段，数据进入参数表。

> **面试锚点**
> - Wrapper 如何防止参数值直接拼 SQL？
> - Lambda wrapper 如何得到列名？
> - Wrapper 为什么不应该跨线程共享？

## Related

- [MyBatis-Plus SQL 注入](/notes/source/java/storage/mybatis-plus/mapper-injection/)
- [ShardingSphere SQL 改写](/notes/source/java/storage/shardingsphere/rewrite-engine/)
