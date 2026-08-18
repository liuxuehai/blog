---
title: watch 与 trace 命令
description: Arthas 观测命令从参数解析到 AdviceListener 的源码链路。
category: Backend
tags: [Source Reading, Arthas, Diagnostics]
order: 14
updatedDate: 2026-08-16
difficulty: advanced
status: stable
lastReviewed: 2026-08-16
draft: false
sidebar: { order: 14 }
---

`watch` 关注方法入参、返回值和异常，`trace` 关注调用树和耗时；两者共享增强入口，差异主要在 AdviceListener 和结果模型。

```text
WatchCommand/TraceCommand
  -> EnhancerCommand
  -> matcher + listener
  -> Enhancer
  -> AdviceAdapter enter/exit
  -> ResultModel -> ResultView
```

关键坐标：

- `EnhancerCommand#process` — `core/src/main/java/com/taobao/arthas/core/command/monitor200/EnhancerCommand.java:78`
- `EnhancerCommand#enhance` — `core/src/main/java/com/taobao/arthas/core/command/monitor200/EnhancerCommand.java:118`
- `WatchCommand#process` — `core/src/main/java/com/taobao/arthas/core/command/monitor200/WatchCommand.java:75`
- `WatchCommand#isConditionMet` — `core/src/main/java/com/taobao/arthas/core/command/monitor200/WatchCommand.java:147`
- `TraceCommand#process` — `core/src/main/java/com/taobao/arthas/core/command/monitor200/TraceCommand.java:65`
- `TraceCommand#destroy` — `core/src/main/java/com/taobao/arthas/core/command/monitor200/TraceCommand.java:130`
- `AdviceListenerAdapter#before` — `core/src/main/java/com/taobao/arthas/core/advisor/AdviceListenerAdapter.java:32`
- `AdviceListenerAdapter#afterReturning` — `core/src/main/java/com/taobao/arthas/core/advisor/AdviceListenerAdapter.java:45`
- `AdviceListenerAdapter#afterThrowing` — `core/src/main/java/com/taobao/arthas/core/advisor/AdviceListenerAdapter.java:57`

## 为什么命令不直接打印字符串

**替代方案**：listener 拼接终端文本。**为什么不行**：Telnet、HTTP、WebSocket 和 MCP 需要不同表示。**选择**：命令产出 `ResultModel`，由 `ResultView` 决定渲染。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| 高频方法 watch | 应用吞吐下降 | 每次调用都创建观测对象 | 增加条件、次数上限 |
| OGNL 复杂表达式 | 命令耗时 | 表达式计算本身昂贵 | 限制深度和输出大小 |
| 异常路径 | 结果缺字段 | afterReturning 不会执行 | 同时处理 throwing |

## 可迁移知识

观测命令应把采集、过滤、模型和渲染分层；过滤越靠近采集点，线上额外成本越低。

> **面试锚点**
> - watch 与 trace 的增强逻辑是否独立？
> - 为什么采用 ResultModel？
> - 线上使用 watch 最需要限制什么？

## Related

- [字节码增强与回滚](/notes/source/java/tools/arthas/enhancer/)
- [命令管道与终端协议](/notes/source/java/tools/arthas/shell/)
