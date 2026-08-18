---
title: AT 模式与 undo_log
description: Seata AT 模式的数据源代理、前后镜像、undo_log、全局锁与脏写检测。
category: Backend
tags: [Source Reading, Seata, AT Mode, JDBC]
order: 53
updatedDate: 2026-08-16
difficulty: advanced
status: stable
lastReviewed: 2026-08-16
draft: false
sidebar: { order: 53 }
---

AT 模式把业务 SQL 包在 JDBC 代理里：执行 DML 前读 before image，执行后读 after image，提交前写 undo log 并注册分支，二阶段提交主要释放锁，二阶段回滚则依据镜像生成反向 SQL。

## 一阶段与二阶段

```text
SQL
  -> DataSourceProxy -> ConnectionProxy
  -> DML executor
       beforeImage -> business SQL -> afterImage
       -> undo item + lockKey
  -> branchRegister + flush undo_log + local commit

rollback -> read undo_log -> validate current rows -> inverse SQL
commit   -> delete/release branch resources
```

`ConnectionProxy#processGlobalTransactionCommit` 先注册分支、刷新 undo log，再提交本地连接并报告 PhaseOne。这个顺序让 TC 获得可回滚凭证，同时把业务数据和 undo log 放进同一本地数据库事务。

## 自动提交的特殊路径

`AbstractDMLBaseExecutor#doExecute` 区分 autoCommit。自动提交时先切到手动提交，复用 before/after image 与锁重试逻辑，完成 Seata 提交后再恢复连接状态；否则每条 SQL 都会过早释放本地事务，undo log 无法和业务数据原子落盘。

## 回滚验证

`AbstractUndoExecutor#dataValidationAndGoOn` 比较 before、after 和 current image：current 等于 after 才允许逆向恢复；current 已等于 before 则无需重复回滚；三者都不匹配则判定 dirty record，避免覆盖外部并发修改。

## 为什么这么设计

**替代方案一：** 只记录 SQL，不记录数据镜像。**问题：** SQL 参数不足以恢复复杂更新，且无法判断外部修改。**选择：** 保存 before/after image，并按表元数据生成逆向 SQL。

**替代方案二：** 二阶段回滚直接覆盖当前行。**问题：** 会把全局事务之后的合法修改覆盖掉。**选择：** 回滚前做镜像校验，冲突时抛出 dirty exception。

**替代方案三：** 把 undo log 写入 TC。**问题：** 跨网络写入增加延迟，且无法与业务本地提交保持同库原子性。**选择：** undo log 写业务库，TC 只保存分支和锁元数据。

## 源码坐标索引

- `AbstractDataSourceProxy` — `rm-datasource/src/main/java/org/apache/seata/rm/datasource/AbstractDataSourceProxy.java:29`
- `ConnectionProxy#bind` — `rm-datasource/src/main/java/org/apache/seata/rm/datasource/ConnectionProxy.java:85`
- `ConnectionProxy#checkLock` — `rm-datasource/src/main/java/org/apache/seata/rm/datasource/ConnectionProxy.java:113`
- `ConnectionProxy#appendUndoLog` — `rm-datasource/src/main/java/org/apache/seata/rm/datasource/ConnectionProxy.java:171`
- `ConnectionProxy#commit` — `rm-datasource/src/main/java/org/apache/seata/rm/datasource/ConnectionProxy.java:185`
- `ConnectionProxy#processGlobalTransactionCommit` — `rm-datasource/src/main/java/org/apache/seata/rm/datasource/ConnectionProxy.java:247`
- `ConnectionProxy#register` — `rm-datasource/src/main/java/org/apache/seata/rm/datasource/ConnectionProxy.java:267`
- `AbstractDMLBaseExecutor#doExecute` — `rm-datasource/src/main/java/org/apache/seata/rm/datasource/exec/AbstractDMLBaseExecutor.java:81`
- `AbstractDMLBaseExecutor#executeAutoCommitFalse` — `rm-datasource/src/main/java/org/apache/seata/rm/datasource/exec/AbstractDMLBaseExecutor.java:97`
- `AbstractDMLBaseExecutor#executeAutoCommitTrue` — `rm-datasource/src/main/java/org/apache/seata/rm/datasource/exec/AbstractDMLBaseExecutor.java:146`
- `UndoLogManager#flushUndoLogs` — `rm-datasource/src/main/java/org/apache/seata/rm/datasource/undo/UndoLogManager.java:39`
- `AbstractUndoExecutor#executeOn` — `rm-datasource/src/main/java/org/apache/seata/rm/datasource/undo/AbstractUndoExecutor.java:114`
- `AbstractUndoExecutor#dataValidationAndGoOn` — `rm-datasource/src/main/java/org/apache/seata/rm/datasource/undo/AbstractUndoExecutor.java:234`

## 边界与踩坑

- 不是所有 SQL 都适合 AT；复杂存储过程、非标准数据库类型和无主键表会削弱镜像与逆向能力。
- undo log 表必须和业务表位于同一资源事务边界，否则一阶段可能只提交一半。
- dirty record 不是普通网络重试错误，盲目重试可能扩大数据损坏。

## 可迁移知识

数据库代理型事务的关键不是“拦截 SQL”，而是建立三件套：本地原子凭证、可重放的逆操作、并发修改校验。缺一项，自动补偿都可能变成覆盖写。

> **面试锚点**：AT 为什么需要 before/after image？undo log 为什么写本地库？如何避免回滚覆盖外部更新？

## Related

- [事务生命周期](/notes/source/java/rpc/seata/transaction-lifecycle/)
- [TCC、Saga 与 XA](/notes/source/java/rpc/seata/tcc-saga-xa/)
- [AT 模式概念笔记](/notes/backend/seata/at-mode/)
