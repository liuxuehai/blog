---
title: 整体架构
description: MyBatis-Plus 从实体扫描、Mapper 注册、SQL 注入到 Executor 拦截的完整链路。
category: Backend
tags: [Source Reading, MyBatis-Plus, Architecture]
order: 61
updatedDate: 2026-08-16
sidebar:
  order: 61
---

MyBatis-Plus 的核心设计是“编译式准备、运行时执行”：启动阶段准备实体元数据和通用 SQL，查询阶段只组合参数并进入 MyBatis 原生执行器。

<!-- more -->

```text
Entity + annotations
        │
        ▼
TableInfoHelper ─► TableInfo / fields / key / logic-delete
        │
        ▼
Mapper registration ─► SQL Injector ─► MappedStatement
        │                                      │
        ▼                                      ▼
BaseMapper / Wrapper ───────────────► MyBatis Executor
                                               │
                                               ▼
                                  MybatisPlusInterceptor chain
```

## 分层

| 层 | 职责 | 源码坐标 |
| --- | --- | --- |
| 配置 | 扩展 MyBatis Configuration | `MybatisConfiguration.java:58-110` |
| 元数据 | 解析实体、字段、主键和策略 | `TableInfoHelper.java:55-205` |
| 注入 | 生成通用 CRUD MappedStatement | `AbstractMethod.java:82-120` |
| API | 暴露 Mapper、Wrapper、Service | `BaseMapper.java:97-150` |
| 拦截 | 改写 BoundSql 或更新参数 | `MybatisPlusInterceptor.java:50-105` |

## 主流程一：启动

```text
Spring / MyBatis bootstrap
  └─► mapper parsed
       └─► TableInfoHelper.initTableInfo
            └─► SqlInjector methods
                 └─► addMappedStatement
                      └─► Configuration mappedStatements
```

`TableInfoHelper` 从 Mapper 泛型或实体类开始初始化 `TableInfo`；注入器随后为 `BaseMapper` 派生接口添加 insert、update、delete、select 等语句。关键坐标：`TableInfoHelper.java:115-205`、`TableInfoHelper.java:240-380`、`AbstractMethod.java:82-120`、`AbstractMethod.java:150-210`、`AbstractMethod.java:390-445`、`MybatisConfiguration.java:330-365`。

## 主流程二：查询

```text
mapper.selectList(wrapper)
  └─► BaseMapper default method
       └─► mapper proxy invokes statement id
            └─► MybatisPlusInterceptor
                 ├─► beforeQuery
                 ├─► beforePrepare
                 └─► Executor.query/update
```

Wrapper 只负责生成条件片段和参数映射，真正的 JDBC 执行仍由 MyBatis Executor 完成。关键坐标：`BaseMapper.java:180-245`、`AbstractWrapper.java:50-125`、`AbstractWrapper.java:603-680`、`MybatisPlusInterceptor.java:56-105`、`MybatisSqlSessionFactoryBean.java:600-690`、`ServiceImpl.java:28-30`。

## 为什么不重写 MyBatis Executor

**替代方案**：复制一套 Executor 和 Mapper 代理，直接接管 CRUD。
**为什么不行**：会与 MyBatis 的缓存、事务、结果映射和插件机制分叉，升级成本高。
**证据**：MyBatis-Plus 选择扩展 `Configuration`、注入 `MappedStatement` 和实现 MyBatis `Interceptor`，执行仍回到 MyBatis 原生链路。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| Mapper 泛型缺失 | 找不到实体表信息 | 无法推导 modelClass | 明确 `BaseMapper<Entity>` |
| 插件顺序错误 | 分页或租户 SQL 异常 | SQL 改写有先后依赖 | 按文档顺序注册 |
| XML 与注入同名 | 语句未按预期生成 | 已存在 statement 被跳过 | 避免同名或确认覆盖策略 |

## 可迁移知识

框架增强既可以通过重写核心执行器实现，也可以通过元数据预计算、声明式语句注入和标准插件点实现；后者通常更容易兼容上游。

> **面试锚点**
> - MyBatis-Plus 如何生成通用 CRUD？
> - TableInfo 在什么时候初始化？
> - 为什么不直接替换 MyBatis Executor？

## Related

- [MyBatis 配置与 Mapper 代理](/notes/source/java/storage/mybatis-3/architecture/)
- [MyBatis-Plus Mapper 注入](/notes/source/java/storage/mybatis-plus/mapper-injection/)
