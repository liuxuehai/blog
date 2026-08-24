---
title: 整体架构
description: SkyWalking Agent、协议、OAP 接收与分析存储的源码地图。
category: Backend
tags: [Source Reading, SkyWalking, Architecture]
order: 21
updatedDate: 2026-08-24
difficulty: advanced
status: stable
lastReviewed: 2026-08-24
draft: false
sidebar: { order: 21 }
---

<!-- more -->

## 先给答案：SkyWalking Agent、协议、OAP 接收与分析存储的源码地图

SkyWalking Agent、协议、OAP 接收与分析存储的源码地图。 正文沿“主流程 -> 核心坐标 -> 为什么 Agent 和 OAP 分离”展开：先确认入口和状态归属，再跟踪控制流或数据流的推进，最后落到对外可观察的结果。

主要失效边界集中在“Agent 与 OAP 版本不兼容、OAP 节点不均衡、分析器阻塞”这些场景。它们破坏的是容量、顺序、并发或生命周期前提；排查时应先确认状态是否仍由正确对象持有，再核对推进条件和清理路径。

## 主流程

Agent 在类加载或重转换阶段应用插件定义；方法进入时创建或加入 segment/span，退出时关闭 span 并上报。OAP 由 `ModuleManager#start` 启动各模块，接收器将 protobuf 转为领域对象，再交给分析器分发到多个 dispatcher，最终由 DAO 写入存储。

## 核心坐标

- `ModuleManager#start` — `oap-server/server-library/library-module/src/main/java/org/apache/skywalking/oap/server/library/module/ModuleManager.java:78`
- `ModuleManager#startup` — `oap-server/server-library/library-module/src/main/java/org/apache/skywalking/oap/server/library/module/ModuleManager.java:111`
- `SourceReceiverImpl#receive` — `oap-server/server-core/src/main/java/org/apache/skywalking/oap/server/core/source/SourceReceiverImpl.java:42`
- `TraceSegmentReportServiceHandler#collect` — `oap-server/server-receiver-plugin/skywalking-trace-receiver-plugin/src/main/java/org/apache/skywalking/oap/server/receiver/trace/provider/handler/v8/grpc/TraceSegmentReportServiceHandler.java:49`
- `TraceSegmentReportHandler#handle` — `oap-server/server-receiver-plugin/skywalking-trace-receiver-plugin/src/main/java/org/apache/skywalking/oap/server/receiver/trace/provider/handler/v8/rest/TraceSegmentReportHandler.java:44`
- `DispatcherManager#dispatch` — `oap-server/server-core/src/main/java/org/apache/skywalking/oap/server/core/analysis/DispatcherManager.java:77`
- `TraceAnalyzer#analyze` — `oap-server/analyzer/agent-analyzer/src/main/java/org/apache/skywalking/oap/server/analyzer/provider/trace/parser/TraceAnalyzer.java:64`
- `SegmentDispatcher#dispatch` — `oap-server/server-core/src/main/java/org/apache/skywalking/oap/server/core/analysis/manual/segment/SegmentDispatcher.java:35`
- `CoreModule#services` — `oap-server/server-core/src/main/java/org/apache/skywalking/oap/server/core/CoreModule.java:191`

## 为什么 Agent 和 OAP 分离

**替代方案**：在业务进程内完成聚合和查询。**为什么不行**：增加应用资源消耗，还会让每种语言重复实现存储。**选择**：Agent 只做低延迟采集和批量发送，OAP 统一做分析、持久化和查询。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| Agent 与 OAP 版本不兼容 | 上报失败 | 协议字段或语义变化 | 成套升级并验证 protocol |
| OAP 节点不均衡 | 查询/写入倾斜 | 长连接或路由固定 | 使用合理的接入和集群策略 |
| 分析器阻塞 | 接收队列积压 | 处理和接收耦合 | 异步队列、批量和限流 |

## 可迁移知识

遥测系统适合采用“边缘采集、中心聚合、协议解耦、模块化存储”的结构；采集端尽量无状态，中心端承担一致性和查询复杂度。

> **面试锚点**
> - SkyWalking Agent 和 OAP 分别负责什么？
> - OAP 如何通过模块化支持多种 receiver/storage？
> - Trace 数据从接收到落库经过哪些阶段？

## Related

- [Agent 插件与无侵入插桩](/notes/source/java/tools/skywalking/agent-plugin/)
- [OAP 模块与数据接收](/notes/source/java/tools/skywalking/oap-receiver/)
