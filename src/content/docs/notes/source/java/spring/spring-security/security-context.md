---
title: SecurityContext 存储与传播
description: SecurityContextHolder、策略实现、请求级清理与异步线程传播。
category: Backend
tags: [Source Reading, Spring Security, SecurityContext]
order: 45
updatedDate: 2026-08-19
difficulty: advanced
status: stable
lastReviewed: 2026-08-19
draft: false
sidebar:
  order: 45
---

`SecurityContext` 是认证结果与后续组件之间的共享边界，API 与实际存储通过策略解耦。

<!-- more -->

## 先给答案：SecurityContext 的难点是“请求结束时清理”和“异步执行时传播”

ThreadLocal 让当前线程上的过滤器和业务代码可以快速访问身份，但线程池会复用线程，不能把上下文当作线程永久属性。请求开始加载、请求结束保存/清理，构成一个完整生命周期；异步任务则需要显式包装或委托执行器传播上下文。

只在主线程验证登录状态、再把任务丢进普通线程池，会出现异步代码看不到用户或错误继承上一个请求身份。排查时要看上下文的创建线程、使用线程和清理线程是否一致。


## 生命周期

```text
request -> SecurityContextHolderFilter
  -> repository load
  -> strategy set
  -> authentication sets context
  -> business reads holder
  -> finally clear
```

## 实现拆解

1. holder 类：`core/.../SecurityContextHolder.java:53`。
2. 静态读取：`core/.../SecurityContextHolder.java:124`。
3. 静态设置：`core/.../SecurityContextHolder.java:154`。
4. 策略接口：`core/.../SecurityContextHolderStrategy.java:30`。
5. ThreadLocal 读取：`core/.../ThreadLocalSecurityContextHolderStrategy.java:42`。
6. ThreadLocal 设置：`core/.../ThreadLocalSecurityContextHolderStrategy.java:58`。
7. ThreadLocal 清理：`core/.../ThreadLocalSecurityContextHolderStrategy.java:37`。
8. 新 Filter 入口：`web/.../SecurityContextHolderFilter.java:67`。
9. 新 Filter 清理：`web/.../SecurityContextHolderFilter.java:85`。
10. 旧 Persistence Filter 加载/清理：`web/.../SecurityContextPersistenceFilter.java:107`、`:122`。
11. 异步安装/恢复：`core/.../DelegatingSecurityContextRunnable.java:95`、`:101`。

## 为什么不能只用静态 ThreadLocal

**替代方案**：业务代码直接读写 `ThreadLocal<Authentication>`。
**为什么不行**：请求仓库、异步任务和线程模型需要不同传播语义，业务代码也不应负责清理。
**证据**：`SecurityContextHolder` 委托给 `SecurityContextHolderStrategy`，异步 Runnable 显式恢复原上下文。

## 边界与踩坑

| 场景 | 原因 | 规避 |
| --- | --- | --- |
| 线程池串号 | 任务结束未清理 | 使用 Delegating 包装器 |
| 新线程匿名 | ThreadLocal 不传播 | 显式传递上下文 |
| 下一请求丢身份 | 只 set 未 save | 配置 repository 策略 |

## 可迁移知识

上下文传播的通用模式是“捕获 -> 安装 -> 执行 -> 恢复”，适合 trace、租户和审计身份。

> **面试锚点**
> - Holder 与 Repository 的职责？
> - 线程池为什么不能直接靠 InheritableThreadLocal？
> - Runnable 为什么要恢复原上下文？

## Related

- [认证流程与 AuthenticationManager](/notes/source/java/spring/spring-security/authentication/)
- [整体架构](/notes/source/java/spring/spring-security/architecture/)
