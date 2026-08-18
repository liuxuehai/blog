---
title: MyBatis
description: MyBatis 源码解析总览：配置 Builder、Mapper 动态代理、SqlSession 与 Executor、缓存、插件和结果映射。
category: Backend
tags: [Source Reading, Java, MyBatis, ORM]
order: 1
updatedDate: 2026-08-15
difficulty: advanced
status: stable
lastReviewed: 2026-08-15
draft: false
sidebar:
  order: 1
---

MyBatis 不是把 SQL 隐藏起来的全自动 ORM，而是把配置、SQL、参数、结果和事务组织成一条可插拔执行管线。读懂它的关键，是追踪一个 Mapper 方法如何从代理对象变成 `MappedStatement`，再变成 JDBC `Statement`。

<!-- more -->

## 版本快照

| 项 | 值 |
| --- | --- |
| 仓库 | `mybatis/mybatis-3` |
| 本地路径 | `E:\source\java\storage\mybatis-3` |
| 分支 | `master` |
| Commit | `008069ad`（2026-08-12） |
| 最近 tag | `mybatis-3.5.18` |

> 本册坐标基于上述 commit。行号会随上游演进漂移，类名与方法名更稳定。

## 模块地图

| 模块 | 职责 | 关键包 |
| --- | --- | --- |
| 配置与构建 | XML/注解解析，生成运行时元数据 | `builder`、`mapping` |
| 会话与绑定 | `SqlSession` 门面、Mapper 代理 | `session`、`binding` |
| 执行器 | 查询、更新、事务、本地缓存 | `executor` |
| 插件 | 对四类运行时对象做代理 | `plugin` |
| 类型与结果 | 参数处理、嵌套结果映射 | `type`、`executor.resultset` |

## 读码入口顺序

1. `XMLConfigBuilder#parse`：配置如何进入 `Configuration`。
2. `MapperRegistry#getMapper`：接口如何变成 JDK 动态代理。
3. `MapperMethod#execute`：方法如何选择 `select` / `update` 分支。
4. `DefaultSqlSession#selectList`：会话如何调用 `Executor`。
5. `BaseExecutor#query`：缓存键、一级缓存和 JDBC 边界。
6. `DefaultResultSetHandler#handleResultSets`：结果集如何组装成对象图。

## 本册目录

- [整体架构](/notes/source/java/storage/mybatis-3/architecture/)
- [配置解析与 Mapper 代理](/notes/source/java/storage/mybatis-3/config-and-mapper/)
- [SqlSession 与 Executor](/notes/source/java/storage/mybatis-3/session-executor/)
- [缓存与插件链](/notes/source/java/storage/mybatis-3/cache-and-plugin/)
- [结果集映射](/notes/source/java/storage/mybatis-3/result-mapping/)
- [面试专题](/notes/source/java/storage/mybatis-3/interview/)

## 横向对照

| 对象 | 对照点 |
| --- | --- |
| Hibernate | 管理实体状态与 SQL 生成；MyBatis 保留 SQL 主导权 |
| Spring JDBC | 都围绕 JDBC 模板化；MyBatis 额外提供 Mapper、映射元数据和缓存 |
| jOOQ | jOOQ 偏类型安全 DSL；MyBatis 偏 XML/注解运行时解析 |
