---
title: 认证流程与 AuthenticationManager
description: Authentication Filter、ProviderManager 与 AuthenticationProvider 的协作链路。
category: Backend
tags: [Source Reading, Spring Security, Authentication]
order: 43
updatedDate: 2026-08-15
difficulty: advanced
status: stable
lastReviewed: 2026-08-15
draft: false
sidebar:
  order: 43
---

认证把未认证凭证转换成带权限的 `Authentication`，再由过滤器保存成功结果或转换失败。

<!-- more -->

## 调用链

```text
credentials -> Authentication Filter
  -> AuthenticationManager
  -> ProviderManager
  -> AuthenticationProvider(s)
  -> SecurityContextRepository
```

## 实现拆解

1. `AbstractAuthenticationProcessingFilter#doFilter`：`web/.../AbstractAuthenticationProcessingFilter.java:237`。
2. 认证 matcher：`web/.../AbstractAuthenticationProcessingFilter.java:328`。
3. manager 调用：`web/.../AbstractAuthenticationProcessingFilter.java:363`。
4. 成功处理：`web/.../AbstractAuthenticationProcessingFilter.java:392`。
5. 成功设置上下文：`web/.../AbstractAuthenticationProcessingFilter.java:396`。
6. 失败处理：`web/.../AbstractAuthenticationProcessingFilter.java:419`。
7. provider 遍历：`core/.../ProviderManager.java:166`、`:183`。
8. parent 回退：`core/.../ProviderManager.java:215`。
9. Basic 复用 manager：`web/.../BasicAuthenticationFilter.java:204`。

## 为什么是 Provider 链

**替代方案**：一个 manager 写死密码、LDAP、JWT 等全部分支。
**为什么不行**：协议扩展会制造条件分支，应用也无法按需组合认证能力。
**证据**：`ProviderManager` 负责遍历，具体凭证逻辑下沉到 `AuthenticationProvider`。

## 边界与踩坑

| 场景 | 原因 | 规避 |
| --- | --- | --- |
| provider 顺序错误 | 未区分不支持与失败 | 正确实现 `supports` |
| 成功后下一请求匿名 | 未保存 repository | 使用成功处理器 |
| 每次请求查用户 | 没有持久化策略 | 选择 Session 或 JWT |

## 可迁移知识

Provider 链是能力路由模式，适合支付方式、编解码器和存储驱动选择。

> **面试锚点**
> - 三个 Authentication 抽象如何分工？
> - 返回 `null` 和抛异常的区别？
> - 成功身份在哪里保存？

## Related

- [SecurityContext 存储与传播](/notes/source/java/spring/spring-security/security-context/)
- [过滤器链与 SecurityFilterChain](/notes/source/java/spring/spring-security/filter-chain/)