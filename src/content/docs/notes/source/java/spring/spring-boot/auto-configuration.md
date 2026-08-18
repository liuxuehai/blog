---
title: 自动装配与 imports
description: AutoConfiguration.imports 候选发现、排除、排序与 DeferredImportSelector 分组。
category: Backend
tags: [Source Reading, Spring Boot, Auto Configuration]
order: 23
updatedDate: 2026-08-15
difficulty: advanced
status: stable
lastReviewed: 2026-08-15
draft: false
sidebar:
  order: 23
---

自动装配把“类路径上可能需要的配置”变成候选集合，再交给条件系统决定是否真正注册 Bean。

<!-- more -->

## 数据流

```text
@EnableAutoConfiguration
        │
        ▼
AutoConfigurationImportSelector#selectImports
        ├─► getCandidateConfigurations
        ├─► getExclusions
        ├─► fire import event
        └─► AutoConfigurationGroup.selectImports
                └─► sort + return configuration names
```

## 实现拆解

- `AutoConfigurationImportSelector` 在 `core/spring-boot-autoconfigure/src/main/java/org/springframework/boot/autoconfigure/AutoConfigurationImportSelector.java:78` 实现 `DeferredImportSelector`。
- `selectImports()` 在 `:119` 取得自动配置入口。
- 候选配置由 `getCandidateConfigurations()` 在 `:200` 读取 `META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports`。
- 排除集合由 `getExclusions()` 在 `:247` 处理，非法排除在 `:230` 被校验。
- 分组器 `AutoConfigurationGroup` 在 `:431`，先在 `process()` `:467` 收集配置，再在 `selectImports()` `:489` 排序。
- 排序前移除全局排除项，关键逻辑在 `:501`。
- 测试中的 imports 文件位于 `core/spring-boot-autoconfigure/src/test/resources/META-INF/spring/...AutoConfiguration.imports`。
- 自动配置不会等价于无条件导入，最终是否生效仍取决于 `@Conditional`。

## 为什么使用 imports 文件

**替代方案**：扫描所有包中的 `@Configuration` 类。
**为什么不行**：启动时扫描范围大、候选边界不稳定，还会把不应暴露的内部配置带入容器。
**证据**：候选发现集中在 `getCandidateConfigurations()`，由模块显式声明入口，再由条件和排序完成决策。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| 配置类未写入 imports | 自动配置完全不出现 | 候选发现阶段没有名字 | 检查资源路径和构建产物 |
| 自动配置顺序错误 | Bean 定义覆盖或缺失 | 依赖配置尚未先注册 | 使用 Boot 的 before/after 排序语义 |
| 排除类名错误 | 启动失败或排除无效 | `handleInvalidExcludes` 校验失败 | 使用实际配置类全名 |

## 可迁移知识

显式候选清单比全量扫描更适合插件系统：它控制边界，条件负责环境适配，排序负责依赖关系，三者职责清晰。

> **面试锚点**
> - `AutoConfiguration.imports` 与旧式 `spring.factories` 的职责差异是什么？
> - 自动配置为什么是 deferred import？
> - 用户 Bean 如何阻止默认自动配置？

## Related

- [条件注解与评估报告](/notes/source/java/spring/spring-boot/conditions/)
- [整体架构](/notes/source/java/spring/spring-boot/architecture/)
- [Spring Framework Bean 生命周期](/notes/source/java/spring/spring-framework/bean-lifecycle/)