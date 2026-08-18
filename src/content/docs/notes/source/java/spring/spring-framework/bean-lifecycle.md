---
title: Bean 生命周期
description: Bean 实例化、属性填充、Aware、初始化回调、后置处理器和销毁阶段的源码链路。
category: Backend
tags:
  - Source Reading
  - Spring Framework
  - Bean Lifecycle
order: 13
updatedDate: 2026-08-15
difficulty: advanced
status: stable
lastReviewed: 2026-08-15
draft: false
sidebar:
  order: 13
---

Spring Bean 的生命周期不是一个回调，而是实例化、依赖注入、Aware、初始化前后处理器和销毁注册共同构成的协议。

<!-- more -->

## 生命周期图

```text
BeanDefinition
  -> instantiate
  -> early exposure
  -> populateBean
  -> Aware callbacks
  -> beforeInitialization BPP
  -> init-method / InitializingBean
  -> afterInitialization BPP
  -> singleton registry
  -> destroy callbacks
```

`AbstractAutowireCapableBeanFactory#createBean()` — `spring-beans/.../AbstractAutowireCapableBeanFactory.java:488`；提前暴露在 `:596`，属性填充在 `:602`，初始化在 `:603`，`populateBean()` 定义于 `:1390`，`initializeBean()` 定义于 `:1797`。

## 实例化和填充

`createBeanInstance()` 根据构造器、工厂方法或 Supplier 生成原始对象；`populateBean()` 再通过 `InstantiationAwareBeanPostProcessor` 处理属性注入，并调用 `applyPropertyValues()` 解析引用、集合和类型转换。自动注入因此发生在“已有对象”上，而不是构造器返回之前。

## 初始化顺序

```text
Aware interfaces
  -> postProcessBeforeInitialization
  -> invokeInitMethods
  -> postProcessAfterInitialization
```

入口 `initializeBean()` 位于 `...AbstractAutowireCapableBeanFactory.java:1797`，其中会调用 `invokeAwareMethods()`、`applyBeanPostProcessorsBeforeInitialization()`、`invokeInitMethods()` 和 after 阶段处理器。

## 为什么用后置处理器而不是硬编码所有回调

**替代方案**：在 BeanFactory 中为每种注解、代理和回调增加分支。
**为什么不行**：核心工厂会与具体能力形成永久耦合，新能力无法独立发布，且每个分支都改变主创建路径。
**证据**：`BeanPostProcessor` 是独立策略接口；`PostProcessorRegistrationDelegate` 负责排序和注册，AOP、注入、校验都以处理器接入。

## 作用域差异

单例会进入 `DefaultSingletonBeanRegistry` 并在容器关闭时销毁；prototype 每次取得都创建，容器默认不保存其销毁回调。自定义 scope 则必须自行实现缓存和生命周期语义。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| 在构造器中访问注入字段 | 字段为空 | 属性填充尚未发生 | 使用构造器参数或初始化回调 |
| prototype 持有 singleton 资源 | 资源关系难回收 | 容器只管理 singleton 销毁 | 显式关闭或使用自定义 scope |
| after BPP 返回代理 | 依赖方拿到代理而非原对象 | 初始化后的最终暴露对象可被替换 | 按代理语义设计类型和 equals |

## 可迁移知识

将对象生命周期拆成“构造、配置、激活、停机”四段，适合插件、连接池和工作节点管理；每段都应明确异常时的回滚责任。

> **面试锚点**
> - 属性注入发生在构造器前还是后？
> - `postProcessBeforeInitialization` 和 after 的差别是什么？
> - prototype Bean 为什么默认不由容器完整销毁？

## Related

- [三级缓存与循环依赖](/notes/source/java/spring/spring-framework/circular-dependency/)
- [AOP 代理创建](/notes/source/java/spring/spring-framework/aop-proxy/)
