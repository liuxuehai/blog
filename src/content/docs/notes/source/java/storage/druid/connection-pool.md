---
title: 连接池生命周期
description: DruidDataSource 的借出、归还、创建、校验、缩容和失败重试。
category: Backend
tags: [Source Reading, Druid, Connection Pool]
order: 32
updatedDate: 2026-08-16
difficulty: advanced
status: stable
lastReviewed: 2026-08-16
draft: false
sidebar:
  order: 32
---

Druid 连接池的核心不是“保存一组连接”，而是把租借状态、空闲队列、创建任务和失效回收组织成一个并发状态机。

<!-- more -->

```text
new connection
      |
      v
idle deque <---- recycle/close ---- active proxy
      |                                  |
      +---- takeLast / validate --------+
      |
  create task / shrink / destroy
```

## 借出路径

1. `DruidDataSource#getConnection`：`DruidDataSource.java:1339`。
2. 超时版本 `getConnection(long)`：`:1343`。
3. Filter chain 分支：`:1348-1358`，启用过滤器时先由链包装。
4. `getConnectionDirect`：`:1373`，执行真实借出。
5. `takeLast`：`:2221`，从空闲连接结构取出 holder。
6. 借出后执行有效性和池状态校验：`:1373-1400` 附近。

## 归还路径

```text
application close()
  -> DruidPooledConnection#close
  -> recycle()
  -> DruidDataSource.recycle
  -> idle queue / destroy
```

- `DruidPooledConnection#close`：`DruidPooledConnection.java:236`。
- `DruidPooledConnection#recycle`：`:329`。
- `DruidDataSource#recycle`：`DruidDataSource.java:1901`。
- 池关闭或连接失效时，回收路径会转入销毁而非重新入队。

## 创建与缩容

- `CreateConnectionTask`：`DruidDataSource.java:2567`，把连接创建从借出线程中拆出。
- 原始连接建立：`DruidAbstractDataSource.java:1694-1696`。
- `shrink`：`DruidDataSource.java:3068`，按空闲时间、最小空闲数等条件清理。
- `lock` 和 `Condition`：`DruidAbstractDataSource.java:242-244`，用于等待和唤醒。

## 为什么把创建拆成任务

**替代方案**：借连接线程发现池为空时同步创建。
**为什么不行**：数据库连接建立包含网络、认证和初始化 SQL，突发流量会让大量业务线程同时卡在创建上。
**证据**：`CreateConnectionTask` 独立存在于 `DruidDataSource.java:2567`，借出路径只负责取用和触发补充。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| 连接泄漏 | active 数持续上升 | 代理未 close | 使用 try-with-resources |
| 校验过重 | 借连接延迟上升 | 每次借出都执行 validation query | 按网络质量配置校验策略 |
| 池关闭中借出 | 抛异常或拿到失效连接 | 生命周期状态变化 | 应用关闭前先停止流量 |
| 创建风暴 | 数据库连接数瞬时打满 | minIdle/初始化并发过高 | 限制创建速率和最大连接数 |

## 可迁移知识

连接池要同时建模“资源状态”和“线程等待状态”。队列、条件变量、后台创建任务与失败回收应当作为一个整体审查，不能只看 `borrow` 方法。

> **面试锚点**
> - Druid 借还连接的关键状态转换是什么？
> - 为什么关闭池连接通常是 recycle 而不是 close？
> - 连接校验失败后如何避免把坏连接重新放回池？

## Related

- [整体架构](/notes/source/java/storage/druid/architecture/)
- [JDBC 代理与过滤器链](/notes/source/java/storage/druid/filter-chain/)
- [HikariCP 源码解析](/notes/source/java/storage/hikaricp/)
