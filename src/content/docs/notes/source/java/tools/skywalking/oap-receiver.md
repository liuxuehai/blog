---
title: OAP 模块与数据接收
description: ModuleManager、SourceReceiver、gRPC/HTTP handler 和接收队列。
category: Backend
tags: [Source Reading, SkyWalking, OAP, Receiver]
order: 24
updatedDate: 2026-08-24
difficulty: advanced
status: stable
lastReviewed: 2026-08-24
draft: false
sidebar: { order: 24 }
---

<!-- more -->

## 先给答案：主要失效边界集中在“receiver 直接做重分析、provider 依赖未声明、协议字段缺失”这些场景

主要失效边界集中在“receiver 直接做重分析、provider 依赖未声明、协议字段缺失”这些场景。它们破坏的是容量、顺序、并发或生命周期前提；排查时应先确认状态是否仍由正确对象持有，再核对推进条件和清理路径。 理解OAP 模块与数据接收时，要先确认入口与状态归属，再跟踪控制流或数据流的推进顺序，最后落到对外可观察的结果。

主要失效边界集中在“receiver 直接做重分析、provider 依赖未声明、协议字段缺失”这些场景。它们破坏的是容量、顺序、并发或生命周期前提；排查时应先确认状态是否仍由正确对象持有，再核对推进条件和清理路径。

主要失效边界集中在“receiver 直接做重分析、provider 依赖未声明、协议字段缺失”这些场景。它们破坏的是容量、顺序、并发或生命周期前提；排查时应先确认状态是否仍由正确对象持有，再核对推进条件和清理路径。

OAP 用模块定义和 provider 组装运行时能力；接收器只负责把外部协议转换成内部 source，不直接承担完整分析。

```text
gRPC/HTTP handler -> protobuf parse -> SourceReceiver
                   -> queue/dispatcher -> analyzer module
```

关键坐标：

- `ModuleManager#start` — `oap-server/server-library/library-module/src/main/java/org/apache/skywalking/oap/server/library/module/ModuleManager.java:78`
- `ModuleManager#startup` — `oap-server/server-library/library-module/src/main/java/org/apache/skywalking/oap/server/library/module/ModuleManager.java:111`
- `ModuleDefine#provider` — `oap-server/server-library/library-module/src/main/java/org/apache/skywalking/oap/server/library/module/ModuleDefine.java:42`
- `SourceReceiverImpl#receive` — `oap-server/server-core/src/main/java/org/apache/skywalking/oap/server/core/source/SourceReceiverImpl.java:42`
- `TraceSegmentReportServiceHandler#collect` — `oap-server/server-receiver-plugin/skywalking-trace-receiver-plugin/src/main/java/org/apache/skywalking/oap/server/receiver/trace/provider/handler/v8/grpc/TraceSegmentReportServiceHandler.java:49`
- `TraceSegmentReportServiceHandlerCompat#collect` — `oap-server/server-receiver-plugin/skywalking-trace-receiver-plugin/src/main/java/org/apache/skywalking/oap/server/receiver/trace/provider/handler/v8/grpc/TraceSegmentReportServiceHandlerCompat.java:44`
- `TraceSegmentReportHandler#handle` — `oap-server/server-receiver-plugin/skywalking-trace-receiver-plugin/src/main/java/org/apache/skywalking/oap/server/receiver/trace/provider/handler/v8/rest/TraceSegmentReportHandler.java:44`
- `CoreModule#services` — `oap-server/server-core/src/main/java/org/apache/skywalking/oap/server/core/CoreModule.java:191`

## 为什么用 Module/Provider

**替代方案**：在 OAP 主类中硬编码所有 receiver。**为什么不行**：新增协议需要修改启动器，测试和部署组合也困难。**选择**：`ModuleDefine` 声明服务，`ModuleProvider` 完成实现和配置绑定。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| receiver 直接做重分析 | 接收超时 | 网络线程承担太多工作 | 接收与分析异步解耦 |
| provider 依赖未声明 | 启动失败 | 模块顺序/服务不可用 | 正确声明 requiredModules |
| 协议字段缺失 | 数据被丢弃 | 版本兼容不完整 | 保持向后兼容和契约测试 |

## 可迁移知识

模块系统的关键是“声明依赖、注册服务、生命周期管理”；协议适配层只做格式转换，把业务语义交给稳定的内部接口。

> **面试锚点**
> - OAP 的 Module、Provider、Service 分别是什么？
> - 接收器为什么不直接写存储？
> - 如何扩展一种新的接收协议？

## Related

- [整体架构](/notes/source/java/tools/skywalking/architecture/)
- [分析、聚合与存储](/notes/source/java/tools/skywalking/analysis-storage/)
