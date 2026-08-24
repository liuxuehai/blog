---
title: 面试专题
description: Arthas 高频面试题与源码级回答。
category: Backend
tags: [Source Reading, Arthas, Interview]
order: 19
updatedDate: 2026-08-24
difficulty: advanced
status: stable
lastReviewed: 2026-08-24
draft: false
sidebar: { order: 19 }
---

<!-- more -->

## 先给答案：Arthas 高频面试题与源码级回答

Arthas 高频面试题与源码级回答。 正文沿“高频题 -> 场景题”展开：先确认入口和状态归属，再跟踪控制流或数据流的推进，最后落到对外可观察的结果。

主要失效边界集中在“线上执行 trace 导致延迟升高怎么办”这些场景。它们破坏的是容量、顺序、并发或生命周期前提；排查时应先确认状态是否仍由正确对象持有，再核对推进条件和清理路径。

## 高频题

### Arthas 如何注入目标 JVM？

**30 秒版**：通过 Attach API 连接目标进程，加载 agent jar，触发 `agentmain`，再把 `Instrumentation` 交给核心。

**展开**：入口是 `ArthasAgent#init`，目标端由 `AgentBootstrap#agentmain` 启动 `ArthasBootstrap`。

**加分项**：启动期也支持 `premain`，但在线诊断主要使用 `agentmain`。

**常见错答**：认为 Arthas 是通过业务代码主动集成的 SDK。

### watch 为什么会影响线上性能？

**30 秒版**：方法进入/退出都会执行增强逻辑，条件判断、对象展开和输出都可能增加 CPU、分配和停顿。

**展开**：`Enhancer` 触发重转换，`WatchCommand` 再执行条件和表达式。

**加分项**：用次数、条件和匹配范围限制采集成本。

**常见错答**：认为只增加日志，不改字节码。

### Arthas 如何回滚增强？

**30 秒版**：维护增强影响记录，移除对应 listener/transformer 后重新转换类，恢复原始方法体。

**展开**：核心路径是 `Enhancer#reset` 和 `InstrumentationUtils#retransformClasses`。

**加分项**：动态增强系统必须把回滚作为一等操作。

**常见错答**：停止命令线程就等于类已经恢复。

### 为什么有 spy 包？

**30 秒版**：目标应用存在多个 classloader，核心类不一定对所有增强代码可见；spy 作为最小公共桥接层，降低可见性问题。

**展开**：agent 负责注入，核心使用隔离 loader，spy 保留极少的跨边界 API。

**加分项**：这是插件隔离和类加载兼容性的典型解法。

**常见错答**：spy 是完整 Arthas 核心。

### 为什么命令输出使用模型而不是字符串？

**30 秒版**：同一结果需要适配 Telnet、HTTP、WebSocket 等协议，模型和视图分离可以复用命令逻辑。

**展开**：命令生成 `ResultModel`，`ResultView` 负责协议相关渲染。

**加分项**：这也方便 MCP 等新入口接入。

**常见错答**：把 ANSI 文本当作通用协议。

## 场景题

### 线上执行 trace 导致延迟升高怎么办？

先缩小类/方法匹配，再限制调用次数和深度，检查增强影响类列表，必要时立即 `reset`；同时对照 JVM 停顿和业务 P99 判断是重转换暂停还是每次调用开销。

## Related

- [Instrumentation 与 Agent 挂载](/notes/source/java/tools/arthas/agent/)
- [字节码增强与回滚](/notes/source/java/tools/arthas/enhancer/)
