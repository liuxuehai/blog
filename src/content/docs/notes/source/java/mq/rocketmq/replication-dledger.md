---
title: 主从复制与 DLedger
description: RocketMQ 的传统 HA 复制、DLedger 日志追加与角色切换。
category: Backend
tags: [Source Reading, RocketMQ, Replication, DLedger]
order: 16
updatedDate: 2026-08-16
difficulty: advanced
status: stable
lastReviewed: 2026-08-16
draft: false
sidebar:
  order: 16
---

RocketMQ 同时保留传统主从复制和 DLedger 路径：前者以主节点推进物理 offset、从节点追赶为核心，后者把写入放入带角色和提交语义的复制日志。

<!-- more -->

## 两条复制路径

```text
传统 HA: Master CommitLog --stream--> Slave CommitLog
              └─ notifyTransferSome -> flush wait

DLedger: client -> DLedgerCommitLog -> append entry
                                      -> replicate -> committed
```

## 传统 HA

`DefaultHAService#notifyTransferSome`（`store/src/main/java/org/apache/rocketmq/store/ha/DefaultHAService.java:107`）通知等待某个物理 offset 已传输或刷盘完成的线程。主节点写入后，从节点通过 HA 连接读取并追加到自己的 CommitLog；同步复制时，生产者结果会受从节点追赶进度影响。

## DLedger 写入

`DLedgerCommitLog`（`store/src/main/java/org/apache/rocketmq/store/dledger/DLedgerCommitLog.java:62`）重写 `asyncPutMessage`（`:539`），把消息包装为 DLedger entry，再调用 `dLedgerServer.handleAppend`（`:582`）。只有复制日志返回成功并满足提交语义，外层才完成 `PutMessageResult`。

## 角色切换

`DLedgerRoleChangeHandler#handle`（`broker/src/main/java/org/apache/rocketmq/broker/dledger/DLedgerRoleChangeHandler.java:57`）接收角色变化，在 `:64-99` 根据 Leader 或 Follower 调整 BrokerRole；`changeToMaster`（`:156`）完成切换前后的同步和状态更新。角色切换还必须处理服务启动、读写权限和落后数据。

传统 HA 的从节点路径在 `DefaultHAService.java:228` 判断角色；DLedger 批量写入口位于 `DLedgerCommitLog.java:642`，说明单条和批量消息都要经过复制日志。

传统 HA 启动时的从节点分支在 `DefaultHAService.java:72`，复制等待服务的通知入口在 `DefaultHAService.java:111`；DLedger 批量追加完成处理位于 `DLedgerCommitLog.java:703`。

## 为什么需要 DLedger

**替代方案**：只依赖主从异步复制，故障后人工指定新主。
**为什么不行**：自动选主、任期和提交点缺少统一来源时，可能出现双主或旧主继续写；人工切换又放大恢复时间。
**证据**：`DLedgerCommitLog#asyncPutMessage`（`:539`）把 append 交给 DLedger，`DLedgerRoleChangeHandler#handle`（`:57`）把角色变化反馈给 Broker 生命周期。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| 从节点落后 | 同步写延迟升高 | 提交点等待副本 | 监控复制 lag |
| 网络分区 | 写入拒绝或角色变化 | 无法确认主身份 | 使用明确的 fencing |
| 旧主恢复 | 可能重复服务 | 未完成角色降级 | 先隔离旧主 |
| 外层返回失败 | 客户端重试 | 返回链路中断 | 业务键幂等，恢复时核对 offset |

## 可迁移知识

复制系统要区分“写入本地”“复制到副本”和“对外提交”三个时刻；角色切换必须是状态机，而不是散落的 if 判断。

> **面试锚点**
> - 同步复制的成功条件和本地写成功有什么不同？
> - DLedger 为什么要接管 CommitLog 的 append？
> - 角色切换时除了 BrokerRole 还要处理什么？

## Related

- [CommitLog 顺序写与 mmap](/notes/source/java/mq/rocketmq/commitlog/)
- [整体架构](/notes/source/java/mq/rocketmq/architecture/)
- [消费进度与重平衡](/notes/source/java/mq/rocketmq/consumer-rebalance/)
