---
title: MyBatis
description: MyBatis 源码解析总览：配置 Builder、Mapper 动态代理、SqlSession 与 Executor、缓存、插件和结果映射。
category: Backend
tags: [Source Reading, Java, MyBatis, ORM]
order: 1
updatedDate: 2026-08-19
difficulty: advanced
status: stable
lastReviewed: 2026-08-19
draft: false
sidebar:
  order: 1
---

MyBatis 不是把 SQL 隐藏起来的全自动 ORM，而是把配置、SQL、参数、结果和事务组织成一条可插拔执行管线。读懂它的关键，是追踪一个 Mapper 方法如何从代理对象变成 `MappedStatement`，再变成 JDBC `Statement`。

<!-- more -->

## 本册问题地图

MyBatis 把“调用一个 Java 接口”翻译成“执行一条 SQL 并恢复对象图”。这条翻译链可以拆成五个连续问题：

1. **接口为什么不需要实现类？** 启动期把 XML/注解编译为 `MappedStatement`，运行期由 Mapper 动态代理查表分派。
2. **参数怎样进入 SQL？** `MapperMethod` 整理参数，`SqlSource` 生成 `BoundSql`，ParameterHandler 完成 JDBC 绑定。
3. **不同执行策略在哪里切换？** `SqlSession` 提供统一入口，Executor 负责 SIMPLE、REUSE、BATCH、缓存和事务边界。
4. **数据库行怎样变回对象？** ResultSetHandler 结合 `ResultMap`、类型处理器和嵌套规则构造对象图。
5. **缓存和插件为什么容易互相影响？** 两者都包裹执行链：缓存可能让后续阶段短路，插件可能改变 SQL、参数与缓存 key。

读完整册后，应当能从 Mapper 方法一路追到 JDBC，再从 ResultSet 追回应答对象；遇到问题时，也能先判断故障属于配置期、执行期还是映射期。


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
