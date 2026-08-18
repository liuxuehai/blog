---
title: 面试专题
description: Spring Boot 高频面试题、高难追问与源码级加分回答。
category: Backend
tags: [Source Reading, Spring Boot, Interview]
order: 29
updatedDate: 2026-08-15
difficulty: advanced
status: stable
lastReviewed: 2026-08-15
draft: false
sidebar:
  order: 29
---

Spring Boot 面试的重点不是背 starter，而是说明启动阶段如何做选择、如何保留覆盖点，以及如何解释失败原因。

<!-- more -->

## 高频题

### Spring Boot 启动流程是什么？

**30 秒版**：`SpringApplication#run()` 创建监听器和环境，选择上下文，准备主配置源，然后委托 Spring Framework `refresh()`，最后发送 started/running 事件。

**展开**：入口在 `core/spring-boot/.../SpringApplication.java:304`，上下文创建在 `:318`，准备在 `:380`，刷新在 `:441`。

**加分项**：`getRunListeners()` 在 `:453`，说明启动事件并不是散落在 main 方法里的日志调用。

**常见错答**：把 Boot 说成重新实现了 Spring 容器。

### 自动配置为什么能被覆盖？

**30 秒版**：自动配置只是候选配置，真正注册前还要过条件判断；用户提供同类型 Bean 后，`@ConditionalOnMissingBean` 会使默认配置不成立。

**展开**：候选由 `AutoConfigurationImportSelector#selectImports()` `:119` 提供，条件结果由 `SpringBootCondition#matches()` `:44` 记录。

**加分项**：排除和排序在 `AutoConfigurationGroup` `:431`、`:489` 完成。

**常见错答**：认为 starter 中的所有 Bean 都一定会创建。

### `Binder` 和 `@Value` 有什么区别？

**30 秒版**：`@Value` 适合少量单值注入，`Binder` 面向整棵配置对象，支持嵌套、集合、类型转换和校验。

**展开**：`Binder#bind()` 从 `Binder.java:235` 进入，聚合类型在 `:472`，配置属性 Bean 通过 `ConfigurationPropertiesBinder.java:92` 绑定。

**加分项**：绑定过程可以通过 `BindHandler` 插入校验和错误处理。

**常见错答**：说两者只是注解名字不同。

## 高难追问

### 内嵌 Tomcat 在什么时候创建？

**30 秒版**：Servlet Web Server 上下文的 `onRefresh()` 在 `ServletWebServerApplicationContext.java:161` 被调用，随后 `createWebServer()` `:183` 获取工厂并创建服务器。

**加分项**：这保证 Servlet、过滤器和上下文 Bean 已完成必要的注册。

### 条件报告有什么价值？

**30 秒版**：它保存每个条件的命中结果和原因，能解释为什么某个自动配置没有生效。

**源码点**：`ConditionEvaluationReport.java:53`，候选记录在 `:105`。

### Actuator 为什么不直接暴露 Controller？

**30 秒版**：端点先抽象为协议无关的 Operation，再由 Web 或 JMX 适配器暴露，便于统一权限和生命周期。

**源码点**：`EndpointDiscoverer.java:74`、`:140`；`WebEndpointAutoConfiguration.java:92`。

## 场景题

### 线上发现某个自动配置没有生效，怎么排查？

先确认 starter 和 imports 是否进入运行时 classpath，再查看条件评估报告，区分缺类、缺 Bean、属性不匹配和显式排除，最后检查用户 Bean 是否触发了 missing-bean 条件。

### 启动变慢，如何定位？

用启动事件和 startup step 区分环境准备、条件评估、Bean 创建和 Web Server 创建；重点检查自定义监听器、条件中的 I/O、远程配置源和大量自动配置模块。

## 反向问面试官

- 线上应用使用哪些自动配置排除项？
- Actuator 端点是独立管理端口还是复用业务端口？
- 启动耗时是否接入了 startup step 或 tracing？

## Related

- [整体架构](/notes/source/java/spring/spring-boot/architecture/)
- [自动装配与 imports](/notes/source/java/spring/spring-boot/auto-configuration/)
- [Actuator 端点模型](/notes/source/java/spring/spring-boot/actuator/)