---
title: 整体架构
description: Spring Boot 的启动编排、自动配置、绑定基础设施与运行时适配层。
category: Backend
tags: [Source Reading, Spring Boot, Architecture]
order: 21
updatedDate: 2026-08-15
difficulty: advanced
status: stable
lastReviewed: 2026-08-15
draft: false
sidebar:
  order: 21
---

Spring Boot 位于应用代码与 Spring Framework 之间，主要职责是把选择组件、创建时机和外部配置变成可覆盖的启动流程。

<!-- more -->

## 分层

```text
Application.main
     │
     ▼
SpringApplication ── listeners / environment / context
     │
     ├── AutoConfigurationImportSelector
     │       ├── AutoConfiguration.imports
     │       ├── exclusions
     │       └── conditions / ordering
     ├── Binder ── PropertySources ── @ConfigurationProperties
     └── ApplicationContext
             └── WebServerApplicationContext
                     └── WebServer + Actuator endpoints
```

| 层 | 职责 | 关键类 |
| --- | --- | --- |
| 启动编排 | 建立启动上下文，驱动生命周期事件 | `SpringApplication` |
| 装配决策 | 找候选配置并做条件过滤 | `AutoConfigurationImportSelector` |
| 配置输入 | 多属性源转换成类型化对象 | `Binder` |
| 运行时适配 | 选择 Servlet 或 Reactive 上下文 | `ApplicationContextFactory` |
| 运维暴露 | 将端点操作映射到 HTTP/JMX | `EndpointDiscoverer` |

## 主流程一：启动

```text
run(args)
  ├─► getRunListeners / environment
  ├─► createApplicationContext
  ├─► prepareContext
  ├─► refreshContext ──► Spring Framework refresh()
  ├─► listeners.started
  └─► listeners.running
```

`SpringApplication#run()` 位于 `core/spring-boot/src/main/java/org/springframework/boot/SpringApplication.java:304`，上下文创建、准备、刷新分别在 `:318`、`:320`、`:441`。`getRunListeners()` 在 `:453`，`createApplicationContext()` 在 `:579`。

## 主流程二：请求处理

```text
HTTP request
   │
   ▼
WebServer (Tomcat / Jetty / Netty)
   ├── Spring MVC / WebFlux handler
   └── Actuator endpoint mapping
           └── operation invoker
```

Servlet 上下文在 `module/spring-boot-web-server/src/main/java/org/springframework/boot/web/server/servlet/context/ServletWebServerApplicationContext.java:161` 的 `onRefresh()` 创建 Web Server，`:183` 进入具体创建逻辑。Actuator Web 自动配置在 `module/spring-boot-actuator-autoconfigure/src/main/java/org/springframework/boot/actuate/autoconfigure/endpoint/web/WebEndpointAutoConfiguration.java:68`。

## 扩展点全景

| 扩展点 | 触发时机 | 典型用途 |
| --- | --- | --- |
| `SpringApplicationRunListener` | 启动阶段事件 | 启动日志、指标、bootstrap |
| `EnvironmentPostProcessor` | 上下文刷新前 | 加载额外配置源 |
| `AutoConfigurationImportFilter` | 自动配置导入时 | 按类路径过滤 |
| `@Conditional...` | 配置类解析时 | 按环境决策 |
| `WebServerFactoryCustomizer` | Web Server 创建前 | 端口、SSL、连接器定制 |
| `EndpointFilter` | Actuator 发现时 | 暴露面治理 |

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| 同时引入多个 Web 栈 | 上下文或 Bean 冲突 | 多套类路径条件同时成立 | 明确 `WebApplicationType` |
| 用户 Bean 覆盖默认 Bean | 自动配置不生效 | `@ConditionalOnMissingBean` 认为用户已接管 | 检查条件报告 |
| 启动监听器抛异常 | 刷新前退出 | 监听器属于启动编排链 | 只做轻量、可隔离工作 |

## 可迁移知识

这是“默认实现 + 条件门控 + 用户覆盖”的插件系统模式。需要兼容多环境的框架，都可以把候选组件、决策条件和实例化拆成三层。

> **面试锚点**
> - Spring Boot 和 Spring Framework 的职责边界是什么？
> - 自动配置为什么能被用户 Bean 覆盖？
> - Web Server 在哪个生命周期阶段创建？

## Related

- [SpringApplication 启动流程](/notes/source/java/spring/spring-boot/startup/)
- [自动装配与 imports](/notes/source/java/spring/spring-boot/auto-configuration/)
- [Spring Framework refresh 生命周期](/notes/source/java/spring/spring-framework/refresh-lifecycle/)