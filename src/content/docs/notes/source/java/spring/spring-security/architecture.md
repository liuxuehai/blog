---
title: 整体架构
description: Spring Security 的 core、web、config 分层，以及启动和请求流程。
category: Backend
tags: [Source Reading, Spring Security, Architecture]
order: 41
updatedDate: 2026-08-24
difficulty: advanced
status: stable
lastReviewed: 2026-08-24
draft: false
sidebar:
  order: 41
---

Spring Security 将安全策略声明与请求时执行分开：`HttpSecurity` 构建链，`FilterChainProxy` 执行链。

<!-- more -->

## 先给答案：配置期生成链，请求期只执行首条匹配链

Spring Security 在配置阶段由 `HttpSecurity` 把 DSL 组装为一个或多个 `DefaultSecurityFilterChain`；请求到来后，`FilterChainProxy` 按 matcher 选择第一条链，依次完成上下文加载、认证、授权和进入原 Servlet 链。

安全语义依赖顺序与清理：链的先后决定匹配结果，认证只负责建立 Authentication，授权再基于它作决策，请求结束必须清除 SecurityContext。错误共享上下文、绕过代理链或把认证与授权混为一谈都会留下越权边界。

## 分层

```text
HttpSecurity / WebSecurityConfiguration
  -> DefaultSecurityFilterChain
       -> FilterChainProxy
            -> SecurityContext
            -> Authentication filters
            -> AuthorizationFilter
            -> Servlet FilterChain
```

| 层 | 核心类 | 坐标 |
| --- | --- | --- |
| 配置 | `HttpSecurity` | `config/.../HttpSecurity.java:148` |
| 执行 | `FilterChainProxy` | `web/.../FilterChainProxy.java:146` |
| 认证 | `ProviderManager` | `core/.../ProviderManager.java:91` |
| 授权 | `AuthorizationManager` | `core/.../AuthorizationManager.java:34` |
| 上下文 | `SecurityContextHolderStrategy` | `core/.../SecurityContextHolderStrategy.java:30` |

## 启动流程

```text
@Bean SecurityFilterChain
  -> HttpSecurity.build()
  -> AbstractConfiguredSecurityBuilder
  -> DefaultSecurityFilterChain
  -> WebSecurity 注册 springSecurityFilterChain
```

`WebSecurityConfiguration#springSecurityFilterChain` 位于 `config/.../WebSecurityConfiguration.java:116`，在 `:122` 调用 `httpSecurity.build()`。

## 请求流程

```text
request -> FilterChainProxy#doFilter
  -> firewall -> getFilters
  -> VirtualFilterChain
  -> original chain
  -> finally clear SecurityContext
```

`FilterChainProxy#doFilter` 在 `web/.../FilterChainProxy.java:186`，内部流程在 `:213`，链执行在 `:223`，上下文清理在 `:208`。`DefaultSecurityFilterChain#matches` 和 `getFilters` 分别在 `web/.../DefaultSecurityFilterChain.java:89`、`:84`。

## 关键取舍

**替代方案**：所有请求共用一个固定 Filter 列表。
**为什么不行**：静态资源、API 和管理端点通常需要不同策略；全局链会把 URL 分支散落到每个 Filter。
**证据**：`FilterChainProxy#getFilters` 按 `SecurityFilterChain#matches` 选择第一条链。

## 边界与踩坑

| 场景 | 现象 | 规避 |
| --- | --- | --- |
| matcher 重叠 | 规则不生效 | 具体路径排前 |
| 手动 new Filter | 依赖为空 | 通过 DSL 或 Bean 注册 |
| Filter 顺序错误 | 认证信息为空 | 明确 before/after |

## 可迁移知识

“声明配置 -> 构建执行计划 -> 运行时选择计划”适合路由、限流和租户策略。

> **面试锚点**
> - 多条 `SecurityFilterChain` 如何选择？
> - DSL 何时真正变成 Filter？
> - 为什么必须 finally 清理上下文？

## Related

- [过滤器链与 SecurityFilterChain](/notes/source/java/spring/spring-security/filter-chain/)
- [认证流程与 AuthenticationManager](/notes/source/java/spring/spring-security/authentication/)
