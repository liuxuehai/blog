---
title: JDBC 代理与过滤器链
description: Druid 如何包装 Connection、Statement 和 ResultSet，并以 FilterChain 插入横切逻辑。
category: Backend
tags: [Source Reading, Druid, JDBC]
order: 33
updatedDate: 2026-08-16
difficulty: advanced
status: stable
lastReviewed: 2026-08-16
draft: false
sidebar:
  order: 33
---

Druid 的过滤器不是 Servlet 式的请求拦截器，而是按 JDBC 方法分别实现的责任链。每个链方法都有明确的末端行为，因此能覆盖连接、语句和结果集的不同生命周期。

<!-- more -->

```text
ConnectionProxyImpl
      |
      v
FilterChainImpl(pos=0)
      |
  WallFilter -> StatFilter -> custom Filter
      |
      v
raw Connection / Statement / ResultSet
```

## 代理层

- `ConnectionProxyImpl`：`proxy/jdbc/ConnectionProxyImpl.java:30`。
- 过滤器链字段与初始化：`:43-88`。
- `createStatement`：`:166-182`。
- `prepareStatement`：`:358-371`。
- `StatementProxyImpl`：`proxy/jdbc/StatementProxyImpl.java:30`。
- `execute`：`StatementProxyImpl.java:135-143`。
- `executeQuery`：`:208-219`。
- `executeUpdate`：`:223-231`。

## 链推进

`Filter` 定义事件协议：`connection_connect` 在 `filter/Filter.java:46`，`resultSet_next` 在 `:178`，`statement_executeQuery` 在 `:678`，`statement_execute` 在 `:706`，`dataSource_getConnection` 在 `:1313`。

`FilterChain` 声明同名链方法：`filter/FilterChain.java:48`、`:170`、`:589`、`:617`、`:1313`。`FilterChainImpl#nextFilter` 在 `FilterChainImpl.java:469` 负责沿 `pos < filterSize` 取下一个过滤器，链尾才执行 raw JDBC。

## 为什么让每个 JDBC 事件拥有独立链方法

**替代方案**：定义一个通用 `aroundInvoke(methodName, args)`，所有逻辑通过反射分派。
**为什么不行**：JDBC 方法参数和返回值差异很大，反射会损失类型安全、调试可读性和热路径性能。
**证据**：`Filter`、`FilterChain` 和 `FilterChainImpl` 对 `execute`、`executeQuery`、`resultSet_next` 分别提供静态签名。

## 顺序语义

过滤器通常形成“前置 -> 下游 -> 后置”的结构。Wall 在执行前检查 SQL，Stat 在前置阶段记录开始时间，在下游返回后计算耗时；自定义 Filter 插入错误位置会改变观测结果。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| 忘记继续链 | SQL 不再执行 | Filter 没有调用 chain 方法 | 明确前置、下游、后置三段 |
| 重复执行 | 一次业务出现两条 SQL | 过滤器重复调用 next | 每个事件只推进一次 |
| 只拦 execute | prepare 场景漏统计 | JDBC 调用入口不同 | 同时覆盖 query/update/execute |
| ResultSet 漏关 | 连接无法归还 | 只监听 Statement | 监听 ResultSet close/next |

## 可迁移知识

当 API 方法族稳定且类型差异明显时，显式链方法比万能反射拦截更适合性能敏感代码。协议清晰也更容易让安全和统计插件独立演进。

> **面试锚点**
> - FilterChain 的 `pos` 如何保证每个过滤器只执行一次？
> - 为什么代理需要覆盖 ResultSet，而不是只代理 Connection？
> - WallFilter 和 StatFilter 的顺序会影响什么？

## Related

- [Wall 防火墙](/notes/source/java/storage/druid/wall-firewall/)
- [StatFilter 统计](/notes/source/java/storage/druid/stat-filter/)
- [整体架构](/notes/source/java/storage/druid/architecture/)
