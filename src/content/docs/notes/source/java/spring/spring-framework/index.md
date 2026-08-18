---
title: Spring Framework
description: Spring Framework 源码解析总览：IoC、Bean 生命周期、三级缓存、AOP、事务与基础设施。
category: Backend
tags:
  - Source Reading
  - Spring Framework
  - IoC
order: 1
updatedDate: 2026-08-15
difficulty: advanced
status: stable
lastReviewed: 2026-08-15
draft: false
sidebar:
  order: 1
---

Spring Framework 的核心价值不是“提供注解”，而是把对象创建、依赖解析、生命周期回调、代理和资源访问组织成可扩展的容器协议。本册基于 `main @ c7712052ce953722448967dc9c780fa959a08d48`（2026-08-13）阅读。

<!-- more -->

## 版本快照

| 项 | 值 |
| --- | --- |
| 仓库 | `spring-projects/spring-framework` |
| 本地路径 | `E:\source\java\spring\spring-framework` |
| 分支 | `main` |
| Commit | `c7712052ce953722448967dc9c780fa959a08d48`（2026-08-13） |
| 最近 tag | `v4.0.0.RC2`（blobless 克隆中的祖先 tag，仅作参考） |

## 它解决什么问题

| 问题 | Framework 的解法 |
| --- | --- |
| 对象创建与业务耦合 | `BeanFactory` 管理定义、实例化和依赖注入 |
| 生命周期扩展点分散 | `BeanPostProcessor`、Aware、Initializing/Disposable 回调统一编排 |
| 横切逻辑侵入业务 | AOP 将 Advisor/Interceptor 织入代理 |
| 资源和配置来源不一致 | `Resource`、Environment、ConversionService 抽象底层差异 |

## 模块地图

| 模块 | 关键职责 |
| --- | --- |
| `spring-core` | 资源、类型转换、环境、反射与基础工具 |
| `spring-beans` | BeanDefinition、BeanFactory、依赖解析与生命周期 |
| `spring-context` | ApplicationContext、事件、国际化与组件扫描 |
| `spring-aop` | Advisor、ProxyFactory、JDK/CGLIB 代理 |
| `spring-tx` | 事务属性、拦截器与事务管理器抽象 |
| `spring-web` / `spring-webmvc` | Web 基础设施与 MVC 请求处理 |

## 读码入口

1. `AbstractApplicationContext#refresh()`：看容器启动的十几个扩展边界。
2. `AbstractBeanFactory#doGetBean()`：看缓存命中、作用域和依赖创建。
3. `AbstractAutowireCapableBeanFactory#createBean()`：看实例化、提前暴露和初始化。
4. `DefaultSingletonBeanRegistry#getSingleton()`：看三级缓存和并发保护。
5. `AbstractAutoProxyCreator#wrapIfNecessary()`：看后置处理器如何生成代理。
6. `TransactionAspectSupport#invokeWithinTransaction()`：看事务边界如何包住目标调用。

## 本册目录

- [整体架构](/notes/source/java/spring/spring-framework/architecture/)
- [`refresh()` 十二步](/notes/source/java/spring/spring-framework/refresh-lifecycle/)
- [Bean 生命周期](/notes/source/java/spring/spring-framework/bean-lifecycle/)
- [三级缓存与循环依赖](/notes/source/java/spring/spring-framework/circular-dependency/)
- [AOP 代理创建](/notes/source/java/spring/spring-framework/aop-proxy/)
- [事务拦截器](/notes/source/java/spring/spring-framework/transaction/)
- [资源与类型转换](/notes/source/java/spring/spring-framework/resource-conversion/)
- [测试基础设施](/notes/source/java/spring/spring-framework/testing/)
- [面试专题](/notes/source/java/spring/spring-framework/interview/)

## 横向对照

| 对象 | 对照点 |
| --- | --- |
| [Netty](/notes/source/java/base/netty/) | 都把复杂流程拆成可组合扩展点；Netty 的核心 owner 是 EventLoop，Spring 的核心 owner 是 BeanFactory |
| [MyBatis](/notes/source/java/storage/mybatis-3/) | 都通过工厂和后处理器隔离创建细节；Spring 负责对象图，MyBatis 负责会话和映射 |
| Redis 源码 | Redis 选择显式生命周期和单线程状态，Spring 选择可插拔容器协议 |

## Related

- [Java 源码解析索引](/notes/source/java/)
- [Spring 生态](/notes/source/java/spring/)
