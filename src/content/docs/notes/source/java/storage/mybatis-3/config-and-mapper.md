---
title: 配置解析与 Mapper 代理
description: XMLConfigBuilder、XMLMapperBuilder、MappedStatement 与 MapperProxy 的构建和调用链。
category: Backend
tags: [Source Reading, MyBatis, Dynamic Proxy]
order: 12
updatedDate: 2026-08-19
difficulty: advanced
status: stable
lastReviewed: 2026-08-19
draft: false
sidebar:
  order: 12
---

MyBatis 的“接口不用实现类”不是魔法，而是两次注册：启动时把 SQL 注册为 `MappedStatement`，运行时把接口注册为 `MapperProxyFactory`。

<!-- more -->

## 先给答案：Mapper 代理只是最后一跳，真正的“实现”在启动期已经被编译成命令表

MyBatis 把接口方法和 SQL 文件拆成两个阶段：启动时解析 XML/注解，校验并注册 `MappedStatement`；运行时代理只负责根据方法签名找到 statement，再把参数交给 `SqlSession`。所以 Mapper 没有实现类，不代表没有实现，而是把实现从 Java 方法体转移到了配置解析和运行时分派。

这条分工解释了两个常见现象：启动阶段可能因为 namespace、statement id 或重复注册失败；运行阶段则主要处理参数、返回值和会话执行。要排查 Mapper 问题，先判断错误发生在“命令表没建出来”，还是“命令已经找到但执行/映射失败”，不要一上来只看代理类。


## 设计概览

```text
config.xml -> XMLConfigBuilder -> XMLMapperBuilder
                                  |- ResultMap
                                  |- MappedStatement(namespace.id)
                                  `- MapperRegistry

mapper.select() -> MapperRegistry#getMapper -> MapperProxy#invoke
                                             `-> MapperMethod#execute
```

## 实现拆解

- `XMLConfigBuilder#parse` 解析根节点并调用 `parseConfiguration`（`mybatis-3/src/main/java/org/apache/ibatis/builder/xml/XMLConfigBuilder.java:105-145`）。
- plugins 节点实例化后先注入 properties，再加入 `InterceptorChain`（`mybatis-3/src/main/java/org/apache/ibatis/builder/xml/XMLConfigBuilder.java:190-208`）。
- mappers 支持 resource、URL、class 和 package，最终归入 mapper 解析路径（`mybatis-3/src/main/java/org/apache/ibatis/builder/xml/XMLConfigBuilder.java:373-420`）。
- `XMLMapperBuilder#parse` 防止 resource 重复加载，再处理 cache、resultMap 和 statement（`mybatis-3/src/main/java/org/apache/ibatis/builder/xml/XMLMapperBuilder.java:103-130`）。
- `MapperBuilderAssistant#addMappedStatement` 组合 namespace、id、参数类型、返回类型和 SQL source（`mybatis-3/src/main/java/org/apache/ibatis/builder/MapperBuilderAssistant.java:199-268`）。
- 动态 SQL 由 `XMLScriptBuilder` 构造成 `SqlSource`（`mybatis-3/src/main/java/org/apache/ibatis/scripting/xmltags/XMLScriptBuilder.java:35-74`）。
- `XMLMapperBuilder#bindMapperForNamespace` 把 namespace 对应接口加入 registry（`mybatis-3/src/main/java/org/apache/ibatis/builder/xml/XMLMapperBuilder.java:401-414`）。
- `MapperRegistry#addMapper` 保存接口到 `MapperProxyFactory` 的映射，并触发注解解析（`mybatis-3/src/main/java/org/apache/ibatis/binding/MapperRegistry.java:60-82`）。
- `MapperRegistry#getMapper` 找到 factory 后创建代理（`mybatis-3/src/main/java/org/apache/ibatis/binding/MapperRegistry.java:44-51`）。
- `MapperProxy#invoke` 对 Object、default method 和 SQL method 采用不同路径（`mybatis-3/src/main/java/org/apache/ibatis/binding/MapperProxy.java:59-67`）。
- `MapperMethod#execute` 按 `SqlCommandType` 把参数转换为 `SqlSession` 调用（`mybatis-3/src/main/java/org/apache/ibatis/binding/MapperMethod.java:57-138`）。
- 多参数由 `ParamNameResolver#getNamedParams` 统一成 Map 或单参数对象（`mybatis-3/src/main/java/org/apache/ibatis/reflection/ParamNameResolver.java:46-119`）。

## 关键取舍

### 为什么 statement id 使用 namespace + 方法名

**替代方案**：只用方法名注册 SQL。
**为什么不行**：不同 mapper 可以有同名方法，单一名称会冲突；完整 namespace 还能让 XML 与接口形成稳定边界。
**证据**：`MapperMethod.SqlCommand` 以接口名和方法名查找 `MappedStatement`（`mybatis-3/src/main/java/org/apache/ibatis/binding/MapperMethod.java:217-231`）。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| 接口方法没有 SQL | `BindingException` | 找不到对应 statement | 检查 namespace、方法名和加载路径 |
| 多参数未加 `@Param` | 取不到预期名称 | 默认名称可能是 `param1` | 显式使用 `@Param` |
| XML 与注解重复 | statement 已存在 | 同一 namespace + id 重复注册 | 统一定义来源 |

## 可迁移知识

“接口声明 + 运行时代理 + 稳定字符串 id”适合 RPC stub、生成式客户端和消息消费者。关键不是代理，而是启动期把声明编译成可验证命令表。

> **面试锚点**
> - Mapper 接口为什么不需要实现类？
> - `MapperProxy` 如何区分 default method 和 SQL method？
> - 多参数为什么常见 `@Param`？

## Related

- [整体架构](/notes/source/java/storage/mybatis-3/architecture/)
- [SqlSession 与 Executor](/notes/source/java/storage/mybatis-3/session-executor/)
- [缓存与插件链](/notes/source/java/storage/mybatis-3/cache-and-plugin/)
