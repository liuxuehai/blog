---
title: Web 应用类加载隔离
description: WebappClassLoaderBase 的委派顺序、隔离边界与应用卸载清理。
category: Backend
tags: [Source Reading, Tomcat, ClassLoader]
order: 36
updatedDate: 2026-08-19
difficulty: advanced
status: stable
lastReviewed: 2026-08-19
draft: false
sidebar: { order: 36 }
---

Tomcat 必须允许多个应用使用不同版本依赖，同时共享 Servlet API 和容器公共类，因此类加载隔离是部署模型的一部分。

<!-- more -->

## 先给答案：Web 应用类加载器是在“共享容器能力”和“应用版本隔离”之间做选择

Tomcat 不能简单使用严格双亲委派，因为不同 Web 应用可能需要加载同名但不同版本的库；同时 Java 核心类和容器 API 又必须保持统一，不能被应用自己的 jar 覆盖。

因此加载顺序按类别区分：系统类、容器类优先，应用类在隔离范围内自行查找。代价是类加载问题更难排查：同名类来自哪个 loader、线程上下文类加载器是什么、卸载时是否仍有线程或静态引用，都可能决定热部署是否成功。


```text
Bootstrap/JDK <- Common <- Catalina/Shared <- WebappClassLoader
                                              WEB-INF/classes/lib
```

`WebappClassLoaderBase#loadClass` 位于 `java/org/apache/catalina/loader/WebappClassLoaderBase.java:1132`，Java 平台类处理在 `:1198`；停止逻辑从 `:1387` 开始。

## 为什么不是严格双亲委派

**替代方案**：所有类都严格先父后子。
**为什么不行**：应用无法隔离冲突的第三方依赖。Tomcat 对 Java 平台类和容器 API 保持父优先，对普通应用类提供 child-first 能力，行为受 `delegate` 配置影响。

停止时需要清理 JDBC 驱动、线程、ThreadLocal、Timer 和静态引用，否则旧 ClassLoader 仍可能被 GC Root 保留。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| API 被应用打包 | `ClassCastException` | 同名 API 来自不同 ClassLoader | 不在 WAR 打包容器 API |
| 热部署内存增长 | 旧 ClassLoader 不回收 | 线程或 ThreadLocal 持有旧类 | 关闭应用线程、清理资源 |
| 依赖冲突 | `NoSuchMethodError` | 实际版本不同 | 检查委派顺序和依赖树 |

## 可迁移知识

插件系统可采用宿主 API 父优先、插件实现子优先、卸载前清理外部引用的设计。热卸载难点通常是线程和缓存引用，而非 ClassLoader 本身。

> **面试锚点**
> - Tomcat 为什么打破严格双亲委派？
> - 哪些对象最容易造成 ClassLoader 泄漏？
> - 为什么同名类会 `ClassCastException`？

## Related

- [Web 应用启动与 Servlet 加载](/notes/source/java/base/tomcat/webapp-startup/)
- [容器层级与组件关系](/notes/source/java/base/tomcat/container-hierarchy/)
