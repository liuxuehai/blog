---
title: refresh() 十二步
description: AbstractApplicationContext refresh() 的启动阶段、处理器注册与单例预实例化顺序。
category: Backend
tags:
  - Source Reading
  - Spring Framework
  - Lifecycle
order: 12
updatedDate: 2026-08-19
difficulty: advanced
status: stable
lastReviewed: 2026-08-19
draft: false
sidebar:
  order: 12
---

`refresh()` 是 Spring 容器启动的总编排器。它把配置读取、工厂准备、处理器注册、事件基础设施和单例创建串成一个有严格先后关系的生命周期。

<!-- more -->

## 先给答案：`refresh()` 是把“配置对象”推进成“可运行容器”的状态机

`refresh()` 不是一串初始化代码，而是一组有前置条件的阶段：先创建并准备 BeanFactory，再注册处理器和事件机制，最后预实例化非懒加载单例。顺序的核心原因是，后面的 Bean 创建必须知道前面已经安装了哪些处理器和基础设施。

如果把预实例化提前，Bean 可能在后置处理器注册前就被创建，AOP、注解注入或自定义初始化就会失效；如果失败后不销毁已创建资源，容器重启或测试隔离会留下半成品。阅读 `refresh()` 要追踪的不是十二个方法名，而是每一步给下一步增加了什么能力。


## 调用链

```text
prepareRefresh
  -> obtainFreshBeanFactory
  -> prepareBeanFactory
  -> postProcessBeanFactory
  -> invokeBeanFactoryPostProcessors
  -> registerBeanPostProcessors
  -> initMessageSource / initApplicationEventMulticaster
  -> onRefresh / registerListeners
  -> finishBeanFactoryInitialization
  -> finishRefresh
```

入口是 `AbstractApplicationContext#refresh()` — `spring-context/.../AbstractApplicationContext.java:582`。各阶段方法位于 `:668`、`:720`、`:730`、`:787`、`:795`、`:812`、`:821`、`:854`、`:907`、`:915`、`:943`、`:1003`。

## 为什么处理器注册在预实例化之前

**替代方案**：先创建全部单例，再注册后置处理器。
**为什么不行**：已经创建的对象不会重新经过依赖注入、代理和初始化回调，导致同一容器中出现处理器生效与不生效两种 Bean。
**证据**：`finishBeanFactoryInitialization()` 最终调用 `DefaultListableBeanFactory#preInstantiateSingletons()` — `spring-beans/.../DefaultListableBeanFactory.java:1102`；它位于 BPP 注册之后。

## 阶段拆解

| 阶段 | 作用 | 关键坐标 |
| --- | --- | --- |
| 准备环境 | 校验活动状态、初始化属性 | `AbstractApplicationContext.java:668` |
| 获取工厂 | 创建或刷新内部 BeanFactory | `:720` |
| 注册基础设施 | 注册环境、资源、事件发布器等依赖 | `:730` |
| 执行 BFPP | 修改 BeanDefinition | `:795` |
| 注册 BPP | 参与后续 Bean 创建 | `:812` |
| 初始化事件/消息 | 建立上下文级基础设施 | `:821`、`:854` |
| 预实例化 | 创建非懒加载单例 | `:943` |
| 完成刷新 | 生命周期事件、LiveBeansView 等 | `:1003` |

## 失败回滚

`refresh()` 使用外层异常边界保证刷新失败时调用 `cancelRefresh()` 和 `closeBeans()`。这使得“启动失败”不是半初始化状态继续对外提供服务，而是释放已创建资源后将上下文置为不可用。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| BFPP 中依赖业务 Bean | Bean 提前实例化且错过部分 BPP | 修改定义和创建实例混在一起 | BFPP 只处理元数据 |
| 非懒加载 Bean 初始化失败 | 整个上下文启动失败 | 预实例化是刷新完成的前置条件 | 检查依赖、配置和初始化回调 |
| `onRefresh()` 中启动外部服务 | 刷新失败后残留线程 | 外部资源未纳入销毁回调 | 实现生命周期接口并保证关闭幂等 |

## 可迁移知识

复杂启动流程应显式划分“准备、注册、创建、提交”四类阶段；只有最后提交成功，系统才应该对外宣告 ready。

> **面试锚点**
> - `refresh()` 为什么先执行 BFPP 再注册 BPP？
> - 哪一步真正创建非懒加载单例？
> - 刷新失败时 Spring 如何避免留下半初始化上下文？

## Related

- [整体架构](/notes/source/java/spring/spring-framework/architecture/)
- [Bean 生命周期](/notes/source/java/spring/spring-framework/bean-lifecycle/)
