---
title: Tomcat
description: Tomcat 源码解析总览：生命周期、Connector、Container、NIO Endpoint、Mapper、Valve 与类加载隔离。
category: Backend
tags: [Source Reading, Tomcat, Servlet]
order: 3
updatedDate: 2026-08-15
difficulty: advanced
status: stable
lastReviewed: 2026-08-15
draft: false
sidebar: { order: 3 }
---

Tomcat 是 Servlet 容器与 HTTP 服务器的组合。它把连接接入、协议解析、虚拟主机路由、Web 应用生命周期和 Servlet 调用拆成可替换的层次。

<!-- more -->

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