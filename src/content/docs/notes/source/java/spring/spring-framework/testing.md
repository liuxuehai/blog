---
title: 测试基础设施
description: Spring TestContext、上下文缓存与事务测试如何把容器生命周期接入测试执行模型。
category: Backend
tags:
  - Source Reading
  - Spring Framework
  - Testing
order: 18
updatedDate: 2026-08-19
difficulty: advanced
status: stable
lastReviewed: 2026-08-19
draft: false
sidebar:
  order: 18
---

Spring Test 的关键不是提供更多注解，而是把测试实例、ApplicationContext、事务和监听器组织成一个可复用的执行上下文。

<!-- more -->

## 先给答案：测试上下文缓存优化的是启动成本，隔离责任仍由测试配置承担

Spring 测试框架根据测试类、配置位置、Profile 和自定义上下文定制器生成缓存键；相同键可以复用已启动的 ApplicationContext，避免每个测试重新创建容器。

缓存不会自动修复测试之间的状态污染。Mock Bean、动态属性、数据库状态和容器中可变单例都可能让“同一个上下文”在测试间泄漏状态。需要清理时，测试框架通过监听器和 `@DirtiesContext` 让缓存失效，代价是下一次测试重新启动。


## 测试执行链

```text
test instance
  -> TestContextManager
  -> TestExecutionListeners
  -> prepareTestInstance
  -> load/cache ApplicationContext
  -> before/after test method
  -> transactional listener
```

源码入口可从 `spring-test/src/main/java/org/springframework/test/context/TestContextManager.java`、`DefaultTestContext.java` 和 `support/DependencyInjectionTestExecutionListener.java` 开始；事务监听器位于 `spring-test/.../TransactionalTestExecutionListener.java`。

## 上下文缓存

测试上下文根据配置、profiles、loader 和 parent 等条件构造 cache key。相同 key 复用 ApplicationContext，避免每个测试方法重新执行 `refresh()`；脏上下文则通过 `@DirtiesContext` 使对应缓存失效。

## 监听器责任链

监听器分别承担依赖注入、DirtiesContext、事务、SQL 脚本和 Servlet 模拟环境。每个监听器只关心测试生命周期的某一阶段，测试框架通过排序保证前置和后置操作成对出现。

## 为什么缓存上下文而不是每次重建

**替代方案**：每个测试类/方法都创建新容器，保证绝对隔离。
**为什么不行**：大型应用的组件扫描、Bean 初始化和数据库连接代价很高，测试反馈周期会被启动成本主导。
**证据**：TestContext 使用 context cache，并把显式污染声明交给 `@DirtiesContext`，在速度和隔离之间提供可见取舍。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| 测试修改单例状态 | 后续测试互相影响 | 上下文被缓存 | 清理状态或标记 `@DirtiesContext` |
| 动态属性改变 cache key | 上下文数量激增 | 配置组合不同 | 统一测试配置来源 |
| 事务测试调用异步代码 | 返回后事务已结束 | 测试事务绑定当前线程 | 等待任务或采用显式测试事务 |

## 可迁移知识

测试基础设施可以复用生产级生命周期组件，但必须把缓存 key、隔离边界和失效条件设计成可观察的协议。

> **面试锚点**
> - Spring Test 为什么能复用 ApplicationContext？
> - `@DirtiesContext` 解决什么问题？
> - 测试事务为什么不一定覆盖异步线程？

## Related

- [refresh() 十二步](/notes/source/java/spring/spring-framework/refresh-lifecycle/)
- [事务拦截器](/notes/source/java/spring/spring-framework/transaction/)
