---
title: 整体架构
description: Arthas 从 Attach 到命令输出的完整源码链路。
category: Backend
tags: [Source Reading, Arthas, Architecture]
order: 11
updatedDate: 2026-08-16
difficulty: advanced
status: stable
lastReviewed: 2026-08-16
draft: false
sidebar: { order: 11 }
---

Arthas 将“进入目标 JVM”和“诊断目标类”分成两个阶段：前者只负责注入和启动服务，后者由命令按需创建增强器。

```text
arthas-boot / Attach
  -> ArthasAgent.agentmain
  -> AgentBootstrap
  -> ArthasBootstrap
  -> ShellServerImpl
  -> CommandResolver -> CommandProcess
  -> Enhancer -> Instrumentation.retransformClasses
```

```text
Telnet/HTTP/MCP client -> session -> command
                       -> ResultModel -> ResultView
                       -> terminal stream
```

## 核心坐标

- `ArthasAgent#init` — `arthas-agent-attach/src/main/java/com/taobao/arthas/agent/attach/ArthasAgent.java:74`
- `ArthasAgent#loadAgent` — `arthas-agent-attach/src/main/java/com/taobao/arthas/agent/attach/ArthasAgent.java:109`
- `AgentBootstrap#premain` — `agent/src/main/java/com/taobao/arthas/agent334/AgentBootstrap.java:63`
- `AgentBootstrap#agentmain` — `agent/src/main/java/com/taobao/arthas/agent334/AgentBootstrap.java:67`
- `AgentBootstrap#bind` — `agent/src/main/java/com/taobao/arthas/agent334/AgentBootstrap.java:176`
- `ArthasBootstrap#getInstance` — `core/src/main/java/com/taobao/arthas/core/server/ArthasBootstrap.java:170`
- `ShellServerImpl#listen` — `core/src/main/java/com/taobao/arthas/core/shell/impl/ShellServerImpl.java:90`
- `CommandResolver#commands` — `core/src/main/java/com/taobao/arthas/core/shell/command/CommandResolver.java:25`
- `Enhancer#enhance` — `core/src/main/java/com/taobao/arthas/core/advisor/Enhancer.java:400`
- `InstrumentationUtils#retransformClasses` — `core/src/main/java/com/taobao/arthas/core/util/InstrumentationUtils.java:19`

## 为什么这么设计

**替代方案**：每个命令独立开启端口和类转换器。**为什么不行**：端口、类加载器和 transformer 生命周期会失控。**选择**：核心只启动一次，命令通过共享 Shell 和增强器注册表协作。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| 目标 JVM 不可 Attach | 启动失败 | 权限或 JVM 版本限制 | 使用同用户并检查 attach 权限 |
| 命令退出未回滚 | 后续调用仍有额外开销 | transformer 未移除 | 使用 affect 记录和 reset |
| 输出阻塞 | 命令线程堆积 | 慢终端背压 | 限制结果量和超时 |

## 可迁移知识

在线诊断系统应把控制面、数据面和观测输出解耦；一次注入，多命令复用，是动态运维工具的基本生命周期设计。

> **面试锚点**
> - Arthas 如何进入已经运行的 JVM？
> - 为什么需要独立的 spy 包？
> - 命令与字节码增强如何解耦？

## Related

- [Instrumentation 与 Agent 挂载](/notes/source/java/tools/arthas/agent/)
- [字节码增强与回滚](/notes/source/java/tools/arthas/enhancer/)
