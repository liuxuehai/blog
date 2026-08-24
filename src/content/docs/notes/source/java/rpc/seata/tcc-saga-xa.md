---
title: TCC、Saga 与 XA
description: Seata 三种非 AT 资源模式的拦截、状态机、二阶段和适用边界。
category: Backend
tags: [Source Reading, Seata, TCC, Saga, XA]
order: 54
updatedDate: 2026-08-24
difficulty: advanced
status: stable
lastReviewed: 2026-08-24
draft: false
sidebar: { order: 54 }
---

<!-- more -->

## 先给答案：Seata 三种非 AT 资源模式的拦截、状态机、二阶段和适用边界

Seata 三种非 AT 资源模式的拦截、状态机、二阶段和适用边界。 正文沿“模式对照 -> TCC 拦截器 -> Saga 状态机”展开：先确认入口和状态归属，再跟踪控制流或数据流的推进，最后落到对外可观察的结果。

主要失效边界集中在“TCC 的 Confirm/Cancel 必须幂等，且要能处理空 Try、重复调用和网络超时。、Saga 补偿不是数据库回滚；中间状态可能对外可见，业务必须接受或隔离这种语义。、XA 的 prepare 持锁时间与连接占用是主要风险，失败恢复还受数据库驱动行为影响。”这些场景。它们破坏的是容量、顺序、并发或生命周期前提；排查时应先确认状态是否仍由正确对象持有，再核对推进条件和清理路径。

## 模式对照

```text
TCC:  Try -> Confirm
          \-> Cancel

Saga: state A -> state B -> state C
                    failure -> compensate(B) -> compensate(A)

XA:   start -> XA prepare -> TC decision -> XA commit/rollback
```

## TCC 拦截器

`TccActionInterceptorHandler` 在代理调用中识别 TCC action，收集事务上下文和参数，Try 成功后把 action context 注册到 RM；二阶段由 TC 发送 commit/rollback 请求，RM 再调用对应 Confirm/Cancel。它解决的是“业务动作可补偿”，而不是把任意方法自动变成可回滚操作。

## Saga 状态机

Saga 的 `DefaultSagaTransactionalTemplate` 提供 begin/commit/rollback/report/branchRegister 等事务模板；状态机引擎负责服务节点执行、重试和补偿，DB state log store 记录 machine/state 的开始、完成和报告。Saga 的一致性依赖补偿动作幂等与状态日志，而不是数据库锁。

## XA 资源适配

`ResourceManagerXA` 保存 XA 分支连接，二阶段根据全局决定调用 `xaCommit` 或 `xaRollback`，并处理 `XAER_NOTA` 与 retryable status。XA 一致性强，但 prepare 会持有数据库资源，长事务成本高，不能把它当作 AT 的无锁替代。

## 为什么这么设计

**替代方案一：** TCC 自动生成 Cancel。**问题：** 业务语义无法由框架从任意 Try 推导。**选择：** 通过显式注解/方法契约把补偿责任交给业务。

**替代方案二：** Saga 使用全局数据库锁。**问题：** 跨服务长流程会长时间占用资源，吞吐和可用性下降。**选择：** 用状态日志、重试和补偿换取最终一致性。

**替代方案三：** 所有场景统一 XA。**问题：** XA 资源、驱动和连接生命周期限制了跨服务范围。**选择：** 保留 AT/TCC/Saga 的轻量或业务补偿路径。

## 源码坐标索引

- `TccActionInterceptorHandler` — `tcc/src/main/java/org/apache/seata/rm/tcc/interceptor/TccActionInterceptorHandler.java:48`
- `TccActionInterceptorHandler` Try path — `tcc/src/main/java/org/apache/seata/rm/tcc/interceptor/TccActionInterceptorHandler.java:74`
- `SagaCore#branchCommitSend` — `server/src/main/java/org/apache/seata/server/transaction/saga/SagaCore.java:65`
- `SagaCore#branchRollbackSend` — `server/src/main/java/org/apache/seata/server/transaction/saga/SagaCore.java:85`
- `SagaCore#doGlobalCommit` — `server/src/main/java/org/apache/seata/server/transaction/saga/SagaCore.java:105`
- `SagaCore#doGlobalRollback` — `server/src/main/java/org/apache/seata/server/transaction/saga/SagaCore.java:170`
- `DefaultSagaTransactionalTemplate#commitTransaction` — `saga/seata-saga-spring/src/main/java/org/apache/seata/saga/engine/tm/DefaultSagaTransactionalTemplate.java:67`
- `DefaultSagaTransactionalTemplate#beginTransaction` — `saga/seata-saga-spring/src/main/java/org/apache/seata/saga/engine/tm/DefaultSagaTransactionalTemplate.java:88`
- `DefaultSagaTransactionalTemplate#branchRegister` — `saga/seata-saga-spring/src/main/java/org/apache/seata/saga/engine/tm/DefaultSagaTransactionalTemplate.java:118`
- `DbAndReportTcStateLogStore#recordStateMachineStarted` — `saga/seata-saga-spring/src/main/java/org/apache/seata/saga/engine/store/db/DbAndReportTcStateLogStore.java:92`
- `DbAndReportTcStateLogStore#recordStateFinished` — `saga/seata-saga-spring/src/main/java/org/apache/seata/saga/engine/store/db/DbAndReportTcStateLogStore.java:524`
- `ResourceManagerXA#branchCommit` — `rm-datasource/src/main/java/org/apache/seata/rm/datasource/xa/ResourceManagerXA.java:125`
- `ResourceManagerXA#branchRollback` — `rm-datasource/src/main/java/org/apache/seata/rm/datasource/xa/ResourceManagerXA.java:132`

## 边界与踩坑

- TCC 的 Confirm/Cancel 必须幂等，且要能处理空 Try、重复调用和网络超时。
- Saga 补偿不是数据库回滚；中间状态可能对外可见，业务必须接受或隔离这种语义。
- XA 的 `prepare` 持锁时间与连接占用是主要风险，失败恢复还受数据库驱动行为影响。

## 可迁移知识

一致性模式应按资源能力分层：能自动捕获本地变化时用代理型方案，能提供业务补偿时用动作型方案，资源本身支持标准协议时再使用 XA。统一协调协议不等于统一资源语义。

> **面试锚点**：TCC 与 Saga 的核心差异是什么？XA 为什么会阻塞资源？为什么 Confirm/Cancel 必须幂等？

## Related

- [AT 模式与 undo_log](/notes/source/java/rpc/seata/at-mode/)
- [失败恢复与状态机](/notes/source/java/rpc/seata/recovery/)
- [TCC 概念笔记](/notes/backend/seata/tcc-mode/)
- [Saga 概念笔记](/notes/backend/seata/saga-mode/)
- [XA 概念笔记](/notes/backend/seata/xa-mode/)
