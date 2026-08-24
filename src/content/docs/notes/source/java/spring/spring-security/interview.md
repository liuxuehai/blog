---
title: 面试专题
description: Spring Security 过滤器链、认证、授权和 SecurityContext 的源码级面试题。
category: Backend
tags: [Source Reading, Spring Security, Interview]
order: 49
updatedDate: 2026-08-24
difficulty: advanced
status: stable
lastReviewed: 2026-08-24
draft: false
sidebar:
  order: 49
---

面试重点是说明一次请求如何选链、如何认证、如何授权，以及身份何时清理。

<!-- more -->

## 先给答案：先选链，再认证、授权，最后清理身份

`FilterChainProxy` 对请求选择第一条匹配的 SecurityFilterChain，安全过滤器从持久化介质恢复或建立 SecurityContext，认证过滤器把凭证交给 AuthenticationManager，授权过滤器再基于最终 Authentication 决定是否放行。

高风险边界是链顺序、异常转换和上下文生命周期：更宽泛 matcher 放在前面会遮蔽后续规则，认证成功不代表拥有目标权限，异步线程也不会天然继承身份；无论成功失败，请求结束都必须避免身份泄漏到下一次执行。

## 高频题

### `FilterChainProxy` 做了什么？

**30 秒版**：它按 matcher 选择第一条安全链，通过虚拟链执行 Filter，最后回到 Servlet 原始链。

**源码展开**：入口 `web/.../FilterChainProxy.java:186`，选择链在 `:245`，虚拟链在 `:374`，清理在 `:208`。

**加分项**：还负责 firewall 包装请求。

**常见错答**：把它说成所有 Filter 都直接注册到容器。

### `ProviderManager` 为什么遍历多个 Provider？

**30 秒版**：不同 Token 由不同 Provider 处理，manager 负责顺序尝试、异常收敛和 parent 回退。

**源码展开**：`core/.../ProviderManager.java:166`、`:183`、`:215`。

**加分项**：返回 `null` 通常表示不支持。

**常见错答**：一个 Provider 必须支持全部认证方式。

### 认证成功后身份放在哪里？

**30 秒版**：当前请求放进策略管理的 `SecurityContext`，跨请求保留由 repository 决定。

**源码展开**：成功路径 `web/.../AbstractAuthenticationProcessingFilter.java:392`，设置在 `:396`。

**加分项**：JWT 无状态场景通常每次请求重新认证。

**常见错答**：把 Holder 等同于 Session。

### `AuthorizationManager` 的价值是什么？

**30 秒版**：它将身份和被保护对象输入到统一决策接口，可复用于 Web、方法和消息。

**源码展开**：接口 `core/.../AuthorizationManager.java:34`，Web 调用 `web/.../AuthorizationFilter.java:96`。

**加分项**：请求 matcher 委托器在 `web/.../RequestMatcherDelegatingAuthorizationManager.java:67`。

**常见错答**：授权只发生在 URL Filter 层。

### 为什么必须清理上下文？

**30 秒版**：容器和线程池复用线程，不清理会造成用户身份串号。

**源码展开**：`FilterChainProxy.java:208`，ThreadLocal 清理 `ThreadLocalSecurityContextHolderStrategy.java:37`。

**加分项**：异步包装器还会恢复原上下文。

**常见错答**：ThreadLocal 会自动可靠清空。
### `SecurityContextHolder` 为什么默认使用 ThreadLocal？

**30 秒版**：Servlet 请求通常在单线程内执行，ThreadLocal 可以让认证身份在调用链中隐式可见，同时避免把身份参数层层传递。

**源码展开**：策略由 `SecurityContextHolder` 初始化，默认策略对应 `ThreadLocalSecurityContextHolderStrategy`；需要跨线程时由 `DelegatingSecurityContextRunnable` 等包装器显式传递。

**加分项**：`MODE_INHERITABLETHREADLOCAL` 只适合受控的短生命周期子线程，不应当用来替代线程池上下文包装。

**常见错答**：把 ThreadLocal 说成跨请求共享，或认为线程池会自动继承提交线程的上下文。

## 高难追问

### 多条安全链重叠时怎么办？

第一条 matcher 命中的链生效，`FilterChainProxy#getFilters` 在 `web/.../FilterChainProxy.java:245` 命中后直接返回。具体路径排在通配规则前。

### 线程池中如何传播身份？

使用 `DelegatingSecurityContextRunnable` 或对应 Executor 包装器，执行后恢复原值。

## 场景题

### 用户串号怎么排查？

确认请求经过 `FilterChainProxy`，检查上下文 Filter 的 finally 清理，再检查业务线程池是否缺少包装。

### 未登录返回 403 怎么定位？

区分 EntryPoint 的 401 与 DeniedHandler 的 403，再检查异常转换 Filter 顺序。

## 反向问面试官

- 使用 Session、JWT 还是混合上下文仓库？
- 异步任务如何传播认证身份和 trace？

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| 多条安全链 matcher 重叠 | 请求命中意料之外的链 | `FilterChainProxy` 按顺序选择第一条匹配链 | 让具体路径排在通配规则前，并用调试日志确认命中链 |
| 认证成功但下一请求未登录 | 当前请求有身份，后续请求上下文为空 | 使用了无状态 repository，或请求未保存 `SecurityContext` | 明确选择 Session、JWT 或自定义 repository，并验证保存时机 |
| 未登录请求返回 403 | 客户端无法区分认证失败与权限不足 | `AuthenticationEntryPoint` 与 `AccessDeniedHandler` 配置或异常转换顺序不当 | 分别验证 401 和 403 路径，检查 `ExceptionTranslationFilter` |
| 异步任务身份串号 | 任务读取到提交者之外的身份 | 线程池线程复用，ThreadLocal 不会按任务自动清理 | 使用 `DelegatingSecurityContextExecutor` 等包装器，任务结束后恢复上下文 |
## Related

- [整体架构](/notes/source/java/spring/spring-security/architecture/)
- [认证流程与 AuthenticationManager](/notes/source/java/spring/spring-security/authentication/)
- [授权决策与 AuthorizationManager](/notes/source/java/spring/spring-security/authorization/)
