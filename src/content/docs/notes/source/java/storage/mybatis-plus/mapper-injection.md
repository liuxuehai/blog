---
title: Mapper 与 SQL 注入
description: ISqlInjector、AbstractMethod 如何为 BaseMapper 派生接口生成 MappedStatement。
category: Backend
tags: [Source Reading, MyBatis-Plus, Mapper]
order: 63
updatedDate: 2026-08-16
sidebar:
  order: 63
---

MyBatis-Plus 的 CRUD 不是运行时拼接一段 SQL 字符串，而是在 Mapper 解析阶段生成并注册 `MappedStatement`。

<!-- more -->

```text
Mapper interface
  └─► SqlInjector#getMethodList
       └─► AbstractMethod#inject
            ├─► build SQL / SqlSource
            ├─► build ResultMap
            └─► Configuration.addMappedStatement
```

`ISqlInjector` 定义方法列表，`AbstractMethod` 提供通用注入模板，具体方法类只负责 SQL 形态和参数映射：见 `ISqlInjector.java:26-50`、`DefaultSqlInjector.java:30-80`、`AbstractMethod.java:53-120`、`AbstractMethod.java:150-210`、`AbstractMethod.java:250-300`、`AbstractMethod.java:390-445`。

`BaseMapper` 的方法名与注入的 statement id 对齐，代理调用时直接进入 MyBatis 的 `MappedStatement`；批量方法和扩展方法可以通过自定义 injector 增加：见 `BaseMapper.java:97-150`、`BaseMapper.java:480-570`、`DefaultSqlInjector.java:80-120`、`MybatisMapperAnnotationBuilder.java:68-150`。

## 为什么在启动期注入

**替代方案**：每次调用 `insert/updateById` 时动态生成 SQL。
**为什么不行**：SQL、参数映射和 ResultMap 都会重复构造，也难以与 MyBatis 的缓存和 statement 生命周期一致。
**证据**：`AbstractMethod#inject` 通过 `addMappedStatement` 把结果注册到 Configuration，运行时只做参数绑定和执行。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| 自定义 XML 同名 | 默认方法未注入 | 注入器检测到 statement 已存在 | 修改 statement id 或复用 XML |
| 自定义 injector 漏方法 | BaseMapper API 报错 | 方法列表没有完整覆盖 | 基于默认列表扩展 |
| SQL 片段参数不一致 | BindingException | script 与 parameterType 不匹配 | 对照 TableInfo 和参数映射 |

## 可迁移知识

代码生成不一定意味着生成 Java 文件；把通用操作编译成运行时元对象，同样能获得复用性并避免源码膨胀。

> **面试锚点**
> - 通用 CRUD 的 MappedStatement 在何时生成？
> - `AbstractMethod` 的模板职责是什么？
> - XML 与注入方法同名时谁生效？

## Related

- [MyBatis-Plus 表元数据](/notes/source/java/storage/mybatis-plus/table-metadata/)
- [MyBatis 配置与 Mapper](/notes/source/java/storage/mybatis-3/config-and-mapper/)
