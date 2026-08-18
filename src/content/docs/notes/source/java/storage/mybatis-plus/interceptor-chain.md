---
title: 插件链与 SQL 改写
description: MybatisPlusInterceptor 如何编排 InnerInterceptor 并在 query、update、prepare 阶段修改执行行为。
category: Backend
tags: [Source Reading, MyBatis-Plus, Interceptor]
order: 65
updatedDate: 2026-08-16
sidebar:
  order: 65
---

MyBatis-Plus 用一个外层 MyBatis `Interceptor` 统一承载多个 `InnerInterceptor`，把分页、租户、数据权限、乐观锁和防全表更新拆成可组合组件。

<!-- more -->

```text
MyBatis Invocation
  └─► MybatisPlusInterceptor
       ├─► beforeQuery / willDoQuery / afterQuery
       ├─► beforeUpdate
       ├─► beforeGetBoundSql
       └─► beforePrepare
             └─► inner interceptors in registration order
```

`MybatisPlusInterceptor#intercept` 根据目标方法分派 query/update/boundSql，再按注册顺序调用 inner interceptor：见 `MybatisPlusInterceptor.java:41-105`、`MybatisPlusInterceptor.java:117-155`。

每个 inner interceptor 只关注一个横切问题，`InnerInterceptor` 提供默认生命周期钩子；这使插件可以只实现 `beforeUpdate` 或 `beforePrepare`：见 `InnerInterceptor.java:38-120`、`PluginUtils.java:30-100`、`InterceptorIgnoreHelper.java:30-150`。

插件适配 MyBatis 的入口仍是标准 `Plugin#wrap` 和 `Interceptor#plugin`：见 `MybatisPlusInterceptor.java:160-190`、`MybatisPlusInterceptor.java:196-225`、`MybatisConfiguration.java:115-145`。

## 为什么使用外层聚合器

**替代方案**：每个功能都注册一个 MyBatis Interceptor。
**为什么不行**：多个插件对 invocation、BoundSql 和忽略注解的处理会分散，顺序和配置难以管理。
**证据**：`MybatisPlusInterceptor` 只向 MyBatis 注册一次，内部维护 `List<InnerInterceptor>` 并统一分派。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| 插件顺序错误 | count 或租户条件异常 | 前一个插件改变了后一个插件的输入 | 明确注册顺序并测试组合 |
| 忽略注解未生效 | 某 Mapper 仍被改写 | ignore 判断依赖 statement id 和注解解析 | 检查注解位置与 mapper 方法 |
| 同时修改 BoundSql | 参数索引错位 | SQL 与 parameter mappings 不一致 | 使用 `PluginUtils.mpBoundSql` 同步修改 |

## 可迁移知识

一个稳定的插件系统通常需要“单一外层适配器 + 多个内部策略 + 明确生命周期钩子”，这样组合顺序和可观测性更清晰。

> **面试锚点**
> - MybatisPlusInterceptor 为什么是聚合器？
> - InnerInterceptor 的执行顺序如何影响结果？
> - 改 SQL 时为什么必须同步参数映射？

## Related

- [分页与租户插件](/notes/source/java/storage/mybatis-plus/pagination-tenant-lock/)
- [MyBatis 缓存与插件](/notes/source/java/storage/mybatis-3/cache-and-plugin/)
