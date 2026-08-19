---
title: 授权决策与 AuthorizationManager
description: AuthorizationFilter 与 RequestMatcherDelegatingAuthorizationManager 的源码链路。
category: Backend
tags: [Source Reading, Spring Security, Authorization]
order: 44
updatedDate: 2026-08-19
difficulty: advanced
status: stable
lastReviewed: 2026-08-19
draft: false
sidebar:
  order: 44
---

授权发生在认证之后：`AuthorizationManager` 接收身份和被保护对象，返回授权决策。

<!-- more -->

## 先给答案：授权是在身份已经确定之后，对“主体能否执行这次操作”做独立决策

认证回答“你是谁”，授权回答“你能不能做这件事”。AuthorizationManager 接收 Authentication、对象或方法调用以及上下文，返回授予、拒绝或无法决定的结果，从而支持 URL、方法和领域对象级规则。

授权失败不应回到认证流程：已登录但无权限通常是拒绝，未登录才是需要认证。把两者分开后，异常转换、响应状态码和审计记录才能准确表达实际问题。


## 决策链

```text
request -> AuthorizationFilter
  -> getAuthentication
  -> AuthorizationManager#authorize
  -> matcher delegate
  -> granted / denied
```

## 实现拆解

1. `AuthorizationFilter` 类：`web/.../AuthorizationFilter.java:52`。
2. Filter 入口：`web/.../AuthorizationFilter.java:77`。
3. manager 调用：`web/.../AuthorizationFilter.java:96`。
4. 成功放行：`web/.../AuthorizationFilter.java:101`。
5. 读取身份：`web/.../AuthorizationFilter.java:140`。
6. `AuthorizationManager` 接口：`core/.../AuthorizationManager.java:34`。
7. matcher 委托入口：`web/.../RequestMatcherDelegatingAuthorizationManager.java:67`。
8. 委托调用：`web/.../RequestMatcherDelegatingAuthorizationManager.java:82`。
9. 构建器：`web/.../RequestMatcherDelegatingAuthorizationManager.java:169`。
10. DSL 装配：`config/.../AuthorizeHttpRequestsConfigurer.java:190`。

## 为什么用 AuthorizationManager

**替代方案**：每个认证 Filter 同时判断 URL 和权限。
**为什么不行**：认证方式与授权对象是正交维度，Basic、Bearer、表单登录应共享规则。
**证据**：`AuthorizationManager<T>` 用泛型抽象被保护资源，Web 与 Method 分别适配。

## 边界与踩坑

| 场景 | 现象 | 规避 |
| --- | --- | --- |
| 无兜底规则 | 未匹配 URL 被拒绝 | 配置 `anyRequest` |
| 未认证返回 403 | 认证挑战丢失 | 区分 401 与 403 |
| matcher 顺序错误 | 后规则不执行 | 具体路径先于通配 |

## 可迁移知识

“匹配器选择策略 + 策略返回决策”适合多租户路由、脱敏和 feature flag。

> **面试锚点**
> - 认证失败和授权失败如何区分？
> - matcher 委托器为什么强调顺序？
> - 如何复用于方法安全？

## Related

- [认证流程与 AuthenticationManager](/notes/source/java/spring/spring-security/authentication/)
- [过滤器链与 SecurityFilterChain](/notes/source/java/spring/spring-security/filter-chain/)
