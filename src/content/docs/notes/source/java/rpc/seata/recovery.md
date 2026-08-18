---
title: 失败恢复与状态机
description: Seata TC 重试队列、全局状态、分支状态、锁释放与终态清理。
category: Backend
tags: [Source Reading, Seata, Recovery, State Machine]
order: 56
updatedDate: 2026-08-16
difficulty: advanced
status: stable
lastReviewed: 2026-08-16
draft: false
sidebar: { order: 56 }
---

Seata 的可靠性主要来自 TC 的状态机和后台重试，而不是一次 RPC 的成功率。提交或回滚失败时，TC 保留 session，把全局状态放入 retry 集合，下一轮调度重新读取分支并执行；成功后才关闭、解锁和清理。

## 重试状态机

```text
Committing ----failure----> CommitRetrying ----success----> Committed
     |                              |
     +------------------------------+ retry

Rollbacking --failure--> RollbackRetrying --success--> Rollbacked
     |
   timeout -> TimeoutRollbacking / TimeoutRollbackRetrying
```

`DefaultCoordinator` 用两个 scheduled executor 处理 rollbacking 和 committing，会根据最早 session 的死期计算调度；`DefaultCore` 对每个 branch 返回 retryable、unretryable、XAER_NOTA 等结果，再决定删除分支、重新入队或结束全局事务。

## 锁与清理顺序

AT 分支的全局锁不能在所有提交路径都立即释放。`GlobalSession#unlockBranch` 明确跳过 `Committing`、`CommitRetrying`、`AsyncCommitting`，因为提交 core 已经处理过释放；回滚路径则在分支结束或清理阶段释放，避免恢复过程中出现错误并发。

## 为什么这么设计

**替代方案一：** 失败立即删除 session。**问题：** 事务事实消失，无法知道是否已提交或需要补偿。**选择：** 保留 retrying 状态直到成功或达到终止策略。

**替代方案二：** 每次固定周期扫描全部 session。**问题：** 事务量大时扫描开销高，且无法贴近最早超时任务。**选择：** 按状态集合和 dead threshold 安排调度。

**替代方案三：** 任何异常都无限重试。**问题：** 永久故障会占满队列，锁也可能长期不释放。**选择：** 区分 retryable/unretryable、最大重试时间和终态策略。

## 源码坐标索引

- `DefaultCoordinator#handleRetryRollbacking` — `server/src/main/java/org/apache/seata/server/coordinator/DefaultCoordinator.java:451`
- `DefaultCoordinator#handleRetryCommitting` — `server/src/main/java/org/apache/seata/server/coordinator/DefaultCoordinator.java:487`
- `DefaultCoordinator#rollbackingSchedule` — `server/src/main/java/org/apache/seata/server/coordinator/DefaultCoordinator.java:586`
- `DefaultCoordinator#committingSchedule` — `server/src/main/java/org/apache/seata/server/coordinator/DefaultCoordinator.java:648`
- `DefaultCore#doGlobalCommit` — `server/src/main/java/org/apache/seata/server/coordinator/DefaultCore.java:284`
- `DefaultCore#doGlobalRollback` — `server/src/main/java/org/apache/seata/server/coordinator/DefaultCore.java:424`
- `DefaultCore#handleXAER_NOTA` — `server/src/main/java/org/apache/seata/server/coordinator/DefaultCore.java:542`
- `GlobalSession#queueToRetryCommit` — `server/src/main/java/org/apache/seata/server/session/GlobalSession.java:875`
- `GlobalSession#queueToRetryRollback` — `server/src/main/java/org/apache/seata/server/session/GlobalSession.java:882`
- `GlobalSession#unlockBranch` — `server/src/main/java/org/apache/seata/server/session/GlobalSession.java:361`
- `GlobalSession#closeAndClean` — `server/src/main/java/org/apache/seata/server/session/GlobalSession.java:312`
- `BranchSession#unlock` — `server/src/main/java/org/apache/seata/server/session/BranchSession.java:307`

## 边界与踩坑

- retryable 不代表一定能成功，必须有最大重试时间和人工处置路径。
- 异步提交意味着 commit RPC 返回后 TC 仍在工作，业务查询必须依赖状态接口。
- 解锁顺序错误会造成锁泄漏或脏写，不能在所有状态统一调用 unlock。

## 可迁移知识

可靠状态机要同时建模业务状态、重试状态、终态和清理动作。把重试当作异常处理分支通常不够，应该让它成为可持久化、可调度、可观测的正式状态。

> **面试锚点**：TC 如何保证重试不丢事务？为什么提交和回滚要分开调度？XAER_NOTA 为什么需要特殊处理？

## Related

- [事务生命周期](/notes/source/java/rpc/seata/transaction-lifecycle/)
- [Netty 通信与会话持久化](/notes/source/java/rpc/seata/remoting-and-session/)
- [Seata 概念笔记](/notes/backend/seata/)
