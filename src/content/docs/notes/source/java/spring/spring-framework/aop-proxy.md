---
title: AOP 代理创建
description: AbstractAutoProxyCreator 如何筛选 Advisor、构造 ProxyFactory 并在循环依赖中保持代理一致。
category: Backend
tags:
  - Source Reading
  - Spring Framework
  - AOP
order: 15
updatedDate: 2026-08-19
difficulty: advanced
status: stable
lastReviewed: 2026-08-19
draft: false
sidebar:
  order: 15
---

Spring AOP 的核心不是“扫描注解”，而是一个 BeanPostProcessor 在合适时机筛选 Advisor、准备 TargetSource，并把目标对象包装成可调用代理。

<!-- more -->

## 先给答案：AOP 代理是在 Bean 生命周期中“选择最终暴露身份”

AOP 不会把切面代码直接写进业务方法，而是在 Bean 创建完成前后判断是否需要包装。代理负责拦截调用，目标对象负责实际业务；事务、缓存和异步等能力因此可以共享同一套调用边界。

代理选择也决定了限制：JDK 代理依赖接口类型，CGLIB 通过子类覆盖方法；自调用绕过代理，是因为调用没有经过代理对象的拦截入口。循环依赖场景下，早期引用是否已经经过代理工厂，会直接影响最终引用的一致性。


## 代理链路

```text
Bean instance
  -> AbstractAutoProxyCreator
  -> shouldSkip / getAdvicesAndAdvisorsForBean
  -> create ProxyFactory
  -> add advisors + target source
  -> DefaultAopProxyFactory
       ├─ JDK dynamic proxy
       └─ CGLIB proxy
```

关键坐标：`AbstractAutoProxyCreator#getEarlyBeanReference()` — `spring-aop/.../AbstractAutoProxyCreator.java:237`；after 初始化入口在 `:285`；`wrapIfNecessary()` 在 `:321`；构造 `ProxyFactory` 的 `buildProxy()` 在 `:440`。

## 何时创建代理

正常路径是 `postProcessAfterInitialization()`，这样目标 Bean 已完成属性填充和初始化；循环依赖路径则由 `getEarlyBeanReference()` 提前生成同一代理语义的引用。二者通过缓存的 advisedBeans 与 early reference 协作，避免重复代理。

## JDK 与 CGLIB

`DefaultAopProxyFactory#createAopProxy()` — `spring-aop/.../DefaultAopProxyFactory.java:60` 根据接口、`proxyTargetClass` 和 optimize 等配置选择实现。JDK 代理依赖接口，CGLIB 通过子类覆盖方法；final 类/方法和自调用都构成边界。

## 为什么代理由 BPP 生成

**替代方案**：在 BeanFactory 的每个创建分支中直接检查事务、缓存、异步等注解。
**为什么不行**：横切策略会污染核心创建逻辑，多个框架能力难以组合，且普通 Bean 和代理 Bean 的生命周期语义会分叉。
**证据**：`AbstractAutoProxyCreator` 实现 `SmartInstantiationAwareBeanPostProcessor`，以标准处理器协议接入创建流程。

## 调用时发生什么

代理调用进入 `MethodInterceptor` 链，最终由 `ReflectiveMethodInvocation#proceed()` 递归执行下一个拦截器或目标方法。代理只改变调用入口，不改变容器对 BeanDefinition 和作用域的管理。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| 类内自调用 | 事务/缓存不生效 | 没有经过代理入口 | 抽取协作者或注入自身代理 |
| final 方法 | CGLIB 无法拦截 | 子类不能覆盖 final | 使用接口代理或改设计 |
| 提前代理不一致 | 循环依赖报错 | early 与 after 返回不同对象 | 让处理器实现 early reference 语义 |

## 可迁移知识

代理系统应把“策略筛选、代理构造、调用分派”分层，才能让事务、缓存、权限等横切能力共享同一执行管道。

> **面试锚点**
> - Spring AOP 代理在哪个生命周期阶段创建？
> - JDK 动态代理和 CGLIB 如何选择？
> - 为什么同类自调用绕过事务？

## Related

- [三级缓存与循环依赖](/notes/source/java/spring/spring-framework/circular-dependency/)
- [事务拦截器](/notes/source/java/spring/spring-framework/transaction/)
