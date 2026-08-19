---
title: Tomcat
description: Tomcat 源码解析总览：生命周期、Connector、Container、NIO Endpoint、Mapper、Valve 与类加载隔离。
category: Backend
tags: [Source Reading, Tomcat, Servlet]
order: 3
updatedDate: 2026-08-19
difficulty: advanced
status: stable
lastReviewed: 2026-08-19
draft: false
sidebar: { order: 3 }
---

Tomcat 是 Servlet 容器与 HTTP 服务器的组合。它把连接接入、协议解析、虚拟主机路由、Web 应用生命周期和 Servlet 调用拆成可替换的层次。

<!-- more -->

## 本册问题地图

Tomcat 的核心是把“一个 Web 应用”放进一个可启动、可隔离、可处理请求的容器体系。本册沿着启动到请求的路径回答：

1. Server、Service、Engine、Host、Context 为什么分成四级？
2. 生命周期状态机如何保证组件按顺序启动和停止？
3. 类加载器为什么不能完全使用严格双亲委派？
4. NIO Endpoint 如何把 socket 事件交给工作线程？
5. Mapper 如何把 URI 找到 Context、Wrapper 和 Servlet？
6. Coyote、Adapter、Container 和 Valve 如何把协议请求转成 Servlet 调用？
7. Web 应用为什么默认延迟加载，什么时候会被提前启动？

读完整册后，应当能解释一个 HTTP 请求从端口进入 Tomcat 到 Servlet 执行，经历了哪些边界和适配层。


## 版本快照

| 项 | 值 |
| --- | --- |
| 仓库 | `apache/tomcat` |
| 本地路径 | `E:\source\java\base\tomcat` |
| 分支 | `main` |
| Commit | `a59c71493`（2026-08-13） |
| 最近 tag | 无（当前分支无可用 tag） |

## 模块地图

| 层 | 关键模块 | 职责 |
| --- | --- | --- |
| 启动 | `org.apache.catalina.startup` | Bootstrap、配置解析、应用部署 |
| 容器 | `org.apache.catalina.core` | Server、Service、Engine、Host、Context、Wrapper |
| 连接器 | `org.apache.catalina.connector` | Coyote 与 Catalina 请求模型适配 |
| 协议 | `org.apache.coyote` | HTTP/1.1 等协议处理 |
| 网络 | `org.apache.tomcat.util.net` | NIO/NIO2/APR Endpoint |
| 类加载 | `org.apache.catalina.loader` | Web 应用隔离 |

## 读码入口

1. `Catalina#load` / `start`：配置到对象树。
2. `LifecycleBase#init` / `start`：组件状态机。
3. `StandardService`：Engine、Executor、Connector 编排。
4. `NioEndpoint#startInternal`：Selector 与 SocketProcessor。
5. `Http11Processor#service` → `CoyoteAdapter#service`。
6. `Mapper#map` → 各级 `Standard*Valve#invoke`。

## 本册目录

- [整体架构](/notes/source/java/base/tomcat/architecture/)
- [生命周期与启动](/notes/source/java/base/tomcat/lifecycle-startup/)
- [容器层级与组件关系](/notes/source/java/base/tomcat/container-hierarchy/)
- [NIO Endpoint 与线程模型](/notes/source/java/base/tomcat/nio-endpoint/)
- [HTTP 请求处理链](/notes/source/java/base/tomcat/request-pipeline/)
- [Mapper 路由与 Pipeline/Valve](/notes/source/java/base/tomcat/mapper-valve/)
- [Web 应用类加载隔离](/notes/source/java/base/tomcat/classloader-isolation/)
- [Web 应用启动与 Servlet 加载](/notes/source/java/base/tomcat/webapp-startup/)
- [面试专题](/notes/source/java/base/tomcat/interview/)

## 横向对照

| 对象 | 对照点 |
| --- | --- |
| Netty | Tomcat 固定连接器到 Servlet 的容器链，Netty 把处理能力暴露为 Pipeline |
| Spring Boot | Boot 创建并配置 `WebServer`，Tomcat 承担连接和 Servlet 执行 |

## Related

- [Netty](/notes/source/java/base/netty/)
- [Spring Boot 内嵌 Web Server](/notes/source/java/spring/spring-boot/web-server/)
