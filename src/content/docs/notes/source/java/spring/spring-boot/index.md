---
title: Spring Boot
description: Spring Boot 源码解析总览：启动编排、自动装配、条件评估、配置绑定、内嵌 Web Server 与 Actuator。
category: Backend
tags:
  - Source Reading
  - Spring Boot
  - Auto Configuration
order: 2
updatedDate: 2026-08-19
difficulty: advanced
status: stable
lastReviewed: 2026-08-19
draft: false
sidebar:
  order: 2
---

Spring Boot 的核心不是少写配置，而是把 Spring Framework 的容器能力包装成一条可扩展的启动流水线：应用发现环境、筛选自动配置、绑定外部属性，最后选择并启动 Web 运行时。

<!-- more -->

## 本册问题地图

Spring Boot 的核心不是少写配置，而是把“运行环境、条件判断、自动装配和应用启动”编排成一条可解释的装配链：

1. `SpringApplication.run()` 如何准备环境、上下文和监听器？
2. 自动配置候选从哪里来，为什么使用 imports 文件而不是扫描所有类？
3. 条件注解如何决定某个配置生效或跳过？
4. 配置绑定如何把扁平、分层、类型化配置变成对象？
5. WebServer 为什么在容器 refresh 过程中创建，并如何被生命周期管理？
6. Actuator 如何把内部能力抽象成 endpoint operation，再适配 HTTP/JMX 等协议？

读完整册后，应当能解释“一个 starter 为什么会生效、什么时候不生效，以及启动失败时该看哪一层”。


## 版本快照

| 项 | 值 |
| --- | --- |
| 仓库 | `spring-projects/spring-boot` |
| 本地路径 | `E:\source\java\spring\spring-boot` |
| 分支 | `main` |
| Commit | `3575c12ae5`（2026-08-12） |
| 最近 tag | ⚠️ `v1.0.0.RC4` |

> 本册坐标均基于上述 commit。最近 tag 只作祖先标签参考，正文以分支和 commit 为准。

## 它解决什么问题

- Spring Framework 提供容器，但应用仍需自行组装环境、资源、Web 容器和大量基础 Bean。
- 类路径、配置文件和运行模式不同，不能靠一份静态 XML 覆盖所有部署场景。
- 组件需要默认可用又不能覆盖用户显式定义，因此必须把条件、排序和回退规则编码进启动流程。

## 模块地图

| 模块 | 职责 | 关键入口 |
| --- | --- | --- |
| `core/spring-boot` | 启动编排、环境、配置绑定 | `SpringApplication`、`Binder` |
| `core/spring-boot-autoconfigure` | 自动配置、条件与元数据 | `AutoConfigurationImportSelector` |
| `module/spring-boot-web-server` | Web Server 与应用上下文 | `ServletWebServerApplicationContext` |
| `module/spring-boot-actuator` | 端点模型与发现 | `EndpointDiscoverer` |

## 读码入口顺序

1. `SpringApplication#run()`：看启动阶段如何串起监听器、环境和上下文。
2. `AutoConfigurationImportSelector#selectImports()`：看候选配置如何被读取、排除和排序。
3. `SpringBootCondition#matches()`：看条件结果如何被记录。
4. `Binder#bind()`：看属性如何落到类型化对象。
5. `ServletWebServerApplicationContext#onRefresh()`：看内嵌容器何时创建。
6. `EndpointDiscoverer#discoverEndpoints()`：看 Actuator 如何发现端点。

## 本册目录

- [整体架构](/notes/source/java/spring/spring-boot/architecture/)
- [SpringApplication 启动流程](/notes/source/java/spring/spring-boot/startup/)
- [自动装配与 imports](/notes/source/java/spring/spring-boot/auto-configuration/)
- [条件注解与评估报告](/notes/source/java/spring/spring-boot/conditions/)
- [配置绑定与 Binder](/notes/source/java/spring/spring-boot/configuration-binding/)
- [内嵌 Web Server](/notes/source/java/spring/spring-boot/web-server/)
- [Actuator 端点模型](/notes/source/java/spring/spring-boot/actuator/)
- [面试专题](/notes/source/java/spring/spring-boot/interview/)

## 横向对照

| 对象 | 对照点 |
| --- | --- |
| Spring Framework `refresh()` | Boot 负责启动编排，Framework 负责容器刷新 |
| `ServiceLoader` | Boot 加入条件、排序和排除能力 |
| Micronaut / Quarkus | Boot 偏运行时条件装配，后者更多前移到编译期 |

## Related

- [Spring Framework](/notes/source/java/spring/spring-framework/)
- [Java 源码解析索引](/notes/source/java/)
