---
title: 代理、状态重置与泄漏检测
description: ProxyConnection 如何拦截关闭、回滚、状态变更和连接泄漏任务。
category: Backend
tags: [Source Reading, HikariCP, JDBC]
order: 45
updatedDate: 2026-08-16
difficulty: advanced
status: stable
lastReviewed: 2026-08-16
draft: false
sidebar:
  order: 45
---

代理连接把 JDBC 的隐式状态变化显式化：记录 dirty bits，关闭时回滚未提交事务、关闭打开的 Statement、重置连接状态，并取消泄漏任务。

<!-- more -->

```text
application changes state
  -> ProxyConnection dirtyBits
  -> close()
       -> close open statements
       -> rollback if needed
       -> resetConnectionState
       -> cancel leak task
       -> pool.recycle
```

## 代理层

- `ProxyConnection`：`src/main/java/com/zaxxer/hikari/pool/ProxyConnection.java:37`。
- 构造与池条目引用：`:86-145`。
- `close`：`:240-262`。
- rollback：`:384-395`。
- 代理工厂：`ProxyFactory.java:38-76`。
- Statement 代理：`ProxyStatement.java:32-85`。
- ResultSet 代理：`ProxyResultSet.java:31-35`。

## 状态重置

- `PoolEntry#resetConnectionState`：`PoolEntry.java:104-106`。
- `PoolBase#resetConnectionState`：`PoolBase.java:213`。
- 新条目默认状态：`PoolBase.java:208-210`。
- 连接初始化时的状态处理：`PoolBase.java:360-373`。

连接可能被调用者改变 autoCommit、readOnly、isolation、catalog、schema、network timeout 等属性。代理用 dirty bits 记录变化，归还时只重置被污染的状态，避免每次全量调用 JDBC setter。

## 泄漏检测

- `ProxyLeakTaskFactory`：`pool/ProxyLeakTaskFactory.java:27-50`。
- `ProxyLeakTask`：`pool/ProxyLeakTask.java:32-75`。
- 借出时安排任务：`HikariPool.java:179`。
- 正常关闭时取消任务：`ProxyConnection.java:240-262`。

## 为什么用 dirty bits 而不是全量重置

**替代方案**：每次 close 都把所有连接属性恢复到默认值。
**为什么不行**：JDBC setter 可能触发网络往返或驱动内部工作，固定全量重置会增加归还延迟。
**证据**：`ProxyConnection.java:240-262` 将 dirty bits 传递给 `PoolEntry.resetConnectionState`，由 `PoolBase.java:213` 按需恢复。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| 忘记关闭 Statement | 下次使用出现旧资源 | 代理 close 需要清理 openStatements | 使用 try-with-resources |
| 事务未提交 | 数据被带入下一次租借 | close 时未 rollback | 保持默认 autoCommit 或显式提交/回滚 |
| 泄漏误报 | 日志提示连接泄漏 | 长事务超过阈值但最终会关闭 | 结合调用栈和业务耗时判断 |
| dirty bits 漏记 | 状态跨请求污染 | 新增 setter 未更新追踪 | 检查代理生成代码和状态位 |

## 可迁移知识

代理不仅是 API 包装器，也是资源租借协议的实现者。按需记录状态、在 close 收口，适用于线程池上下文、租户上下文和可复用客户端会话。

> **面试锚点**
> - HikariCP 如何防止事务状态泄漏到下一个请求？
> - dirty bits 的优化价值是什么？
> - 泄漏检测为什么只能提示而不能直接证明 bug？

## Related

- [连接借还生命周期](/notes/source/java/storage/hikaricp/connection-lifecycle/)
- [ConcurrentBag 并发容器](/notes/source/java/storage/hikaricp/concurrent-bag/)
- [Druid JDBC 代理](/notes/source/java/storage/druid/filter-chain/)
