---
title: SPI 扩展机制
description: ExtensionLoader 如何加载目录、创建包装器、自适应扩展并完成依赖注入。
category: Backend
tags: [Source Reading, Dubbo, SPI, Extension]
order: 22
updatedDate: 2026-08-16
difficulty: advanced
status: stable
lastReviewed: 2026-08-16
draft: false
sidebar: { order: 22 }
---

Dubbo SPI 在 Java `ServiceLoader` 之上增加了命名扩展、包装器、自适应类、依赖注入和多级 ScopeModel。它解决的不是“找到一个实现”，而是让实现可以被配置、组合和按作用域管理。

<!-- more -->

## 设计概览

```text
getExtension("failover")
  -> ExtensionDirector 找到 ExtensionLoader
  -> loadDirectory 读取 META-INF/dubbo/
  -> 解析 name=class
  -> 创建原始实例
  -> injectExtension
  -> 按 Wrapper 反向包裹
  -> 缓存实例返回
```

## 实现拆解

### 1. Loader 的作用域

入口 `ExtensionLoader#getExtensionLoader` 在 `dubbo-common/src/main/java/org/apache/dubbo/common/extension/ExtensionLoader.java:242`，实际委托给默认 `ApplicationModel`。`ExtensionDirector#getExtensionLoader` 位于 `dubbo-common/src/main/java/org/apache/dubbo/common/extension/ExtensionDirector.java:67`，会从当前 Director、父级 Director 或新建 Loader 中选择。

这种设计让框架级、应用级和模块级扩展可以隔离，避免测试或多应用环境共享静态单例造成配置串扰。

### 2. 命名扩展与缓存

`getExtension(String name)` 位于 `ExtensionLoader.java:549`，带包装开关的重载在 `:558`，真正创建发生在 `:576` 调用 `createExtension`。`createExtension` 在 `:773` 解析实现类，在 `:781` 创建缓存实例，在 `:784` 执行注入。

### 3. 目录加载

`loadDirectory` 位于 `ExtensionLoader.java:1005`，底层 `loadDirectoryInternal` 在 `:1045` 扫描资源。文件名按接口全名组织，解析后形成 name 到 class 的映射，并识别自适应类、包装器和激活扩展。

### 4. 注入与包装

`createExtensionInstance` 在 `ExtensionLoader.java:825` 负责实例化；`injectExtension` 在 `:856` 通过 ExtensionFactory 查找 setter 依赖。包装器在创建扩展后包裹原对象，使监控、监听、过滤等横切能力不污染核心实现。

## 关键取舍

### 为什么不直接使用 Java ServiceLoader

**替代方案**：每个接口只有一个 `ServiceLoader` 实现，业务自行 `if/else` 选择。**为什么不行**：无法表达按名称选择、包装器链、自适应分派和作用域隔离，框架会把配置逻辑散落到各处。**证据**：`ExtensionLoader` 同时维护 `getExtension`、`loadDirectory`、`injectExtension` 和包装创建路径，说明 Dubbo 把“发现”和“组装”合并为运行时扩展系统。

## 源码坐标索引

- `ExtensionDirector#getExtensionLoader` — `dubbo-common/src/main/java/org/apache/dubbo/common/extension/ExtensionDirector.java:67`
- `ExtensionDirector#createExtensionLoader` — `dubbo-common/src/main/java/org/apache/dubbo/common/extension/ExtensionDirector.java:104`
- `ExtensionLoader#getExtensionLoader` — `dubbo-common/src/main/java/org/apache/dubbo/common/extension/ExtensionLoader.java:242`
- `ExtensionLoader#getExtension` — `dubbo-common/src/main/java/org/apache/dubbo/common/extension/ExtensionLoader.java:549`
- `ExtensionLoader#getExtension(String, boolean)` — `dubbo-common/src/main/java/org/apache/dubbo/common/extension/ExtensionLoader.java:558`
- `ExtensionLoader#createExtension` — `dubbo-common/src/main/java/org/apache/dubbo/common/extension/ExtensionLoader.java:773`
- `ExtensionLoader#createExtensionInstance` — `dubbo-common/src/main/java/org/apache/dubbo/common/extension/ExtensionLoader.java:825`
- `ExtensionLoader#injectExtension` — `dubbo-common/src/main/java/org/apache/dubbo/common/extension/ExtensionLoader.java:856`
- `ExtensionLoader#loadDirectory` — `dubbo-common/src/main/java/org/apache/dubbo/common/extension/ExtensionLoader.java:1005`

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| 扩展名拼写错误 | `No such extension` | 配置名不在资源目录 | 检查 `META-INF/dubbo/` 和默认扩展名 |
| setter 注入形成环 | 创建扩展递归或失败 | 扩展之间互相依赖 | 降低扩展耦合，改由调用方组装 |
| Wrapper 顺序不符合预期 | 过滤器或监控顺序变化 | 包装器应用顺序由 Loader 决定 | 阅读 Wrapper 排序和测试，不靠类名猜顺序 |

## 可迁移知识

成熟 SPI 往往包含三层：发现实现、按配置选择、组装横切能力。插件系统、支付渠道、存储驱动都可以沿用，但必须明确作用域和生命周期。

> **面试锚点**
> - Dubbo SPI 和 Java SPI 的差异是什么？
> - Wrapper、自适应扩展和 ExtensionFactory 分别解决什么问题？
> - 为什么 ExtensionLoader 不能简单设计成全局静态 Map？

## Related

- [整体架构](/notes/source/java/rpc/dubbo/architecture/)
- [服务导出与引用](/notes/source/java/rpc/dubbo/service-export-reference/)
- [Spring Framework AOP 代理创建](/notes/source/java/spring/spring-framework/aop-proxy/)
