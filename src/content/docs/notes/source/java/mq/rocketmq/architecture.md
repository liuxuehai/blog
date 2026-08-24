---
title: 整体架构
description: RocketMQ 的 Store、Broker、Client 与 DLedger 分层，以及生产、消费和复制主流程。
category: Backend
tags: [Source Reading, RocketMQ, Architecture]
order: 11
updatedDate: 2026-08-24
difficulty: advanced
status: stable
lastReviewed: 2026-08-24
draft: false
sidebar:
  order: 11
---

RocketMQ 将物理写入、逻辑索引、协议处理和客户端调度拆成可独立演进的层。

<!-- more -->

## 先给答案：RocketMQ 先写唯一事实日志，再异步派生消费视图

生产请求先追加到 CommitLog，ConsumeQueue 和 IndexFile 由 Reput 后续构建；消费则先用逻辑索引定位物理 offset，再回到 CommitLog 读取消息。这把多 Topic 的随机写收敛为顺序追加，也让索引可以在故障后重建。

代价是“写入成功”和“消费可见”存在阶段差：CommitLog 已完成不代表 ConsumeQueue 已追平，复制成功也不等于客户端一定收到响应。排障必须分别观察物理写入、派生索引、复制提交和客户端重试，不能用单一 offset 推断全链路状态。

## 分层

```text
Producer / Consumer
        │ Remoting command
        ▼
Broker: PullMessageProcessor / EndTransactionProcessor
        │
        ▼
Store: DefaultMessageStore
  ├─ CommitLog -> MappedFileQueue -> mmap 文件
  ├─ ReputMessageService -> ConsumeQueue / IndexFile
  └─ HA / DLedger -> 副本日志
```

| 层 | 职责 | 关键源码坐标 |
| --- | --- | --- |
| Client | 生产、拉取、重平衡、位点管理 | `client/.../RebalanceImpl.java:232` |
| Broker | 校验请求、挂起拉取、事务状态机 | `broker/.../PullMessageProcessor.java:304` |
| Store | 追加写、索引、刷盘、恢复 | `store/.../DefaultMessageStore.java:645` |
| HA | 同步复制或 DLedger 日志 | `store/.../DefaultHAService.java:107` |

## 生产主流程

```text
Producer -> DefaultMessageStore#asyncPutMessage
         -> CommitLog#asyncPutMessage
         -> commit / flush
         -> ReputMessageService
              ├─ ConsumeQueue
              └─ IndexFile
```

`DefaultMessageStore#asyncPutMessage`（`DefaultMessageStore.java:645`）执行写前 Hook 并交给 `CommitLog`；同步 API `putMessage`（`:716`）只是等待异步结果。索引由 `ReputMessageService`（`:2655`）异步推进。

## 消费主流程

```text
Consumer -> PullMessageProcessor
              ├─有消息 -> ConsumeQueue -> CommitLog -> response
              └─无消息 -> PullRequestHoldService
                                      ▲
                 NotifyMessageArrivingListener ─┘
```

`DefaultMessageStore#getMessage`（`DefaultMessageStore.java:865`）先取物理偏移，再由 `CommitLog#getMessage`（`CommitLog.java:1439`）读取消息体。无消息时 `PullMessageProcessor#processRequest`（`PullMessageProcessor.java:304`）把请求交给长轮询。

## 为什么采用“日志 + 派生索引”

**替代方案**：每个 Topic/Queue 独立文件并在写入时同步更新。
**为什么不行**：多 Topic 并发写会放大随机 IO、刷盘协调和恢复成本。
**证据**：`DefaultMessageStore` 注册 `CommitLogDispatcherBuildConsumeQueue`（`:248`）和 `CommitLogDispatcherBuildIndex`（`:249`），索引明确位于物理日志之后。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| 物理日志已写、索引未追上 | 短时查不到消息 | Reput 异步派生 | 监控 dispatch lag |
| 角色切换 | 写入暂时失败 | 新主尚未完成状态切换 | 客户端重试 |
| 索引损坏 | 消费位点异常 | 派生文件不是事实源 | 从 CommitLog 重建 |

## 可迁移知识

“事实日志 + 可重建索引”适合搜索、事件溯源和 CDC：先保证事实追加顺序，再用消费者投影出不同查询模型。

> **面试锚点**
> - 为什么 RocketMQ 不直接按消费队列写文件？
> - Reput 延迟会造成什么可见性现象？
> - 消费请求如何从逻辑偏移回到物理消息？

## Related

- [CommitLog 顺序写与 mmap](/notes/source/java/mq/rocketmq/commitlog/)
- [ConsumeQueue 与 IndexFile](/notes/source/java/mq/rocketmq/index-files/)
- [消息拉取与长轮询](/notes/source/java/mq/rocketmq/pull-long-polling/)
