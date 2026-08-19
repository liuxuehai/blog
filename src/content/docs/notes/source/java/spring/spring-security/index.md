---
title: Spring Security
description: Spring Security 源码解析总览：Servlet 过滤器链、认证管理、授权决策与 SecurityContext 传播。
category: Backend
tags: [Source Reading, Spring Security, Authentication, Authorization]
order: 4
updatedDate: 2026-08-19
difficulty: advanced
status: stable
lastReviewed: 2026-08-19
draft: false
sidebar:
  order: 4
---

Spring Security 把安全控制拆成可组合的过滤器、认证管理器、授权管理器和上下文策略。

<!-- more -->

## 本册问题地图

Spring Security 的核心不是“加几个注解”，而是把请求身份、认证方式、授权决策和上下文传播组织成一条过滤链：

1. 请求如何选中唯一的 `SecurityFilterChain`？
2. 凭证如何被转换成 Authentication，再由 Provider 链处理？
3. 认证成功后，SecurityContext 如何保存并跨线程传播？
4. 授权决策为什么从固定 voter 模式走向 `AuthorizationManager`？
5. 认证失败和授权拒绝为什么是两条不同的响应路径？

读完整册后，应当能从请求进入过滤器开始，解释“当前用户是谁、凭证是否有效、是否有权限、结果如何写回响应”。


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
