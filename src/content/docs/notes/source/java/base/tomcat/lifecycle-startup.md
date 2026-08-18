---
title: 生命周期与启动
description: 从 Bootstrap、Catalina 到 LifecycleBase，理解 Tomcat 组件初始化、启动和状态传播。
category: Backend
tags: [Source Reading, Tomcat, Lifecycle]
order: 31
updatedDate: 2026-08-15
difficulty: advanced
status: stable
lastReviewed: 2026-08-15
draft: false
sidebar: { order: 31 }
---

Tomcat 启动由配置解析、组件树构建、生命周期状态机和父子级联启动共同完成。

<!-- more -->

```text
Bootstrap -> Catalina.load -> Digester -> Server/Service/Connector/Engine
                                      -> init() -> start()
```

`Catalina#start` 在 `java/org/apache/catalina/startup/Catalina.java:868`；Connector 规则在 `Catalina.java:538`。`LifecycleBase#init` 在 `java/org/apache/catalina/util/LifecycleBase.java:121` 调用 `initInternal`（`:128`、`:141`）；`start` 在 `:145` 调用 `startInternal`（`:170`、`:199`）。

## 为什么采用状态机

**替代方案**：每个组件使用独立的 `init/start` 布尔值。
**为什么不行**：无法表达初始化中、启动准备和失败回滚等中间状态，也无法统一处理重复调用。`LifecycleState` 让父子组件有明确的状态传播边界。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| 重复启动 | 返回或报状态错误 | 已处于 `STARTED` | 只使用公共生命周期 API |
| 子组件失败 | 整体启动失败 | 服务树不完整 | 查最内层异常 |
| 只启动 Connector | 端口开但请求失败 | 没有 Container/Adapter | 通过 Service 编排 |
| 停止超时 | 线程仍存活 | Endpoint 或应用线程未退出 | 检查 Executor 和异步任务 |

## 可迁移知识

生命周期状态机适合连接池、消息消费者和插件系统：把调用顺序约束集中到基类，并让失败状态可观测。

> **面试锚点**
> - `init` 与 `start` 为什么拆开？
> - 父子容器如何保证启动顺序？
> - 启动失败如何回滚资源？

## Related

- [容器层级与组件关系](/notes/source/java/base/tomcat/container-hierarchy/)
- [Web 应用启动与 Servlet 加载](/notes/source/java/base/tomcat/webapp-startup/)