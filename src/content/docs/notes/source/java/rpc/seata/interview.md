---
title: 面试专题
description: Seata 两阶段提交、AT/TCC/Saga/XA、失败恢复和源码设计取舍面试题。
category: Backend
tags: [Source Reading, Seata, Interview]
order: 57
updatedDate: 2026-08-16
difficulty: advanced
status: stable
lastReviewed: 2026-08-16
draft: false
sidebar: { order: 57 }
---

这篇把前几篇的源码事实压缩成面试回答：先讲角色和协议，再讲 AT 的本地原子性，最后说明各种模式的边界与失败恢复。

## 一张总图

```text
TM begin -> TC GlobalSession
RM SQL/Try -> BranchSession + local commit
TM commit/rollback -> TC DefaultCore
  -> mode-specific branch action
  -> retryable? keep session and retry
  -> success? release lock, remove branch, end session
```

## 高频问题

**Q：Seata 的两阶段和 XA 两阶段一样吗？**

A：不是。Seata 是协调协议，AT 一阶段先在本地提交业务数据与 undo log，二阶段通常是提交清理或回滚补偿；XA 则在资源层先 prepare，再由 TC 决定 commit/rollback。

**Q：AT 如何解决脏写？**

A：分支注册锁键做并发控制，回滚时 `AbstractUndoExecutor` 比较 after image 与 current image；不一致时继续比较 before image，无法证明安全时抛 dirty exception，而不是强行覆盖。

**Q：为什么 TCC 需要幂等？**

A：TC 可能因响应丢失而重试 Confirm/Cancel，RM 无法把一次网络请求成功和调用方收到响应绑定起来。幂等是重试协议的资源前提。

**Q：Saga 为什么不是“没有锁的 XA”？**

A：Saga 允许中间结果提交并通过补偿动作回退，语义是最终一致而非隔离性一致；它依赖状态日志和业务补偿，不具备 XA 的 prepare 锁定语义。

**Q：TC 宕机后如何恢复？**

A：GlobalSession/BranchSession 通过 session store 持久化，TC 重启后按 Committing、Rollbacking、Retrying 等状态重新调度，客户端超时不等于事务事实丢失。

## 为什么这么设计

**替代方案一：** 用全局锁包住所有远程调用。**问题：** 锁跨网络、跨服务，延迟和故障都会放大。**选择：** AT 用短本地事务和全局锁键，TCC/Saga 以补偿换取更低资源占用。

**替代方案二：** 把所有失败都映射成 rollback。**问题：** commit 已部分成功、XAER_NOTA、Saga forward retry 等情况不能简单等价。**选择：** 用 BranchStatus/GlobalStatus 区分 retryable 和终态。

**替代方案三：** 让业务自行维护事务日志。**问题：** 每个服务会重复实现协议、幂等和恢复。**选择：** TC 维护协调状态，RM 只实现资源适配契约。

## 源码坐标索引

- `DefaultTransactionManager#begin` — `tm/src/main/java/org/apache/seata/tm/DefaultTransactionManager.java:84`
- `DefaultTransactionManager#globalReport` — `tm/src/main/java/org/apache/seata/tm/DefaultTransactionManager.java:121`
- `AbstractResourceManager#branchRegister` — `rm/src/main/java/org/apache/seata/rm/AbstractResourceManager.java:73`
- `DefaultCoordinator#doGlobalBegin` — `server/src/main/java/org/apache/seata/server/coordinator/DefaultCoordinator.java:321`
- `DefaultCoordinator#doBranchRegister` — `server/src/main/java/org/apache/seata/server/coordinator/DefaultCoordinator.java:369`
- `DefaultCore#doGlobalCommit` — `server/src/main/java/org/apache/seata/server/coordinator/DefaultCore.java:284`
- `DefaultCore#doGlobalRollback` — `server/src/main/java/org/apache/seata/server/coordinator/DefaultCore.java:424`
- `ConnectionProxy#processGlobalTransactionCommit` — `rm-datasource/src/main/java/org/apache/seata/rm/datasource/ConnectionProxy.java:247`
- `AbstractUndoExecutor#dataValidationAndGoOn` — `rm-datasource/src/main/java/org/apache/seata/rm/datasource/undo/AbstractUndoExecutor.java:234`
- `TccActionInterceptorHandler` — `tcc/src/main/java/org/apache/seata/rm/tcc/interceptor/TccActionInterceptorHandler.java:48`
- `SagaCore#doGlobalCommit` — `server/src/main/java/org/apache/seata/server/transaction/saga/SagaCore.java:105`
- `ResourceManagerXA#branchCommit` — `rm-datasource/src/main/java/org/apache/seata/rm/datasource/xa/ResourceManagerXA.java:125`
- `AbstractNettyRemoting#sendSync` — `core/src/main/java/org/apache/seata/core/rpc/netty/AbstractNettyRemoting.java:185`

## 边界与踩坑

- Seata 不是让任意跨服务调用自动获得强隔离；模式选择决定一致性、性能和业务改造成本。
- AT 的全局锁、undo log、数据库隔离级别和 SQL 支持必须一起评估。
- 只测试成功路径无法证明事务可靠性，必须覆盖响应丢失、重复 Confirm/Cancel、TC 重启和 dirty record。

## 可迁移知识

分布式事务设计的通用问题是：凭证在哪里、决策在哪里、资源如何重试、重复执行如何幂等、失败后如何查询最终事实。Seata 的 TM/TC/RM、session store 和模式策略正好对应这五个问题。

> **面试锚点**：用一句话区分 AT/TCC/Saga/XA；解释 TC 为什么必须持久化；说明网络超时为何不能直接判定回滚。

## Related

- [整体架构](/notes/source/java/rpc/seata/architecture/)
- [事务生命周期](/notes/source/java/rpc/seata/transaction-lifecycle/)
- [失败恢复与状态机](/notes/source/java/rpc/seata/recovery/)
- [Seata 概念笔记](/notes/backend/seata/)
