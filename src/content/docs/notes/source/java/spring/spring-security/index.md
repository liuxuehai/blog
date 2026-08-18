---
title: Spring Security
description: Spring Security 源码解析总览：Servlet 过滤器链、认证管理、授权决策与 SecurityContext 传播。
category: Backend
tags: [Source Reading, Spring Security, Authentication, Authorization]
order: 4
updatedDate: 2026-08-15
difficulty: advanced
status: stable
lastReviewed: 2026-08-15
draft: false
sidebar:
  order: 4
---

Spring Security 把安全控制拆成可组合的过滤器、认证管理器、授权管理器和上下文策略。

<!-- more -->

## 版本快照

| 项 | 值 |
| --- | --- |
| 仓库 | `spring-projects/spring-security` |
| 本地路径 | `E:\source\java\spring\spring-security` |
| 分支 | `main` |
| Commit | `82241b6cb8`（2026-08-13） |
| 最近 tag | `7.1.0` |

> 本册坐标均基于上述 commit。

## 模块地图

| 模块 | 职责 | 入口 |
| --- | --- | --- |
| `core` | Authentication、Authorization、SecurityContext | `ProviderManager` |
| `web` | Servlet/WebFlux 过滤器 | `FilterChainProxy` |
| `config` | DSL 与 Bean 装配 | `HttpSecurity` |

## 读码入口

1. `WebSecurityConfiguration` 生成 `SecurityFilterChain`。
2. `HttpSecurity` 构建并排序 Filter。
3. `FilterChainProxy` 选择链并执行。
4. `ProviderManager` 完成认证。
5. `AuthorizationFilter` 完成授权。
6. `SecurityContextHolderStrategy` 管理身份生命周期。

## 本册目录

- [整体架构](/notes/source/java/spring/spring-security/architecture/)
- [过滤器链与 SecurityFilterChain](/notes/source/java/spring/spring-security/filter-chain/)
- [认证流程与 AuthenticationManager](/notes/source/java/spring/spring-security/authentication/)
- [授权决策与 AuthorizationManager](/notes/source/java/spring/spring-security/authorization/)
- [SecurityContext 存储与传播](/notes/source/java/spring/spring-security/security-context/)
- [面试专题](/notes/source/java/spring/spring-security/interview/)

## Related

- [Spring Framework](/notes/source/java/spring/spring-framework/)
- [Spring Boot](/notes/source/java/spring/spring-boot/)