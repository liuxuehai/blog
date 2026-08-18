---
title: 分页、租户与乐观锁
description: PaginationInnerInterceptor、租户条件和 OptimisticLockerInnerInterceptor 如何改写查询与更新。
category: Backend
tags: [Source Reading, MyBatis-Plus, Pagination, Tenant, Lock]
order: 66
updatedDate: 2026-08-16
sidebar:
  order: 66
---

这些插件都不是业务层手写 SQL，而是在 MyBatis 执行边界检查 statement、解析或改写 SQL，并补充参数或版本条件。

<!-- more -->

```text
SELECT ...
  ├─► count SQL ─► total
  └─► dialect pagination SQL ─► page records

UPDATE ... WHERE id = ?
  └─► WHERE id = ? AND version = old
       SET version = new
```

## 分页

`PaginationInnerInterceptor` 先判断是否需要分页，再构造 count MappedStatement，随后按数据库方言生成 limit/offset SQL：见 `PaginationInnerInterceptor.java:65-145`、`PaginationInnerInterceptor.java:150-205`、`PaginationInnerInterceptor.java:211-260`、`IDialect.java:1-80`。

## 租户与数据权限

租户插件通过 JSqlParser 把租户表达式追加到 select/update/delete 的表条件；多表、子查询和忽略表都需要单独处理。关键入口见 `TenantLineInnerInterceptor.java:55-150`、`TenantLineInnerInterceptor.java:200-330`、`JsqlParserSupport.java:30-110`。

## 乐观锁

`OptimisticLockerInnerInterceptor#beforeUpdate` 从实体或 wrapper 读取旧版本，计算新版本并把版本条件追加到更新 SQL；更新影响行数为 0 时表示版本冲突：见 `OptimisticLockerInnerInterceptor.java:73-145`、`OptimisticLockerInnerInterceptor.java:146-210`、`OptimisticLockerInnerInterceptor.java:241-317`。

## 为什么乐观锁必须修改条件而不是只修改 version

**替代方案**：只把 version 加到 SET，不加到 WHERE。
**为什么不行**：并发更新仍会互相覆盖，version 只是递增字段而不是冲突检测条件。
**证据**：插件将旧版本放入 WHERE，同时计算新版本写入 SET，依靠数据库行数判断是否抢占成功。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| count SQL 复杂 | total 不准确或慢 | join、group by、distinct 改写困难 | 检查 count 优化和自定义 countId |
| 租户表未排除 | SQL 多出 tenant 条件 | 插件默认按表名识别 | 配置 ignoreTable |
| version 为 null | 更新条件异常 | 没有旧版本可比较 | 初始化版本并限制更新入口 |

## 可迁移知识

数据库横切能力应尽量落在“生成最终 SQL 的最后一跳”，这样既能覆盖 XML SQL，也能覆盖通用 Mapper，但必须为复杂 SQL 保留显式绕过机制。

> **面试锚点**
> - 分页插件为什么需要 count SQL？
> - 乐观锁如何判断冲突？
> - 租户插件为什么依赖 SQL Parser？

## Related

- [MyBatis-Plus 插件链](/notes/source/java/storage/mybatis-plus/interceptor-chain/)
- [ShardingSphere SQL 解析](/notes/source/java/storage/shardingsphere/sql-parser/)
