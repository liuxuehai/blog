---
title: 内嵌 Web Server
description: ServletWebServerApplicationContext 如何在 refresh 阶段创建并启动 Tomcat、Jetty 或其他 Web Server。
category: Backend
tags: [Source Reading, Spring Boot, Web Server]
order: 26
updatedDate: 2026-08-19
difficulty: advanced
status: stable
lastReviewed: 2026-08-19
draft: false
sidebar:
  order: 26
---

Spring Boot 把 Web 容器抽象为 `WebServerFactory`，让应用上下文不依赖 Tomcat 的具体 API，同时保留连接器、端口和 SSL 的定制入口。

<!-- more -->

## 先给答案：内嵌 WebServer 必须成为 ApplicationContext 生命周期的一部分

WebServer 不是在 main 方法里独立启动的外部组件，而是在上下文 refresh 期间由 WebServerFactory 创建，并注册到 WebServerStartStopLifecycle。这样服务器启动、Bean 初始化、端口绑定和上下文关闭可以共享同一套生命周期与失败回滚。

如果端口绑定发生在容器准备好之前，应用可能出现“端口已监听但 Bean 未就绪”；如果服务器不随上下文关闭，测试和热重启会留下线程与端口。把 WebServer 纳入 refresh，是为了让网络可用性与应用可用性拥有同一个状态边界。


## 创建链路

```text
ApplicationContext.refresh
        │
        ▼
ServletWebServerApplicationContext.onRefresh
        ├─► getWebServerFactory
        ├─► factory.getWebServer(servletContext)
        └─► WebServer.start
```

## 实现拆解

- `ServletWebServerApplicationContext` 在 `module/spring-boot-web-server/src/main/java/org/springframework/boot/web/server/servlet/context/ServletWebServerApplicationContext.java:95`。
- `onRefresh()` 在 `:161` 先调用父类刷新，再创建服务器。
- 创建入口 `createWebServer()` 在 `:183`。
- 接口 `WebServerFactory` 位于 `module/spring-boot-web-server/src/main/java/org/springframework/boot/web/server/WebServerFactory.java:28`。
- `WebServer` 生命周期抽象位于同模块 `WebServer.java:28`。
- Servlet 专用工厂为 `servlet/ServletWebServerFactory.java`。
- Tomcat 实现位于 `module/spring-boot-tomcat/src/main/java/org/springframework/boot/tomcat/servlet/TomcatServletWebServerFactory.java`。
- Web Server 创建过程打上 startup step，`ServletWebServerApplicationContext.java:187` 记录工厂信息。

## 为什么在上下文 refresh 中创建

**替代方案**：在 `main()` 中直接 new Tomcat 并启动。
**为什么不行**：服务器需要依赖容器中的 Servlet、过滤器、监听器和用户配置，过早启动会绕开 Bean 生命周期。
**证据**：`onRefresh()` 先完成父类上下文刷新，再通过工厂创建服务器，保证组件已经可发现。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| 端口被占用 | 启动失败 | Web Server bind 失败 | 明确端口并检查进程 |
| 同时存在多个工厂 | Factory 注入冲突 | 多个 Web 栈同时满足条件 | 排除不需要的 starter |
| 在 Bean 初始化中访问端口 | 端口尚未就绪 | 创建发生在 refresh 的特定阶段 | 监听 `WebServerInitializedEvent` |

## 可迁移知识

稳定的工厂接口加上运行时实现，是把基础设施替换成本从业务代码中隔离出来的典型方式。

> **面试锚点**
> - 内嵌 Tomcat 是什么时候启动的？
> - `WebServerFactory` 和 `WebServer` 的职责差异是什么？
> - 为什么 Boot 不在 `main()` 里直接创建容器？

## Related

- [整体架构](/notes/source/java/spring/spring-boot/architecture/)
- [SpringApplication 启动流程](/notes/source/java/spring/spring-boot/startup/)
- Tomcat 分册待后续落地
