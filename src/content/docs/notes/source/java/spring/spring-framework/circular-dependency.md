---
title: 三级缓存与循环依赖
description: singletonObjects、earlySingletonObjects、singletonFactories 如何解决 setter 循环依赖并保持代理一致性。
category: Backend
tags:
  - Source Reading
  - Spring Framework
  - Circular Dependency
order: 14
updatedDate: 2026-08-15
difficulty: advanced
status: stable
lastReviewed: 2026-08-15
draft: false
sidebar:
  order: 14
---

三级缓存解决的不是所有循环依赖，而是单例、属性注入场景下“对象已经实例化，但完整初始化尚未结束”的提前引用问题。

<!-- more -->

## 三层结构

```text
singletonObjects       完整成品
        ▲
earlySingletonObjects  已创建的早期引用
        ▲
singletonFactories     能生成早期引用的 ObjectFactory
```

`DefaultSingletonBeanRegistry#addSingleton()` — `spring-beans/.../DefaultSingletonBeanRegistry.java:159`；`addSingletonFactory()` 在 `:183`；`getSingleton(name, allowEarlyReference)` 在 `:208`。

## 创建时序

```text
A instantiate
  -> factory[A] = getEarlyBeanReference(A)
  -> populate A -> needs B
B -> needs A -> getSingleton(A)
  -> factory[A] -> early[A]
  -> B completes -> A completes -> singleton[A]
```

`AbstractAutowireCapableBeanFactory#createBean()` 在 `...AbstractAutowireCapableBeanFactory.java:596` 放入 factory，随后 `getEarlyBeanReference()` 在 `:966` 允许 AOP 处理器返回代理。

## 为什么不是两级缓存

**替代方案**：只保留完整对象和早期对象两个 Map。
**为什么不行**：AOP 需要在循环依赖方拿到对象时决定是否返回代理；如果早期 Map 只存原始对象，后续初始化完成后再代理，会出现注入点持有原对象、容器持有代理对象的身份分裂。
**证据**：三级缓存存的是 `ObjectFactory`，由 `getEarlyBeanReference()` 延迟生成早期代理，而不是提前固定原始对象。

## 关键实现

`getSingleton()` 先查成品，再查 early Map；只有 Bean 正在创建且允许早期引用时，才在锁内消费 factory，并将结果转移到 early Map。最终 `addSingleton()` 会删除 factory 和 early 引用，保证成品成为唯一主缓存。

## 不能解决的循环

构造器注入时对象尚未实例化，没有可暴露的早期引用；prototype 不进入 singleton registry；FactoryBean、@Async 等要求后置处理器改变代理形态的场景也可能因提前暴露不一致而失败。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| 构造器循环依赖 | `BeanCurrentlyInCreationException` | 没有可提前暴露的实例 | 重构依赖、使用事件或 `@Lazy` |
| prototype 循环依赖 | 创建失败 | prototype 没有三级单例缓存 | 避免环或引入稳定 owner |
| 代理型循环依赖 | 注入对象与最终对象不一致 | 早期和最终代理策略不同 | 确保处理器支持 `getEarlyBeanReference` |

## 可迁移知识

“成品、早期快照、延迟工厂”是解决递归构造和懒代理一致性的通用缓存分层；关键在于把昂贵或依赖上下文的转换延迟到真正需要引用时。

> **面试锚点**
> - 三级缓存分别存什么？
> - 构造器循环依赖为什么解决不了？
> - AOP 代理为什么需要 `getEarlyBeanReference()`？

## Related

- [Bean 生命周期](/notes/source/java/spring/spring-framework/bean-lifecycle/)
- [AOP 代理创建](/notes/source/java/spring/spring-framework/aop-proxy/)
