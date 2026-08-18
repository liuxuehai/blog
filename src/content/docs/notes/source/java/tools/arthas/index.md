---
title: Arthas
description: Arthas 源码解析：Attach、Instrumentation、字节码增强、命令模型与终端会话。
category: Backend
tags: [Source Reading, Arthas, JVM, Java]
order: 1
updatedDate: 2026-08-16
difficulty: advanced
status: stable
lastReviewed: 2026-08-16
draft: false
sidebar: { order: 1 }
---

Arthas 把 JVM Attach、字节码重转换、命令执行和终端协议组合成一套在线诊断系统；读码重点是“命令如何变成 transformer，再如何把结果流回终端”。

<!-- more -->

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
