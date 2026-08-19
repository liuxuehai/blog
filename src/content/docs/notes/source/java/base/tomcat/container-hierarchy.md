---
title: 容器层级与组件关系
description: Server、Service、Engine、Host、Context、Wrapper 的层级职责与生命周期传播。
category: Backend
tags: [Source Reading, Tomcat, Container]
order: 32
updatedDate: 2026-08-19
difficulty: advanced
status: stable
lastReviewed: 2026-08-19
draft: false
sidebar: { order: 32 }
---

Tomcat 的 Container 是表达部署边界的树：Engine 代表服务，Host 代表虚拟主机，Context 代表 Web 应用，Wrapper 代表 Servlet。

<!-- more -->

## 先给答案：四级 Container 是把部署隔离和请求定位拆开

Engine 管全局虚拟服务器，Host 管域名，Context 管 Web 应用，Wrapper 管 Servlet。层级不是为了好看，而是让每一层拥有自己的生命周期、类加载器、配置和请求范围。

请求定位时，层级结构提供逐级缩小的命名空间；启动时，子组件又可以继承父组件能力并保留自己的隔离边界。把所有对象塞进一个 Router 会丢失部署级配置、应用级资源和 Servlet 级映射等差异。


```text
Server -> Service -> Engine -> Host -> Context -> Wrapper
           |          |        |        |          |
        Connector   虚拟服务  域名     Web 应用   Servlet
```

`StandardService#setContainer` 位于 `java/org/apache/catalina/core/StandardService.java:150`，`addConnector` 位于 `:219`；Engine 添加子节点在 `StandardEngine.java:159`，Host 添加 Context 在 `StandardHost.java:662`，Context 添加 Wrapper 在 `StandardContext.java:2790`。通用父子关系由 `ContainerBase#addChild`（`ContainerBase.java:560`）维护。

## 为什么分成四级

**替代方案**：用一个 URI Map 直接映射 Servlet。
**为什么不行**：虚拟主机、应用资源、Session、Realm 和类加载器需要不同作用域。层级让这些资源可以独立部署、停止和继承配置。

`ContainerBase#startInternal` 位于 `ContainerBase.java:712`；周期任务在 `:762` 注册，`backgroundProcess` 在 `:925` 触发子容器、Valve 和周期事件。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| Context 重复 | 部署冲突 | Host 下名称不唯一 | 检查 context path |
| Wrapper 加子节点 | 配置无效 | Wrapper 是叶子容器 | Servlet 放入 Wrapper |
| 后台任务阻塞 | 清理延迟 | 共用周期调度资源 | 重任务异步化 |

## 可迁移知识

这是作用域树模式：配置、权限、缓存和生命周期沿树继承，又能在局部覆盖。

> **面试锚点**
> - 四级容器各自代表什么边界？
> - Connector 为什么不属于 Container？
> - 后台处理如何避免线程爆炸？

## Related

- [生命周期与启动](/notes/source/java/base/tomcat/lifecycle-startup/)
- [Mapper 路由与 Pipeline/Valve](/notes/source/java/base/tomcat/mapper-valve/)
