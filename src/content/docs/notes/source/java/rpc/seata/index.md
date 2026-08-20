---
title: Seata
description: Seata 2.x 源码解析：TM/TC/RM、全局事务生命周期、AT、TCC、Saga、XA 与 Netty 会话。
category: Backend
tags: [Source Reading, Seata, Distributed Transaction, Java]
order: 5
updatedDate: 2026-08-20
difficulty: advanced
status: stable
lastReviewed: 2026-08-20
draft: false
sidebar: { order: 5 }
---

Seata 的源码主线不是“一个事务注解”，而是客户端拦截、TM/TC/RM 协作、分支注册、二阶段执行和失败重试组成的协议。阅读时先建立角色边界，再进入 AT 的数据库代理，最后对照 TCC、Saga 与 XA 的资源模型。

<!-- more -->

## 本册问题地图

Seata 要先分清 TM、TC、RM 的责任，再比较 AT、TCC、Saga 和 XA：

1. **一次全局事务谁负责什么？** TM 发起和结束全局事务，TC 维护全局状态与分支，RM 执行本地资源操作并上报结果。
2. **AT 为什么需要 undo log 和全局锁？** 一阶段先提交本地 SQL，同时保存前镜像/后镜像；二阶段回滚依靠 undo log 恢复，并用全局锁减少并发覆盖。
3. **TCC 的空回滚和悬挂是什么？** Try 未成功时 Cancel 也可能到达，必须安全地空回滚；Try 晚到则不能再执行，避免悬挂写入。
4. **不同模式如何取舍？** AT 对业务侵入较小但依赖 SQL 镜像和锁，TCC 控制精细但需要实现补偿，Saga 适合长流程，XA 依赖资源管理器的两阶段能力。
5. **TC 重启如何恢复？** 依靠持久化事务状态、超时扫描、状态查询和幂等分支操作推进，而不是无条件重复 RPC。

## 版本快照

| 项 | 值 |
| --- | --- |
| 仓库 | `apache/incubator-seata` |
| 本地路径 | `E:\source\java\rpc\seata` |
| 分支 | `2.x` |
| Commit | `e01f97c6db397165050caa6764020410c2c8199a` |
| 快照日期 | `2026-08-14` |
| 最近 tag | `v0.1.4`（仅作祖先台账参考） |

> 本册源码坐标均基于上述 commit，行号随上游演进可能漂移。已有概念层说明见 [Seata 概念笔记](/notes/backend/seata/)。

## 本册目录

- [整体架构](/notes/source/java/rpc/seata/architecture/)
- [事务生命周期](/notes/source/java/rpc/seata/transaction-lifecycle/)
- [AT 模式与 undo_log](/notes/source/java/rpc/seata/at-mode/)
- [TCC、Saga 与 XA](/notes/source/java/rpc/seata/tcc-saga-xa/)
- [Netty 通信与会话持久化](/notes/source/java/rpc/seata/remoting-and-session/)
- [失败恢复与状态机](/notes/source/java/rpc/seata/recovery/)
- [面试专题](/notes/source/java/rpc/seata/interview/)

## 模块地图

| 角色 | 主要模块 | 关键入口 |
| --- | --- | --- |
| TM | `tm`、`integration-tx-api` | `GlobalTransactional`、`DefaultTransactionManager` |
| RM | `rm`、`rm-datasource`、`tcc`、`saga` | `RMClient`、`ConnectionProxy`、TCC/Saga handler |
| TC | `server` | `DefaultCoordinator`、`DefaultCore`、Session |
| 通信 | `core` | `AbstractNettyRemoting`、客户端/服务端 |
| 配置与发现 | `config`、`discovery`、`namingserver` | 注册、路由、集群发现 |

## 源码阅读路径

1. 从 `GlobalTransactional` 和拦截器进入客户端事务边界。
2. 顺着 `DefaultTransactionManager` 看 TM 如何把 begin/commit/rollback 转成 RPC。
3. 在 `DefaultCoordinator` 和 `DefaultCore` 看 TC 如何创建会话、注册分支并按类型分派。
4. 进入 `ConnectionProxy`、DML executor 和 undo log，理解 AT 的一阶段本地提交与二阶段补偿。
5. 最后比较 TCC/Saga/XA 的资源操作与重试边界。

## Related

- [RPC 与微服务](/notes/source/java/rpc/)
- [Seata 概念笔记](/notes/backend/seata/)
- [Sentinel 源码解析](/notes/source/java/rpc/sentinel/)
