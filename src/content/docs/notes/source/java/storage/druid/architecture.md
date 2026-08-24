---
title: 整体架构
description: Druid 从连接池到 JDBC 代理、过滤器链、SQL 安全和统计监控的完整分层。
category: Backend
tags: [Source Reading, Druid, Architecture]
order: 31
updatedDate: 2026-08-24
difficulty: advanced
status: stable
lastReviewed: 2026-08-24
draft: false
sidebar:
  order: 31
---

Druid 的关键设计是把“获得连接”和“使用连接”分开：池管理物理连接生命周期，代理对象承载 JDBC 行为，过滤器链把安全、统计和自定义逻辑插入调用路径。

<!-- more -->

## 先给答案：Druid 的关键设计是把“获得连接”和“使用连接”分开：池管理物理连接生命周期，代理对象承载 JDBC …

Druid 的关键设计是把“获得连接”和“使用连接”分开：池管理物理连接生命周期，代理对象承载 JDBC 行为，过滤器链把安全、统计和自定义逻辑插入调用路径。 正文沿“分层 -> 主流程：一次查询 -> 核心边界”展开：先确认入口和状态归属，再跟踪控制流或数据流的推进，最后落到对外可观察的结果。

主要失效边界集中在“DruidDataSource 管理物理连接，DruidPooledConnection 管理一次租借。、FilterChain 管理横切逻辑顺序，WallProvider 管理 SQL 策略。、Web 层只读取 DruidDataSourceStatManager，不直接操作池内队列。”这些场景。它们破坏的是容量、顺序、并发或生命周期前提；排查时应先确认状态是否仍由正确对象持有，再核对推进条件和清理路径。

## 分层

```text
Application
    |
    v
DruidPooledConnection / Statement / ResultSet
    |
ConnectionProxyImpl -> FilterChainImpl -> raw JDBC object
    |                         |
    +---- StatFilter / WallFilter / custom Filter
    |
DruidDataSource
    |
idle holders <--------> active holders
```

| 层 | 职责 | 关键类 |
| --- | --- | --- |
| 池层 | 借出、归还、创建和销毁物理连接 | `DruidDataSource` |
| 代理层 | 保持 JDBC API 兼容并拦截调用 | `ConnectionProxyImpl` |
| 链层 | 顺序调用过滤器并落到 raw JDBC | `FilterChainImpl` |
| 语义层 | 解析、检查和统计 SQL | `SQLUtils`、`WallProvider`、`StatFilter` |
| 展示层 | 暴露统计与管理操作 | `StatViewServlet` |

## 主流程：一次查询

```text
getConnection
  -> DruidPooledConnection
  -> createStatement / prepareStatement
  -> FilterChainImpl
  -> WallFilter.check + StatFilter.before
  -> raw Statement.execute
  -> StatFilter.after
  -> ResultSet proxy
```

1. `DruidDataSource#getConnection` 在 `core/src/main/java/com/alibaba/druid/pool/DruidDataSource.java:1339` 进入借连接流程。
2. `getConnectionDirect` 在 `:1373` 执行校验、重试和超时判断。
3. `DruidPooledConnection#createStatement` 在 `DruidPooledConnection.java:655` 创建代理 Statement。
4. `ConnectionProxyImpl#createStatement` 在 `ConnectionProxyImpl.java:166` 将调用交给链。
5. `FilterChainImpl#statement_execute` 在 `FilterChainImpl.java:617` 逐个推进过滤器。
6. 链末端调用 raw JDBC；`StatFilter` 在 `StatFilter.java:415` 附近记录执行前后状态。
7. `DruidPooledConnection#close` 在 `DruidPooledConnection.java:236` 不直接关闭物理连接，而是进入回收。

## 核心边界

- `DruidDataSource` 管理物理连接，`DruidPooledConnection` 管理一次租借。
- `FilterChain` 管理横切逻辑顺序，`WallProvider` 管理 SQL 策略。
- Web 层只读取 `DruidDataSourceStatManager`，不直接操作池内队列。

## 为什么用多层代理而不是只代理 DataSource

**替代方案**：只包装 `DataSource#getConnection`，把所有逻辑放在连接返回前。
**为什么不行**：SQL 执行发生在 Statement 和 ResultSet 生命周期中，慢 SQL、错误、行数和资源泄漏都需要更细粒度的事件。
**证据**：`ConnectionProxyImpl.java:166`、`StatementProxyImpl.java:135` 和 `Filter.java:178` 分别覆盖连接、执行和结果集事件。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| 代理关闭 | 业务以为连接已物理关闭 | `close` 语义是归还池 | 不要在连接关闭后继续使用代理 |
| Filter 顺序 | 统计或防火墙行为变化 | 链是有序的 | 固定 `WallFilter`、`StatFilter` 的装配顺序 |
| 直接拿 raw connection | 监控缺失 | 绕过代理链 | 不要依赖内部 raw 对象 |

## 可迁移知识

资源管理、调用拦截和业务横切逻辑可以分成三层。只要每层通过稳定接口连接，连接池、RPC 客户端和文件句柄管理都能复用这个结构。

> **面试锚点**
> - Druid 的池、代理、过滤器三层分别解决什么问题？
> - 为什么 `Connection.close()` 不等于物理连接关闭？
> - FilterChain 的末端为什么必须保留 raw JDBC 调用？

## Related

- [连接池生命周期](/notes/source/java/storage/druid/connection-pool/)
- [JDBC 代理与过滤器链](/notes/source/java/storage/druid/filter-chain/)
- [StatFilter 统计](/notes/source/java/storage/druid/stat-filter/)
