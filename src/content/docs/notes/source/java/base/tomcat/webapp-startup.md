---
title: Web 应用启动与 Servlet 加载
description: ContextConfig 如何发现 Web 应用组件，StandardWrapper 如何延迟加载 Servlet。
category: Backend
tags: [Source Reading, Tomcat, Servlet]
order: 37
updatedDate: 2026-08-19
difficulty: advanced
status: stable
lastReviewed: 2026-08-19
sidebar: { order: 37 }
---

Web 应用启动分成构建部署模型和按需创建 Servlet 两段。前者准备 Context、Wrapper、Listener 与资源，后者避免所有 Servlet 在启动时同时实例化。

<!-- more -->

## 先给答案：Web 应用默认延迟加载是在启动速度和首请求延迟之间取舍

Tomcat 可以在部署时立即创建 Servlet，也可以等到第一次请求再加载。延迟加载减少启动阶段的类加载和初始化成本，适合应用很多但访问不均匀的场景；代价是首个请求可能承担加载、实例化和初始化延迟。

如果 Servlet 初始化包含连接数据库、读取大配置或失败敏感的检查，延迟加载会把启动失败推迟到线上请求。是否提前加载应根据启动探活、首请求 SLA 和初始化副作用决定，而不是把 lazy 当成绝对优化。


```text
Context start -> ContextConfig#configureStart -> create Wrapper/mappings
first request -> StandardWrapperValve -> StandardWrapper#loadServlet -> service
```

`ContextConfig#configureStart` 位于 `java/org/apache/catalina/startup/ContextConfig.java:1035`，创建 Wrapper 在 `:1546`，加入 Context 在 `:1593`。`StandardWrapper#loadServlet` 位于 `java/org/apache/catalina/core/StandardWrapper.java:734`，启动阶段入口为 `:1176`；`StandardWrapperValve#invoke` 位于 `StandardWrapperValve.java:84`。

## 为什么默认延迟加载

**替代方案**：Context 启动时实例化全部 Servlet。
**为什么不行**：低频 Servlet 会拖慢启动，单个初始化失败还可能阻断应用。延迟加载把成本移动到首请求，代价是首请求延迟和运行时初始化异常。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| 首请求慢 | 第一次访问延迟 | 初始化和依赖加载 | 对关键 Servlet 预热或 load-on-startup |
| 初始化失败 | 首次请求 500 | `init` 抛异常 | 发布前校验 |
| 注解未生效 | 组件未发现 | 扫描配置不匹配 | 检查 SCI 和 metadata-complete |
| 重载残留 | 旧线程仍在 | 应用资源未关闭 | 实现销毁与释放 |

## 可迁移知识

配置期建图、运行期惰性实例化适用于插件、路由处理器和依赖注入容器，必须配套预热和并发初始化保护。

> **面试锚点**
> - Servlet 什么时候实例化？
> - `load-on-startup` 改变了什么？
> - ContextConfig 和 Wrapper 各自负责什么？

## Related

- [类加载隔离](/notes/source/java/base/tomcat/classloader-isolation/)
- [Mapper 路由与 Pipeline/Valve](/notes/source/java/base/tomcat/mapper-valve/)
