---
title: Service 与 Spring 集成
description: MybatisSqlSessionFactoryBean、ServiceImpl 和 Spring 生命周期如何接入 MyBatis-Plus。
category: Backend
tags: [Source Reading, MyBatis-Plus, Spring]
order: 67
updatedDate: 2026-08-24
lastReviewed: 2026-08-24
sidebar:
  order: 67
---

Spring 集成层负责组装 SqlSessionFactory、插件、类型别名和 Mapper 扫描；Service 层只是对 BaseMapper 的事务化业务封装，不替代 Mapper 执行器。

<!-- more -->

## 先给答案：Spring 集成层负责组装 SqlSessionFactory、插件、类型别名和 Mapper 扫描；S…

Spring 集成层负责组装 SqlSessionFactory、插件、类型别名和 Mapper 扫描；Service 层只是对 BaseMapper 的事务化业务封装，不替代 Mapper 执行器。 理解Service 与 Spring 集成时，要先确认入口与状态归属，再跟踪控制流或数据流的推进顺序，最后落到对外可观察的结果。

主要失效边界集中在“多个 SqlSessionFactory、Service 泛型不完整、事务不在 Spring 管理”这些场景。它们破坏的是容量、顺序、并发或生命周期前提；排查时应先确认状态是否仍由正确对象持有，再核对推进条件和清理路径。

主要失效边界集中在“多个 SqlSessionFactory、Service 泛型不完整、事务不在 Spring 管理”这些场景。它们破坏的是容量、顺序、并发或生命周期前提；排查时应先确认状态是否仍由正确对象持有，再核对推进条件和清理路径。

```text
Spring BeanFactory
  └─► MybatisSqlSessionFactoryBean#afterPropertiesSet
       ├─► MybatisConfiguration
       ├─► plugins / mapper locations
       └─► MybatisSqlSessionFactoryBuilder
             ▼
        SqlSessionFactory
             ▼
        Mapper proxy ─► ServiceImpl
```

`MybatisSqlSessionFactoryBean` 复制并扩展 MyBatis-Spring 的工厂逻辑，初始化配置、插件、mapper XML、类型处理器和 SqlSessionFactory：见 `MybatisSqlSessionFactoryBean.java:83-120`、`MybatisSqlSessionFactoryBean.java:550-690`、`MybatisSqlSessionFactoryBean.java:700-769`。

`ServiceImpl` 继承 `CrudRepository`，通过泛型持有 Mapper 和实体类型，提供批量、链式和事务边界上的业务便利：见 `ServiceImpl.java:28-30`、`CrudRepository.java:30-120`、`IService.java:30-180`。

工厂在 `buildSqlSessionFactory` 阶段完成环境和 configuration 装配，再由 `MybatisSqlSessionFactoryBean.java:770-835` 暴露最终工厂；Mapper 扫描和代理注册分别落在 `MybatisMapperRegistry.java:25-75`、`MybatisMapperProxyFactory.java:35-80`。

## 为什么 Service 不直接拼 SQL

**替代方案**：Service 层根据对象字段手写 insert/update SQL。
**为什么不行**：绕过 Mapper 元数据、类型处理、插件和事务会造成两套数据访问语义。
**证据**：ServiceImpl 的核心操作最终委托 `BaseMapper`，SQL 仍由注入的 MappedStatement 执行。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| 多个 SqlSessionFactory | Mapper 绑定错误数据源 | 扫描和工厂关联不清 | 明确 mapperScan 与 factoryRef |
| Service 泛型不完整 | 运行时找不到 mapper | 无法解析 M/T | 明确 `ServiceImpl<Mapper, Entity>` |
| 事务不在 Spring 管理 | 批量操作未回滚 | session 没有事务同步 | 使用 `@Transactional` 和正确数据源 |

## 可迁移知识

框架集成层应尽量只负责生命周期和依赖组装，业务抽象层委托底层执行器，避免在每一层重复实现数据访问语义。

> **面试锚点**
> - MybatisSqlSessionFactoryBean 做了哪些增强？
> - ServiceImpl 与 BaseMapper 的关系是什么？
> - 多数据源时最容易出什么问题？

## Related

- [Spring Boot 自动配置](/notes/source/java/spring/spring-boot/auto-configuration/)
- [MyBatis-Plus 整体架构](/notes/source/java/storage/mybatis-plus/architecture/)
