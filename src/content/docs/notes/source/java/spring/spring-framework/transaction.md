---
title: 事务拦截器
description: TransactionInterceptor 与 TransactionAspectSupport 如何解析属性、开启事务并完成提交或回滚。
category: Backend
tags:
  - Source Reading
  - Spring Framework
  - Transaction
order: 16
updatedDate: 2026-08-15
difficulty: advanced
status: stable
lastReviewed: 2026-08-15
draft: false
sidebar:
  order: 16
---

声明式事务把一次方法调用包进“属性解析、事务创建、目标执行、异常决策、提交/回滚、线程上下文清理”的完整围绕通知。

<!-- more -->

## 调用链

```text
proxy.invoke
  -> TransactionInterceptor#invoke
  -> invokeWithinTransaction
  -> getTransaction
  -> target method
       ├─ success -> commit
       └─ error   -> rollback rules -> rollback/commit
  -> cleanupTransactionInfo
```

`TransactionInterceptor#invoke()` — `spring-tx/.../TransactionInterceptor.java:119`；核心 `TransactionAspectSupport#invokeWithinTransaction()` — `spring-tx/.../TransactionAspectSupport.java:333`。

## 属性与管理器

`TransactionAttributeSource` 根据方法和目标类解析传播行为、隔离级别、超时和 rollback 规则；`determineTransactionManager()` 选择具体 `PlatformTransactionManager`。拦截器不直接操作 JDBC，而是依赖事务管理器策略。

## 标准同步路径

`createTransactionIfNecessary()` 建立 `TransactionInfo`，`invocation.proceedWithInvocation()` 执行目标；异常进入 `completeTransactionAfterThrowing()`，正常返回进入 `commitTransactionAfterReturning()`，最后无论成功失败都执行 `cleanupTransactionInfo()`。

## 为什么不把事务写进业务方法

**替代方案**：每个业务方法手工 begin/commit/rollback。
**为什么不行**：异常路径、嵌套传播、线程绑定和多种资源实现会在业务代码重复，且很容易遗漏 finally 清理。
**证据**：`TransactionAspectSupport` 统一管理 `TransactionInfo` 和线程本地上下文，`TransactionInterceptor` 只负责把 AOP invocation 适配到该模板。

## 响应式差异

当事务管理器是 `ReactiveTransactionManager` 时，`invokeWithinTransaction()` 根据返回类型选择 reactive adapter，而不是把事务状态绑定到当前调用线程。同步事务和响应式事务因此不能只靠替换管理器类型理解。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| private 方法加 `@Transactional` | 不生效 | 代理通常只拦截可见的外部调用 | 放到 public 协作者或改代理策略 |
| 捕获异常后不抛出 | 事务提交 | 拦截器看不到失败 | 明确 rollbackFor 或重新抛出 |
| 异步返回未完成 | 事务已提交 | 方法返回不等于异步任务完成 | 使用可传播的事务模型 |

## 可迁移知识

围绕通知适合实现重试、限流、审计和权限；但必须明确“边界覆盖的是方法调用，还是异步工作的完整生命周期”。

> **面试锚点**
> - `@Transactional` 的提交和回滚由谁决定？
> - 为什么 self-invocation 不触发事务？
> - 响应式事务为什么不能依赖 ThreadLocal？

## Related

- [AOP 代理创建](/notes/source/java/spring/spring-framework/aop-proxy/)
- [Bean 生命周期](/notes/source/java/spring/spring-framework/bean-lifecycle/)
