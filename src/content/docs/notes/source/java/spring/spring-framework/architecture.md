---
title: 整体架构
description: Spring Framework 从 ApplicationContext 到 BeanFactory、后置处理器和代理的分层结构。
category: Backend
tags:
  - Source Reading
  - Spring Framework
  - Architecture
order: 11
updatedDate: 2026-08-24
difficulty: advanced
status: stable
lastReviewed: 2026-08-24
draft: false
sidebar:
  order: 11
---

Spring 的架构可以概括为“上层上下文编排，底层 BeanFactory 持有对象图，后置处理器把扩展能力插入创建流程”。理解这条边界，比记住某个注解的效果更重要。

<!-- more -->

## 先给答案：先建立定义图，再创建带扩展能力的实例图

Spring 先把配置解析为 BeanDefinition，再由 BeanFactoryPostProcessor 修改定义并注册 BeanPostProcessor，之后才解析依赖、创建单例和生成必要代理。ApplicationContext 负责这套刷新编排，BeanFactory 持有对象图与作用域状态。

顺序就是能力边界：定义级处理必须早于实例化，实例级处理必须早于业务对象完成初始化，AOP 和事务依赖代理入口，循环依赖的早期引用还可能提前暴露代理。绕过容器取得对象或发生自调用时，相应扩展不会凭空生效。

## 分层

```text
ApplicationContext
  ├─ environment / resource / event / message
  └─ ConfigurableListableBeanFactory
       ├─ BeanDefinition registry
       ├─ singleton/prototype creation
       ├─ dependency resolution
       └─ BeanPostProcessor chain
            └─ AOP proxy / @Autowired / @Transactional
```

`AbstractApplicationContext#refresh()` 位于 `spring-context/.../AbstractApplicationContext.java:582`，而 `DefaultListableBeanFactory` 在 `spring-beans/.../DefaultListableBeanFactory.java:132` 承担定义注册和依赖解析。

## 核心抽象

| 抽象 | 解决的问题 | 源码坐标 |
| --- | --- | --- |
| `ApplicationContext` | 组合 BeanFactory、事件、资源和环境 | `spring-context/.../ApplicationContext.java` |
| `BeanDefinition` | 延迟描述对象如何创建 | `spring-beans/.../BeanDefinition.java` |
| `BeanFactory` | 按名称/类型取得对象 | `spring-beans/.../BeanFactory.java` |
| `BeanPostProcessor` | 在初始化前后插入扩展 | `spring-beans/.../BeanPostProcessor.java` |
| `Advisor` | 把切点和通知组合成代理规则 | `spring-aop/.../Advisor.java` |

## 主流程一：启动

```text
refresh()
  -> prepareRefresh
  -> obtainFreshBeanFactory
  -> prepareBeanFactory
  -> invokeBeanFactoryPostProcessors
  -> registerBeanPostProcessors
  -> init events/message
  -> finishBeanFactoryInitialization
  -> finishRefresh
```

启动的关键不是“调用很多方法”，而是先注册能改变 BeanDefinition 的处理器，再注册会参与 Bean 创建的处理器，最后才预实例化单例。对应坐标包括 `AbstractApplicationContext.java:668`、`:720`、`:795`、`:812`、`:943`、`:1003`。

## 主流程二：取得 Bean

```text
getBean(name)
  -> singleton cache
  -> merged BeanDefinition
  -> createBean
       -> instantiate
       -> early exposure
       -> populateBean
       -> initializeBean
       -> post-process proxy
  -> register singleton
```

`AbstractBeanFactory#doGetBean()` 在 `spring-beans/.../AbstractBeanFactory.java:249` 处理作用域和创建入口；`AbstractAutowireCapableBeanFactory#createBean()` 在 `.../AbstractAutowireCapableBeanFactory.java:488` 负责对象图中的实际构造。

## 扩展点全景

| 扩展点 | 触发时机 | 典型用途 |
| --- | --- | --- |
| `BeanFactoryPostProcessor` | Bean 实例化前 | 修改定义、扫描注册 |
| `BeanPostProcessor` | 初始化前后 | 注入、代理、校验 |
| `ApplicationListener` | 事件发布时 | 解耦通知 |
| `ConversionService` | 属性绑定/表达式转换 | 类型转换 |
| `ResourcePatternResolver` | 读取资源模式 | classpath 扫描 |

## 为什么分成 Context 和 BeanFactory

**替代方案**：让一个容器类型同时负责对象创建、事件、国际化、资源和环境。
**为什么不行**：所有实现都要依赖完整平台能力，轻量 BeanFactory 无法复用，测试和嵌入场景也会被迫加载上下文设施。
**证据**：`AbstractApplicationContext` 通过 `getBeanFactory()` 委托对象创建，同时单独维护 `messageSource`、事件多播器和 `resourcePatternResolver`。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| 在 `BeanFactoryPostProcessor` 中取业务 Bean | 触发过早创建 | 处理器阶段早于完整 BPP 注册 | 只改定义，不取业务实例 |
| 手工 `new` 组件 | 注入/AOP 不生效 | 绕过 BeanFactory | 通过容器取得或显式组装 |
| `refresh()` 重复调用 | 状态异常或资源重复 | 上下文刷新有生命周期约束 | 使用支持刷新的上下文实现 |

## 可迁移知识

把“定义阶段”和“实例阶段”分离，是插件系统、依赖注入容器和配置驱动运行时的通用结构。

> **面试锚点**
> - `BeanFactoryPostProcessor` 和 `BeanPostProcessor` 的时序差异是什么？
> - 为什么 Spring 的核心 owner 是 BeanFactory 而不是 ApplicationContext？
> - 单例 Bean 从定义到注册经过哪些阶段？

## Related

- [refresh() 十二步](/notes/source/java/spring/spring-framework/refresh-lifecycle/)
- [Bean 生命周期](/notes/source/java/spring/spring-framework/bean-lifecycle/)
