---
title: Instrumentation 与 Agent 挂载
description: Arthas premain、agentmain、Attach 和类加载器隔离。
category: Backend
tags: [Source Reading, Arthas, Instrumentation]
order: 12
updatedDate: 2026-08-24
difficulty: advanced
status: stable
lastReviewed: 2026-08-24
draft: false
sidebar: { order: 12 }
---

<!-- more -->

## 先给答案：主要失效边界集中在“权限不足、多次启动、JDK 模块限制”这些场景

主要失效边界集中在“权限不足、多次启动、JDK 模块限制”这些场景。它们破坏的是容量、顺序、并发或生命周期前提；排查时应先确认状态是否仍由正确对象持有，再核对推进条件和清理路径。 理解Instrumentation 与 Agent 挂载时，要先确认入口与状态归属，再跟踪控制流或数据流的推进顺序，最后落到对外可观察的结果。

主要失效边界集中在“权限不足、多次启动、JDK 模块限制”这些场景。它们破坏的是容量、顺序、并发或生命周期前提；排查时应先确认状态是否仍由正确对象持有，再核对推进条件和清理路径。

主要失效边界集中在“权限不足、多次启动、JDK 模块限制”这些场景。它们破坏的是容量、顺序、并发或生命周期前提；排查时应先确认状态是否仍由正确对象持有，再核对推进条件和清理路径。

Arthas 同时支持启动期 `premain` 和运行期 `agentmain`；运行期诊断依赖 Attach API 将 agent 注入目标 JVM，再由 `Instrumentation` 改写已加载类。

```text
ArthasAgent -> VirtualMachine.attach(pid)
            -> loadAgent(agent.jar, args)
            -> AgentBootstrap.agentmain
            -> Instrumentation
```

关键坐标：

- `ArthasAgent#init` — `arthas-agent-attach/src/main/java/com/taobao/arthas/agent/attach/ArthasAgent.java:74`
- `ArthasAgent#loadAgent` — `arthas-agent-attach/src/main/java/com/taobao/arthas/agent/attach/ArthasAgent.java:109`
- `ArthasAgent#install` — `arthas-agent-attach/src/main/java/com/taobao/arthas/agent/attach/ArthasAgent.java:90`
- `AgentBootstrap#premain` — `agent/src/main/java/com/taobao/arthas/agent334/AgentBootstrap.java:63`
- `AgentBootstrap#agentmain` — `agent/src/main/java/com/taobao/arthas/agent334/AgentBootstrap.java:67`
- `AgentBootstrap#main` — `agent/src/main/java/com/taobao/arthas/agent334/AgentBootstrap.java:90`
- `AgentBootstrap#getClassLoader` — `agent/src/main/java/com/taobao/arthas/agent334/AgentBootstrap.java:78`
- `AgentBootstrap#bind` — `agent/src/main/java/com/taobao/arthas/agent334/AgentBootstrap.java:176`
- `ArthasBootstrap#getInstance` — `core/src/main/java/com/taobao/arthas/core/server/ArthasBootstrap.java:170`

## 为什么不把所有类放进 Bootstrap ClassLoader

**替代方案**：把完整 Arthas 放进引导类路径。**为什么不行**：依赖冲突会污染目标应用，升级和卸载也困难。**选择**：`spy` 保持极小，只暴露跨类加载器所需的桥接 API，其余代码由独立 loader 加载。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| 权限不足 | Attach 被拒绝 | 目标 JVM 用户不同 | 使用同一用户或授权机制 |
| 多次启动 | 端口冲突/重复增强 | agent 已存在 | 检查单例 bootstrap |
| JDK 模块限制 | Attach API 不可见 | 运行环境缺模块 | 使用匹配的 JDK 发行版 |

## 可迁移知识

动态插件系统可采用“最小桥接包 + 隔离扩展加载器”结构，把宿主兼容面压缩到几乎不可变的接口。

> **面试锚点**
> - `premain` 和 `agentmain` 的区别是什么？
> - 为什么 Arthas 要隔离 classloader？
> - 运行期增强的前置条件是什么？

## Related

- [整体架构](/notes/source/java/tools/arthas/architecture/)
- [字节码增强与回滚](/notes/source/java/tools/arthas/enhancer/)
