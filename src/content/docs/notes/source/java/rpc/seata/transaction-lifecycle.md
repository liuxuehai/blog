---
title: 事务生命周期
description: Seata 全局开始、分支注册、提交回滚、状态转换与客户端报告的源码路径。
category: Backend
tags: [Source Reading, Seata, Transaction Lifecycle]
order: 52
updatedDate: 2026-08-16
difficulty: advanced
status: stable
lastReviewed: 2026-08-16
draft: false
sidebar: { order: 52 }
---

Seata 的一次全局事务可分成四段：TM 开始并取得 XID，RM 注册分支并执行本地一阶段，TM 请求二阶段，TC 根据分支状态完成、重试或进入失败终态。

## 主流程

```text
begin -> Begin
          |
          +-> branchRegister -> PhaseOne_Done / Failed
          |
业务返回成功 -----------------> commit -> Committing
业务抛异常/超时 ---------------> rollback -> Rollbacking
                                      |
                              retry / end / Finished
```

客户端的 begin/commit/rollback 是同步 RPC，但 TC 的二阶段失败不会绑定调用线程无限等待，而是转换为 `CommitRetrying`、`RollbackRetrying` 等可调度状态。

## 分支注册与关闭

`AbstractResourceManager#branchRegister` 组装请求并同步发送；TC 的 `DefaultCoordinator#doBranchRegister` 把请求交给 `DefaultCore`。`AbstractCore#branchRegister` 校验全局会话仍 active，然后创建 `BranchSession` 并挂到 `GlobalSession`。全局提交前关闭 session，防止新的分支继续加入。

## 为什么这么设计

**替代方案一：** 只在 commit 时收集参与者。**问题：** TC 无法提前知道资源、锁键和分支类型，二阶段也无法做冲突控制。**选择：** RM 在一阶段明确注册。

**替代方案二：** 失败后由客户端线程循环重试。**问题：** 客户端可能已宕机，线程重试会造成请求堆积。**选择：** TC 持久化 retry 状态，定时任务集中恢复。

**替代方案三：** 用一个布尔值表示全局成功/失败。**问题：** 超时、提交重试、异步提交和终态清理语义不同。**选择：** `GlobalStatus` 显式表达协议阶段。

## 源码坐标索引

- `DefaultTransactionManager#begin` — `tm/src/main/java/org/apache/seata/tm/DefaultTransactionManager.java:84`
- `DefaultTransactionManager#commit` — `tm/src/main/java/org/apache/seata/tm/DefaultTransactionManager.java:97`
- `DefaultTransactionManager#rollback` — `tm/src/main/java/org/apache/seata/tm/DefaultTransactionManager.java:105`
- `DefaultTransactionManager#syncCall` — `tm/src/main/java/org/apache/seata/tm/DefaultTransactionManager.java:129`
- `AbstractResourceManager#branchRegister` — `rm/src/main/java/org/apache/seata/rm/AbstractResourceManager.java:73`
- `AbstractResourceManager#branchReport` — `rm/src/main/java/org/apache/seata/rm/AbstractResourceManager.java:125`
- `DefaultCoordinator#doGlobalBegin` — `server/src/main/java/org/apache/seata/server/coordinator/DefaultCoordinator.java:321`
- `DefaultCoordinator#doGlobalCommit` — `server/src/main/java/org/apache/seata/server/coordinator/DefaultCoordinator.java:340`
- `DefaultCoordinator#doGlobalRollback` — `server/src/main/java/org/apache/seata/server/coordinator/DefaultCoordinator.java:347`
- `DefaultCoordinator#doBranchRegister` — `server/src/main/java/org/apache/seata/server/coordinator/DefaultCoordinator.java:369`
- `AbstractCore#branchRegister` — `server/src/main/java/org/apache/seata/server/coordinator/AbstractCore.java:87`
- `GlobalSession#changeGlobalStatus` — `server/src/main/java/org/apache/seata/server/session/GlobalSession.java:248`

## 边界与踩坑

- 业务方法返回成功后 commit RPC 仍可能返回 retry 状态，调用方不能把“请求已发送”当作最终提交完成。
- 分支 report 是状态同步，不是新的本地提交；本地提交已由 RM 的资源代理执行。
- 超时回滚与显式回滚会进入不同状态，监控和告警应按状态分类。

## 可迁移知识

长事务协议应把“请求结果”和“最终事实”分开：前者服务调用方，后者由持久化状态机和重试调度器维护。这样客户端短暂失败不会破坏最终恢复能力。

> **面试锚点**：为什么 branch register 必须发生在一阶段？TC 如何避免全局关闭后仍有新分支加入？重试状态为什么要持久化？

## Related

- [整体架构](/notes/source/java/rpc/seata/architecture/)
- [失败恢复与状态机](/notes/source/java/rpc/seata/recovery/)
- [Netty 通信与会话持久化](/notes/source/java/rpc/seata/remoting-and-session/)
