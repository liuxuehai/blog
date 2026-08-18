---
title: 整体架构
description: Seata TM、TC、RM、事务模式和模块边界的源码地图。
category: Backend
tags: [Source Reading, Seata, Architecture]
order: 51
updatedDate: 2026-08-16
difficulty: advanced
status: stable
lastReviewed: 2026-08-16
draft: false
sidebar: { order: 51 }
---

Seata 把分布式事务拆成三个角色：TM 决定全局事务，RM 管理本地资源，TC 保存全局状态并驱动二阶段。核心设计是把事务协议和资源实现分开，`BranchType` 决定同一套协调入口之后走 AT、TCC、Saga 或 XA。

## 角色与调用图

```text
业务方法
  -> 注解拦截器 / TransactionalTemplate
  -> TM: begin ----------------------+
                                     v
                                TC: GlobalSession
                                     |
RM: branchRegister -> TC: BranchSession
                                     |
业务本地 SQL / Try
                                     |
TM: commit / rollback -> TC: DefaultCore
                              |       |       |
                             AT      TCC    Saga/XA
```

```text
integration-tx-api  -> tm / rm / tcc / saga
       |                    |
       +------ core rpc ----+
                              -> server coordinator
                                      -> session store / retry scheduler
rm-datasource -> JDBC proxy -> undo_log + lock manager
```

## 模块边界

`tm` 只负责发送全局事务请求，不保存完整分支列表；`rm` 只负责资源注册、分支报告和本地资源操作；`server` 的 `GlobalSession`/`BranchSession` 才是协调事实。`DefaultCore` 通过 `BranchType` 分派，而不是让每个资源实现自己理解所有全局状态。

## 为什么这么设计

**替代方案一：** 让业务服务直接互调完成两阶段。**问题：** 参与者之间互相感知，失败恢复和重试逻辑散落在业务代码。**选择：** TC 集中保存协议状态，RM 暴露资源动作。

**替代方案二：** 让 TM 保存全部分支并直接驱动提交。**问题：** TM 随调用线程生命周期存在，进程退出会丢失协调上下文。**选择：** TC 持久化全局/分支会话并承担恢复。

**替代方案三：** 为每种模式复制一套 coordinator。**问题：** begin、report、session、重试等公共协议重复。**选择：** `DefaultCore` 统一生命周期，模式 core 只实现资源差异。

## 源码坐标索引

- `GlobalTransactional` — `integration-tx-api/src/main/java/org/apache/seata/spring/annotation/GlobalTransactional.java:48`
- `DefaultTransactionManager#begin` — `tm/src/main/java/org/apache/seata/tm/DefaultTransactionManager.java:84`
- `DefaultTransactionManager#commit` — `tm/src/main/java/org/apache/seata/tm/DefaultTransactionManager.java:97`
- `TMClient#init` — `tm/src/main/java/org/apache/seata/tm/TMClient.java:33`
- `RMClient#init` — `rm/src/main/java/org/apache/seata/rm/RMClient.java:33`
- `AbstractResourceManager#branchRegister` — `rm/src/main/java/org/apache/seata/rm/AbstractResourceManager.java:73`
- `DefaultCore#branchRegister` — `server/src/main/java/org/apache/seata/server/coordinator/DefaultCore.java:105`
- `DefaultCore#branchCommit` — `server/src/main/java/org/apache/seata/server/coordinator/DefaultCore.java:130`
- `DefaultCoordinator#doGlobalBegin` — `server/src/main/java/org/apache/seata/server/coordinator/DefaultCoordinator.java:321`
- `GlobalSession#begin` — `server/src/main/java/org/apache/seata/server/session/GlobalSession.java:237`
- `BranchSession#lock` — `server/src/main/java/org/apache/seata/server/session/BranchSession.java:299`

## 边界与踩坑

- TM 成功拿到 XID 不等于分支已经注册；分支注册发生在资源实际参与时。
- `BranchType` 是协议路由字段，不能只根据是否使用 JDBC 推断模式。
- TC 的 session store、lock manager、remoting 是独立替换点，部署时不能只盯着数据库表。

## 可迁移知识

分布式协调器适合采用“公共生命周期 + 类型化策略”的结构。公共层负责状态、持久化和重试，策略层只负责资源动作，能减少模式扩展对协议核心的侵入。

> **面试锚点**：TM、TC、RM 各自保存什么？为什么 TC 必须独立于业务进程？`BranchType` 如何实现模式扩展？

## Related

- [事务生命周期](/notes/source/java/rpc/seata/transaction-lifecycle/)
- [AT 模式与 undo_log](/notes/source/java/rpc/seata/at-mode/)
- [Seata 概念笔记](/notes/backend/seata/)
