---
title: 整体架构
description: MyBatis 配置、Mapper 绑定、SqlSession、Executor、StatementHandler 与结果映射的完整调用链。
category: Backend
tags: [Source Reading, MyBatis, Architecture]
order: 11
updatedDate: 2026-08-15
difficulty: advanced
status: stable
lastReviewed: 2026-08-15
draft: false
sidebar:
  order: 11
---

MyBatis 的架构可以压缩成一句话：启动期把 SQL 解析成元数据，运行期把接口调用翻译成 JDBC 操作，再把结果集按 `ResultMap` 组装回对象。

<!-- more -->

## 分层

```text
XML / 注解
    |
    v
XMLConfigBuilder / XMLMapperBuilder
    |  Configuration + MappedStatement + ResultMap
    v
MapperRegistry -> MapperProxy -> MapperMethod
                                      |
                                      v
SqlSession -> Executor -> StatementHandler -> JDBC
   |             |                 |
   |             |- 一级/二级缓存  |- ParameterHandler
   |             `- 事务边界       `- ResultSetHandler
```

| 层 | 核心抽象 | 作用 |
| --- | --- | --- |
| 元数据 | `Configuration`、`MappedStatement`、`ResultMap` | 把声明式配置变成运行时对象 |
| 绑定 | `MapperRegistry`、`MapperProxy` | 把接口方法绑定到 statement id |
| 会话 | `SqlSession` | 暴露查询、更新、提交、回滚和游标 API |
| 执行 | `Executor` | 缓存、事务、批处理和 JDBC 调度 |

## 主流程一：启动

```text
SqlSessionFactoryBuilder#build
  -> XMLConfigBuilder#parse
       -> parseSettings / parseEnvironments
       -> XMLMapperBuilder#parse
            -> ResultMap / MappedStatement
       -> Configuration#addMapper
```

`XMLConfigBuilder#parse` 调用 `parseConfiguration`（`mybatis-3/src/main/java/org/apache/ibatis/builder/xml/XMLConfigBuilder.java:105-118`）。`XMLMapperBuilder#parse` 负责 mapper namespace、缓存、结果映射和 statement（`mybatis-3/src/main/java/org/apache/ibatis/builder/xml/XMLMapperBuilder.java:103-130`）。`XMLStatementBuilder#parseStatementNode` 把 SQL 节点构建成 `MappedStatement`（`mybatis-3/src/main/java/org/apache/ibatis/builder/xml/XMLStatementBuilder.java:46-83`）。

## 主流程二：查询

```text
UserMapper.selectById()
  -> MapperProxy#invoke
       -> MapperMethod#execute
            -> SqlSession.selectList
                 -> Executor.query
                      -> StatementHandler.query
                           -> ResultSetHandler.handleResultSets
```

`MapperProxy#invoke` 区分 Object、default method 和 SQL method（`mybatis-3/src/main/java/org/apache/ibatis/binding/MapperProxy.java:59-67`）。`MapperMethod#execute` 按 `SqlCommandType` 选择调用（`mybatis-3/src/main/java/org/apache/ibatis/binding/MapperMethod.java:57-138`）。`DefaultSqlSession#selectList` 取出 `MappedStatement` 后转交 Executor（`mybatis-3/src/main/java/org/apache/ibatis/session/defaults/DefaultSqlSession.java:145-157`）。`BaseExecutor#query` 生成 `CacheKey`、检查一级缓存，未命中才进入 `doQuery`（`mybatis-3/src/main/java/org/apache/ibatis/executor/BaseExecutor.java:134-181`）。

## 扩展点全景

| 扩展点 | 接口 | 触发时机 | 典型用途 |
| --- | --- | --- | --- |
| 执行器 | `Executor` | 会话创建时 | 简单、复用、批量执行 |
| 语句处理 | `StatementHandler` | 每次 SQL 执行 | PreparedStatement、CallableStatement |
| 参数处理 | `ParameterHandler` | 参数绑定前 | 自定义类型绑定 |
| 结果处理 | `ResultSetHandler` | JDBC 返回后 | 自定义映射、审计 |
| 插件 | `Interceptor` | 对象创建时 | SQL 改写、耗时监控、分页 |

## 关键取舍

### 为什么启动期构建 `MappedStatement`

**替代方案**：每次调用时重新读取 XML 和解析 OGNL。
**为什么不行**：解析和校验进入请求热路径，statement id、参数映射和结果映射也失去稳定身份。
**证据**：`XMLMapperBuilder#buildStatementFromContext` 在构建阶段调用 `XMLStatementBuilder#parseStatementNode`，运行期只通过 `Configuration#getMappedStatement` 查元数据（`XMLMapperBuilder.java:136-151`；`Configuration.java:825-832`）。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| namespace 不一致 | statement not found | statement id 是 namespace + method | XML namespace 与接口全限定名一致 |
| session 并发使用 | 数据错乱 | `DefaultSqlSession` 非并发设计 | 每个请求独立 session |
| 插件签名错误 | 插件不生效 | `@Intercepts` 未匹配目标方法 | 对照实际接口和参数类型 |

## 可迁移知识

启动期编译元数据、运行期只消费不可变计划，适合 SQL、规则引擎、路由表和模板系统。把昂贵解析移出请求路径，同时保留稳定 identity，能降低运行时复杂度。

> **面试锚点**
> - `MappedStatement` 为什么是核心运行时元数据？
> - Mapper 方法如何找到 statement id？
> - 为什么 `SqlSession` 不能跨线程共享？

## Related

- [配置解析与 Mapper 代理](/notes/source/java/storage/mybatis-3/config-and-mapper/)
- [SqlSession 与 Executor](/notes/source/java/storage/mybatis-3/session-executor/)
- [结果集映射](/notes/source/java/storage/mybatis-3/result-mapping/)
