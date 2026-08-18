---
title: 面试专题
description: MyBatis-Plus 高频面试题、高难追问与源码级回答。
category: Backend
tags: [Source Reading, MyBatis-Plus, Interview]
order: 69
updatedDate: 2026-08-16
sidebar:
  order: 69
---

MyBatis-Plus 面试要回答清楚：哪些工作在启动期完成，哪些工作在 SQL 执行前完成，以及它如何保持与 MyBatis 的兼容。

<!-- more -->

```text
Mapper call
  └─► TableInfo + injected MappedStatement
       └─► MyBatis Executor
            └─► MybatisPlusInterceptor
                 └─► InnerInterceptor chain
```

## 高频题

### 通用 CRUD 是如何生成的？
**30 秒版**：Mapper 解析时初始化 TableInfo，SQL Injector 遍历 AbstractMethod，把 CRUD 生成成 MappedStatement 注册到 Configuration。
**展开**：见 `TableInfoHelper.java:163-205`、`AbstractMethod.java:82-120`。
**加分项**：运行时不是重新拼完整 SQL，而是复用已经注册的 statement。
**常见错答**：说成每次调用都反射实体并生成 SQL。

### Wrapper 如何避免 SQL 注入？
**30 秒版**：条件结构生成 SQL 片段，值放入参数 map，通过占位符绑定。
**展开**：见 `AbstractWrapper.java:150-250`、`AbstractWrapper.java:603-680`。
**加分项**：`apply` 等扩展入口仍需调用方负责模板安全。
**常见错答**：说所有 Wrapper API 都能安全接受任意 SQL 片段。

### MybatisPlusInterceptor 做什么？
**30 秒版**：它是一个外层 MyBatis 插件，内部按顺序调度多个 InnerInterceptor。
**展开**：见 `MybatisPlusInterceptor.java:50-105`。
**加分项**：query、update、prepare 有不同生命周期钩子。
**常见错答**：把每个 inner interceptor 说成独立 MyBatis plugin。

### 乐观锁如何生效？
**30 秒版**：更新时把旧 version 加入 WHERE，计算新 version 写入 SET，影响行数为 0 即冲突。
**展开**：见 `OptimisticLockerInnerInterceptor.java:110-210`。
**加分项**：wrapper 模式和实体模式的参数读取不同。
**常见错答**：只更新 version，不在 WHERE 检查旧值。

## 高难追问

### 为什么 TableInfo 要缓存？
注解、字段和主键元数据稳定，缓存把反射成本移到启动期；同时保证注入器和 Wrapper 使用同一份映射（`TableInfoHelper.java:80-185`）。

### 分页插件为什么可能生成两条 SQL？
一条 count 统计 total，一条按 dialect 加 limit/offset 查询当前页（`PaginationInnerInterceptor.java:123-205`）。

### 为什么插件顺序会影响结果？
前一个插件可能已经修改 SQL，后一个插件解析的是修改后的结果；租户、分页、数据权限组合必须有稳定顺序。

## 场景题

### 线上出现全表更新怎么排查？
检查 update wrapper 是否为空、BlockAttack 插件是否启用、逻辑删除/租户条件是否被 ignore，以及最终 BoundSql 日志。

### 升级 MyBatis 后插件异常怎么排查？
先确认 MyBatis 版本兼容矩阵，再核对 Invocation 方法签名、BoundSql 参数映射和 jsqlparser 模块版本。

## 边界与踩坑

| 场景 | 风险 | 源码锚点 |
| --- | --- | --- |
| Wrapper 跨线程共享 | 参数污染 | `AbstractWrapper.java:50-125` |
| 自定义 SQL 同名 | 默认注入被跳过 | `AbstractMethod.java:390-407` |
| 插件顺序错误 | SQL 语义变化 | `MybatisPlusInterceptor.java:56-105` |

## 可迁移知识

回答 ORM 框架时，按元数据、代码生成、执行拦截和事务集成四层展开，能同时覆盖设计与故障排查。

> **面试锚点**
> - TableInfo 何时生成？
> - CRUD 如何变成 MappedStatement？
> - Wrapper、插件、Service 各自负责什么？

## Related

- [MyBatis-Plus 整体架构](/notes/source/java/storage/mybatis-plus/architecture/)
- [MyBatis 面试专题](/notes/source/java/storage/mybatis-3/interview/)
