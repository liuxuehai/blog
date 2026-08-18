---
title: SkyWalking
description: SkyWalking 源码解析：Agent 无侵入插桩、上下文传播、TraceSegment 与 OAP 模块化分析。
category: Backend
tags: [Source Reading, SkyWalking, APM, Java]
order: 2
updatedDate: 2026-08-16
difficulty: advanced
status: stable
lastReviewed: 2026-08-16
draft: false
sidebar: { order: 2 }
---

SkyWalking 由进程内 Agent、OAP 分析平台和多种接收协议组成；源码阅读要同时关注“调用点如何被插桩”和“遥测数据如何被接收、分发、聚合、存储”。

<!-- more -->

## 版本快照

| 项 | 值 |
| --- | --- |
| 仓库 | `apache/skywalking` |
| 本地路径 | `E:\source\java\tools\skywalking` |
| 分支 | `master` |
| Commit | `102af09b4`（2026-08-11） |
| 最近 tag | `v8.3.0.2` |

## 模块地图

| 层 | 职责 | 关键抽象 |
| --- | --- | --- |
| Agent | 插件匹配、字节码增强、上下文 | `ClassEnhancePluginDefine`、`ContextManager` |
| Protocol | gRPC/HTTP 数据模型 | `TraceSegment`、protobuf |
| OAP receiver | 接收 Agent、Meter、Log 等数据 | `SourceReceiver` |
| OAP analyzer | 分发与聚合 | `DispatcherManager`、`TraceAnalyzer` |
| Storage | 指标、拓扑、Trace 持久化 | DAO/Storage SPI |

## 本册目录

- [整体架构](/notes/source/java/tools/skywalking/architecture/)
- [Agent 插件与无侵入插桩](/notes/source/java/tools/skywalking/agent-plugin/)
- [上下文传播与 TraceSegment](/notes/source/java/tools/skywalking/context-trace/)
- [OAP 模块与数据接收](/notes/source/java/tools/skywalking/oap-receiver/)
- [分析、聚合与存储](/notes/source/java/tools/skywalking/analysis-storage/)
- [面试专题](/notes/source/java/tools/skywalking/interview/)

## 读码入口

1. 从 Agent 插件定义进入匹配和增强。
2. 顺着 `ContextManager`、`AbstractSpan`、`TraceSegment` 看一次调用如何形成追踪数据。
3. 从 OAP `ModuleManager` 进入模块启动。
4. 从 `SourceReceiverImpl`、`TraceSegmentReportServiceHandler` 追踪数据进入分析器。

## Related

- [诊断工具](/notes/source/java/tools/)
- [Arthas 源码解析](/notes/source/java/tools/arthas/)
