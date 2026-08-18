---
title: MyBatis-Plus
description: MyBatis-Plus 源码解析总览：实体元数据、Mapper 注入、Wrapper、插件链、分页与 Spring 集成。
category: Backend
tags: [Source Reading, Java, MyBatis-Plus, ORM]
order: 6
updatedDate: 2026-08-16
difficulty: advanced
status: stable
lastReviewed: 2026-08-16
draft: false
sidebar:
  order: 6
---

MyBatis-Plus 不替换 MyBatis 的执行器，而是在配置、Mapper 元数据、SQL 注入和拦截器层增加约定式能力。读它的关键是看“一个实体如何变成可执行的 MappedStatement”。

<!-- more -->

## 版本快照

| 项 | 值 |
| --- | --- |
| 仓库 | `baomidou/mybatis-plus` |
| 本地路径 | `E:\source\java\storage\mybatis-plus` |
| 分支 | `3.0` |
| Commit | `bf67d907478c724120bf76292da54abf9e73c2b3`（2026-08-03） |
| 最近 tag | `v3.5.17` |

> 本册坐标均基于上述 commit；上游演进后行号可能漂移。

## 模块地图

| 模块 | 职责 | 关键类 |
| --- | --- | --- |
| core | MyBatis 配置、元数据和基础 Mapper | `MybatisConfiguration`、`TableInfoHelper`、`BaseMapper` |
| extension | Wrapper、Service、插件和 SQL 注入扩展 | `AbstractWrapper`、`MybatisPlusInterceptor` |
| jsqlparser | 分页、租户、数据权限等 SQL 改写 | `PaginationInnerInterceptor` |
| spring | `SqlSessionFactory` 与 Spring 生命周期整合 | `MybatisSqlSessionFactoryBean`、`ServiceImpl` |
| generator | 根据表结构生成实体、Mapper 和 Service | generator module |

## 读码入口

1. `TableInfoHelper#initTableInfo`，看实体和注解如何变成表元数据。
2. `AbstractMethod#inject`，看通用 CRUD 如何注入 MappedStatement。
3. `BaseMapper`，看运行时如何调用注入的方法。
4. `AbstractWrapper`，看条件表达式如何构造成 SQL 片段和参数。
5. `MybatisPlusInterceptor` 与 inner interceptor，看分页、乐观锁、租户等如何插入执行链。

## 本册目录

- [整体架构](/notes/source/java/storage/mybatis-plus/architecture/)
- [实体元数据与表映射](/notes/source/java/storage/mybatis-plus/table-metadata/)
- [Mapper 与 SQL 注入](/notes/source/java/storage/mybatis-plus/mapper-injection/)
- [Wrapper 条件构造](/notes/source/java/storage/mybatis-plus/wrapper/)
- [插件链与 SQL 改写](/notes/source/java/storage/mybatis-plus/interceptor-chain/)
- [分页、租户与乐观锁](/notes/source/java/storage/mybatis-plus/pagination-tenant-lock/)
- [Service 与 Spring 集成](/notes/source/java/storage/mybatis-plus/spring-service/)
- [面试专题](/notes/source/java/storage/mybatis-plus/interview/)

## 横向对照

| 对象 | 对照点 |
| --- | --- |
| [MyBatis](/notes/source/java/storage/mybatis-3/) | MyBatis-Plus 在原生 Configuration、Mapper 和 Interceptor 之上做增强 |
| [ShardingSphere](/notes/source/java/storage/shardingsphere/) | MyBatis-Plus 主要改写单条 SQL，ShardingSphere 进一步做路由和分片执行 |
| [Druid](/notes/source/java/storage/druid/) | 都使用 SQL 解析/拦截增强，但 Druid 更偏 JDBC 代理与观测 |

## Related

- [存储与 ORM](/notes/source/java/storage/)
