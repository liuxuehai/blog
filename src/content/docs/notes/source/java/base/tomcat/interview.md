---
title: 面试专题
description: Tomcat 生命周期、NIO、请求路由、Valve、类加载与性能边界的源码级面试题。
category: Backend
tags: [Source Reading, Tomcat, Interview]
order: 39
updatedDate: 2026-08-15
difficulty: advanced
status: stable
lastReviewed: 2026-08-15
sidebar: { order: 39 }
---

Tomcat 面试要能说明连接器、协议层、容器树和应用类加载器之间的边界。

<!-- more -->

## 高频题

### Tomcat 的整体架构是什么？

`Server → Service → Connector + Engine → Host → Context → Wrapper`。配置构建在 `Catalina.java:538`，Connector 生命周期在 `Connector.java:1255`、`:1300`，容器调用由 `StandardEngineValve.java:54` 开始。

### 一个 HTTP 请求如何到达 Servlet？

`NioEndpoint` 发现 socket 事件，`Http11Processor#service`（`Http11Processor.java:254`）解析并在 `:401` 交给 Adapter；`CoyoteAdapter#service`（`CoyoteAdapter.java:305`）在 `:347` 进入 Pipeline；`Mapper.java:688` 完成路由，最后 Wrapper Valve 调用 Servlet。

### 为什么需要自定义类加载器？

`WebappClassLoaderBase#loadClass`（`WebappClassLoaderBase.java:1132`）按委派配置处理顺序，隔离应用依赖；停止流程从 `:1387` 开始，负责清理线程、ThreadLocal 和 JDBC 驱动。

## 高难追问

### Connector 和 Container 为什么分离？

Connector 面向网络协议，Container 面向 Servlet 路由和应用生命周期。`CoyoteAdapter` 是两者的防腐层，让 HTTP/1.1、HTTP/2 等协议复用 Catalina 容器。

### 为什么异步 Servlet 仍可能耗尽线程？

异步只释放原始请求线程，不会消除业务线程、连接数、输出缓冲和下游压力。必须限制异步任务并正确结束 AsyncContext。

## 场景题

### QPS 上升但 CPU 不高、请求大量超时，先查什么？

区分 Selector、协议 Worker、Servlet 线程池和下游连接池。若 Worker 饥饿，查阻塞 Servlet、锁等待和异步队列；若 Selector 空转，查 SelectionKey 和异常连接关闭。

### 热部署后 Metaspace 增长如何定位？

统计旧 `WebappClassLoader`，检查线程、Timer、ThreadLocal、静态缓存、JDBC Driver 和日志框架引用。不要只调大 Metaspace。

> **面试锚点**
> - 说清 Coyote、Catalina、Connector、Container 的边界。
> - 画出 socket 到 Servlet 的调用链。
> - 解释 Mapper 查找与 Valve 执行为什么分离。

## Related

- [整体架构](/notes/source/java/base/tomcat/architecture/)
- [生命周期与启动](/notes/source/java/base/tomcat/lifecycle-startup/)
- [HTTP 请求处理链](/notes/source/java/base/tomcat/request-pipeline/)