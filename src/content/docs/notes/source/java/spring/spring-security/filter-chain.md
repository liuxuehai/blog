---
title: 过滤器链与 SecurityFilterChain
description: FilterChainProxy 如何匹配请求并执行虚拟过滤器链。
category: Backend
tags: [Source Reading, Spring Security, Servlet Filter]
order: 42
updatedDate: 2026-08-19
difficulty: advanced
status: stable
lastReviewed: 2026-08-19
draft: false
sidebar:
  order: 42
---

`FilterChainProxy` 是 Servlet 栈的总调度器，把请求交给第一条匹配的 `SecurityFilterChain`。

<!-- more -->

## 先给答案：FilterChainProxy 先决定“用哪条链”，链内 Filter 再决定“请求能否继续”

不同请求可能需要不同安全策略，因此 Security 不是把所有 Filter 无条件串在一起，而是先按 matcher 选择第一条匹配链，再按顺序执行链内过滤器。第一条匹配链原则要求链的范围和顺序清晰，否则宽泛规则会吞掉后面的专用规则。

Filter 的顺序代表上下文依赖：认证过滤器要先建立身份，授权过滤器才能做决策，异常处理器还要包住可能抛出的认证/授权异常。调试安全问题时，先确定命中的链，再看具体 Filter 是否运行。


## 设计概览

```text
request -> FilterChainProxy
  -> HttpFirewall
  -> first matching chain
  -> VirtualFilterChain
  -> original FilterChain
```

## 实现拆解

1. `FilterChainProxy#doFilter`：`web/.../FilterChainProxy.java:186`。
2. `doFilterInternal`：`web/.../FilterChainProxy.java:213`。
3. 防火墙转换与请求包装：`web/.../FilterChainProxy.java:217`。
4. `getFilters`：`web/.../FilterChainProxy.java:245`。
5. 第一条 matcher 命中后返回：`web/.../FilterChainProxy.java:252`。
6. 虚拟链入口：`web/.../FilterChainProxy.java:374`。
7. 虚拟链耗尽后回原始链：`web/.../FilterChainProxy.java:376`。
8. finally 清理 holder：`web/.../FilterChainProxy.java:208`。

`DefaultSecurityFilterChain#matches` 位于 `web/.../DefaultSecurityFilterChain.java:89`，Filter 列表由 `:84` 返回。

## 为什么用第一条匹配链

**替代方案**：合并所有匹配链。
**为什么不行**：不同链可能有互斥的登录入口、上下文仓库和异常处理器。
**证据**：`getFilters` 命中后立即返回，不继续合并。

## 边界与踩坑

| 场景 | 现象 | 规避 |
| --- | --- | --- |
| `/api/**` 在 `/**` 后 | API 走默认链 | 具体 matcher 排前 |
| 直接调用原始链 | 安全 Filter 被绕过 | 使用 `springSecurityFilterChain` |
| 自定义 Filter 抛错 | 错误页异常 | 使用 DSL 顺序 API |

## 可迁移知识

虚拟链让执行器只持有下标，节点只负责自身副作用，便于装饰和观测。

> **面试锚点**
> - `FilterChainProxy` 和容器 FilterChain 的区别？
> - 多条链重叠时哪条生效？
> - 为什么 finally 必须清理上下文？

## Related

- [整体架构](/notes/source/java/spring/spring-security/architecture/)
- [SecurityContext 存储与传播](/notes/source/java/spring/spring-security/security-context/)
