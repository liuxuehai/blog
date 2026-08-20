---
title: Arthas
description: Arthas 源码解析：Attach、Instrumentation、字节码增强、命令模型与终端会话。
category: Backend
tags: [Source Reading, Arthas, JVM, Java]
order: 1
updatedDate: 2026-08-20
difficulty: advanced
status: stable
lastReviewed: 2026-08-20
draft: false
sidebar: { order: 1 }
---

Arthas 把 JVM Attach、字节码重转换、命令执行和终端协议组合成一套在线诊断系统；读码重点是“命令如何变成 transformer，再如何把结果流回终端”。

<!-- more -->

## 本册问题地图

Arthas 的源码主线是“附着目标 JVM → 解析命令 → 动态增强 → 收集和渲染结果”：

1. **Agent 如何进入目标进程？** 通过 Attach 机制加载诊断代码，再建立命令通道；目标 JVM 的权限、模块和运行状态决定附着是否成功。
2. **命令模型为什么和渲染层分离？** 命令负责查询和控制，渲染负责把结果变成人可读输出，同一诊断能力才能复用于不同终端。
3. **retransform 改变了什么？** 它不是读取现成信息，而是修改运行中类的字节码，让后续调用经过新的观测逻辑。
4. **为什么必须限制增强范围？** 热方法、递归调用和高频请求会把诊断开销放大；类、方法、条件和次数都应可控。
5. **诊断工具如何避免制造事故？** 超时、采样、最大输出和及时恢复原字节码，都是把观测成本限制在可接受范围内。

## 版本快照

| 项 | 值 |
| --- | --- |
| 仓库 | `alibaba/arthas` |
| 本地路径 | `E:\source\java\tools\arthas` |
| 分支 | `master` |
| Commit | `a5ecd7a8`（2026-08-14） |
| 最近 tag | `arthas-all-4.3.4` |

## 模块地图

| 模块 | 职责 | 入口 |
| --- | --- | --- |
| `agent` | premain/agentmain 启动 | `AgentBootstrap` |
| `core` | 命令、增强器、Shell | `ArthasBootstrap`、`Enhancer` |
| `client` | Telnet/HTTP 客户端 | `TelnetConsole` |
| `spy` | 引导类可见的轻量 API | `SpyAPI` |
| `arthas-agent-attach` | 外部 Attach | `ArthasAgent` |

## 本册目录

- [整体架构](/notes/source/java/tools/arthas/architecture/)
- [Instrumentation 与 Agent 挂载](/notes/source/java/tools/arthas/agent/)
- [字节码增强与回滚](/notes/source/java/tools/arthas/enhancer/)
- [watch 与 trace 命令](/notes/source/java/tools/arthas/commands/)
- [命令管道与终端协议](/notes/source/java/tools/arthas/shell/)
- [面试专题](/notes/source/java/tools/arthas/interview/)

## 读码入口

1. `ArthasAgent#init` 获取 `Instrumentation`。
2. `AgentBootstrap#agentmain` 将控制权交给核心包。
3. `ArthasBootstrap#getInstance` 启动 Shell 和命令解析。
4. `Enhancer#enhance` 注册 transformer 并触发重转换。

## Related

- [诊断工具](/notes/source/java/tools/)
- [SkyWalking 源码解析](/notes/source/java/tools/skywalking/)
