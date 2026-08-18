---
title: 上下文传播与 TraceSegment
description: ContextManager、Span 生命周期、TraceId 和跨线程传播。
category: Backend
tags: [Source Reading, SkyWalking, Trace, Context]
order: 23
updatedDate: 2026-08-16
difficulty: advanced
status: stable
lastReviewed: 2026-08-16
draft: false
sidebar: { order: 23 }
---

SkyWalking 的追踪模型以 `TraceContext` 保存当前 segment，以 `AbstractSpan` 表达入口、出口和本地 span；跨服务时把必要上下文编码进协议或请求头。

```text
ContextManager#createEntrySpan
  -> active segment/span
  -> createExitSpan -> inject carrier
  -> remote extract -> continue segment
  -> span.stop -> segment.finish -> report
```

关键坐标：

- `ContextManager#createEntrySpan` — `apm-sniffer/apm-agent-core/src/main/java/org/apache/skywalking/apm/agent/core/context/ContextManager.java:91`
- `ContextManager#createExitSpan` — `apm-sniffer/apm-agent-core/src/main/java/org/apache/skywalking/apm/agent/core/context/ContextManager.java:130`
- `ContextManager#stopSpan` — `apm-sniffer/apm-agent-core/src/main/java/org/apache/skywalking/apm/agent/core/context/ContextManager.java:187`
- `TraceContext#newTraceSegment` — `apm-sniffer/apm-agent-core/src/main/java/org/apache/skywalking/apm/agent/core/context/TraceContext.java:73`
- `TraceSegment#archive` — `apm-sniffer/apm-agent-core/src/main/java/org/apache/skywalking/apm/agent/core/context/trace/TraceSegment.java:109`
- `AbstractSpan#start` — `apm-sniffer/apm-agent-core/src/main/java/org/apache/skywalking/apm/agent/core/context/trace/AbstractSpan.java:98`
- `AbstractSpan#stop` — `apm-sniffer/apm-agent-core/src/main/java/org/apache/skywalking/apm/agent/core/context/trace/AbstractSpan.java:145`
- `AbstractSpan#inject` — `apm-sniffer/apm-agent-core/src/main/java/org/apache/skywalking/apm/agent/core/context/trace/AbstractSpan.java:261`
- `ContextManager#asyncFinish` — `apm-sniffer/apm-agent-core/src/main/java/org/apache/skywalking/apm/agent/core/context/ContextManager.java:229`

## 为什么以 segment 为上报单位

**替代方案**：每个 span 单独上报。**为什么不行**：网络请求数量和 OAP 写入压力都会放大，还难以保证同一调用链的局部顺序。**选择**：一个 segment 聚合本地 span，结束后批量上报。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| 异步线程未传播 | Trace 断链 | ThreadLocal 不自动跨线程 | 使用上下文 capture/continuation |
| span 未 stop | segment 不上报 | 生命周期未闭合 | finally 中结束 span |
| TraceId 暴露 | 日志泄露链路信息 | 传播头未保护 | 控制边界并按需脱敏 |

## 可迁移知识

上下文传播应明确“创建、激活、挂起、恢复、关闭”五个动作；异步模型必须提供 continuation，不能只依赖线程局部变量。

> **面试锚点**
> - TraceSegment 和 Span 的关系是什么？
> - 为什么 segment 结束后再上报？
> - 跨线程传播如何避免上下文丢失？

## Related

- [Agent 插件与无侵入插桩](/notes/source/java/tools/skywalking/agent-plugin/)
- [OAP 模块与数据接收](/notes/source/java/tools/skywalking/oap-receiver/)
