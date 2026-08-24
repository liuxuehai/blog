---
title: 实体元数据与表映射
description: TableInfoHelper 如何解析 TableName、TableId、TableField、逻辑删除和填充策略。
category: Backend
tags: [Source Reading, MyBatis-Plus, Metadata]
order: 62
updatedDate: 2026-08-24
lastReviewed: 2026-08-24
sidebar:
  order: 62
---

MyBatis-Plus 将实体注解提前编译成 `TableInfo`，后续 SQL 注入和 Wrapper 都从这份元数据读取表名、列名、主键和策略。

<!-- more -->

## 先给答案：MyBatis-Plus 将实体注解提前编译成 TableInfo，后续 SQL 注入和 Wrapper …

MyBatis-Plus 将实体注解提前编译成 TableInfo，后续 SQL 注入和 Wrapper 都从这份元数据读取表名、列名、主键和策略。 正文沿“初始化流程 -> Lambda 列名 -> 为什么要缓存 TableInfo”展开：先确认入口和状态归属，再跟踪控制流或数据流的推进，最后落到对外可观察的结果。

主要失效边界集中在“字段名与列名不一致、没有主键、继承实体”这些场景。它们破坏的是容量、顺序、并发或生命周期前提；排查时应先确认状态是否仍由正确对象持有，再核对推进条件和清理路径。

## 初始化流程

`TableInfoHelper#initTableInfo` 先确定实体类，再初始化表名和字段；字段解析过程中识别主键、枚举、逻辑删除、版本和自动填充信息：见 `TableInfoHelper.java:163-205`、`TableInfoHelper.java:240-330`、`TableInfoHelper.java:330-430`、`TableInfoHelper.java:430-530`。

实体类来源可以是 Mapper 的泛型，也可以是显式传入的 class。缓存和 synchronized 初始化避免同一实体被并发重复构造：见 `TableInfoHelper.java:80-120`、`TableInfoHelper.java:149-185`、`TableInfoHelper.java:570-656`。

## Lambda 列名

Lambda 条件通过序列化 lambda 得到实现方法，再结合实体元数据映射到字段名；`LambdaUtils` 的缓存避免每次构造条件都重复反射：见 `LambdaUtils.java:38-90`、`LambdaUtils.java:100-180`、`LambdaUtils.java:210-318`。

## 为什么要缓存 TableInfo

**替代方案**：每次执行 CRUD 时重新扫描注解和反射字段。
**为什么不行**：请求热路径会重复做稳定元数据工作，并且字段策略判断会散落在多个调用点。
**证据**：`TableInfoHelper` 提供静态缓存和初始化入口，注入器、Wrapper、填充器共享同一 `TableInfo`。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| 字段名与列名不一致 | SQL 找不到列 | 未配置 `@TableField` 或全局策略不符 | 明确指定 column |
| 没有主键 | updateById 失败 | 通用更新需要 key property | 配置 `@TableId` 或不用按 id API |
| 继承实体 | 字段漏解析 | 父类策略或 transient 字段影响扫描 | 检查父类字段和注解 |

## 可迁移知识

把反射和注解解析变成不可变元数据，是 ORM、序列化器和校验框架降低运行时成本的通用手法。

> **面试锚点**
> - `TableInfo` 存哪些核心信息？
> - LambdaQueryWrapper 如何从方法引用得到列名？
> - 为什么元数据初始化要缓存？

## Related

- [MyBatis-Plus 整体架构](/notes/source/java/storage/mybatis-plus/architecture/)
- [MyBatis 结果映射](/notes/source/java/storage/mybatis-3/result-mapping/)
