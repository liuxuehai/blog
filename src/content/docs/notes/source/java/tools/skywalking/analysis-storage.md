---
title: 分析、聚合与存储
description: Dispatcher、TraceAnalyzer、OAL 分析和 DAO 存储边界。
category: Backend
tags: [Source Reading, SkyWalking, Analysis, Storage]
order: 25
updatedDate: 2026-08-16
difficulty: advanced
status: stable
lastReviewed: 2026-08-16
draft: false
sidebar: { order: 25 }
---

OAP 接收一份 TraceSegment 后，不是只落一张 trace 表，而是通过 dispatcher 把它拆成服务、实例、端点、关系和指标等多种读模型。

```text
Segment -> TraceAnalyzer -> DispatcherManager
        -> service/instance/endpoint/relation dispatchers
        -> DAO -> storage implementation
```

关键坐标：

- `TraceAnalyzer#analyze` — `oap-server/analyzer/agent-analyzer/src/main/java/org/apache/skywalking/oap/server/analyzer/provider/trace/parser/TraceAnalyzer.java:64`
- `TraceAnalyzer#parse` — `oap-server/analyzer/agent-analyzer/src/main/java/org/apache/skywalking/oap/server/analyzer/provider/trace/parser/TraceAnalyzer.java:91`
- `DispatcherManager#dispatch` — `oap-server/server-core/src/main/java/org/apache/skywalking/oap/server/core/analysis/DispatcherManager.java:77`
- `DispatcherManager#init` — `oap-server/server-core/src/main/java/org/apache/skywalking/oap/server/core/analysis/DispatcherManager.java:51`
- `SegmentDispatcher#dispatch` — `oap-server/server-core/src/main/java/org/apache/skywalking/oap/server/core/analysis/manual/segment/SegmentDispatcher.java:35`
- `ServiceTrafficDispatcher#dispatch` — `oap-server/server-core/src/main/java/org/apache/skywalking/oap/server/core/analysis/manual/service/ServiceTrafficDispatcher.java:34`
- `ServiceCallRelationDispatcher#dispatch` — `oap-server/server-core/src/main/java/org/apache/skywalking/oap/server/core/analysis/manual/relation/service/ServiceCallRelationDispatcher.java:38`
- `SourceReceiverImpl#receive` — `oap-server/server-core/src/main/java/org/apache/skywalking/oap/server/core/source/SourceReceiverImpl.java:42`
- `ModuleManager#start` — `oap-server/server-library/library-module/src/main/java/org/apache/skywalking/oap/server/library/module/ModuleManager.java:78`

## 为什么拆成多个读模型

**替代方案**：只存原始 segment，查询时实时计算拓扑和指标。**为什么不行**：查询成本不可控，历史聚合会反复消耗 CPU。**选择**：写入时通过 dispatcher 生成面向查询的模型，以空间换查询延迟。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| 高基数标签 | 存储膨胀 | service/endpoint 维度过细 | 控制标签和采样 |
| 重复上报 | 指标偏大 | 重试没有幂等边界 | 使用 segment id/时间窗口去重 |
| analyzer 堵塞 | 数据延迟 | 聚合计算超出消费能力 | 批处理、分片和背压 |

## 可迁移知识

观测平台通常采用写时展开：一次原始事件生成多个查询投影；投影之间通过稳定 ID 和时间窗口保持可追踪性。

> **面试锚点**
> - 为什么一个 segment 要被分发成多个模型？
> - Dispatcher 和 Analyzer 的职责如何区分？
> - 高基数指标如何控制成本？

## Related

- [OAP 模块与数据接收](/notes/source/java/tools/skywalking/oap-receiver/)
- [上下文传播与 TraceSegment](/notes/source/java/tools/skywalking/context-trace/)
