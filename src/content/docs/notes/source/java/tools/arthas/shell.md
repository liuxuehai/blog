---
title: 命令管道与终端协议
description: ShellServer、CommandProcess、Telnet 输出和扩展命令 SPI。
category: Backend
tags: [Source Reading, Arthas, Shell]
order: 15
updatedDate: 2026-08-16
difficulty: advanced
status: stable
lastReviewed: 2026-08-16
draft: false
sidebar: { order: 15 }
---

Arthas 的命令层采用流式 `CommandProcess`，命令只关心输入参数和结果写出，底层可以接 Telnet、HTTP 或其他协议适配器。

```text
ShellServer -> ShellSession -> command line
            -> CommandResolver -> CommandProcess
            -> ResultModel / output stream
```

关键坐标：

- `ShellServerImpl#listen` — `core/src/main/java/com/taobao/arthas/core/shell/impl/ShellServerImpl.java:90`
- `ShellServerImpl#newSession` — `core/src/main/java/com/taobao/arthas/core/shell/impl/ShellServerImpl.java:133`
- `ProcessImpl#execute` — `core/src/main/java/com/taobao/arthas/core/shell/system/impl/ProcessImpl.java:287`
- `ProcessImpl$CommandProcessTask#run` — `core/src/main/java/com/taobao/arthas/core/shell/system/impl/ProcessImpl.java:374`
- `Command#create` — `core/src/main/java/com/taobao/arthas/core/shell/command/Command.java:35`
- `CommandResolver#commands` — `core/src/main/java/com/taobao/arthas/core/shell/command/CommandResolver.java:25`
- `TelnetConsole#process` — `client/src/main/java/com/taobao/arthas/client/TelnetConsole.java:80`
- `CommandProcess#write` — `core/src/main/java/com/taobao/arthas/core/shell/command/CommandProcess.java:39`

## 为什么采用 SPI 命令发现

**替代方案**：在核心类中维护命令列表。**为什么不行**：扩展命令必须修改核心并重新发布。**选择**：`CommandResolver` 通过 `META-INF/services` 发现外部命令。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| 终端断开 | 命令仍运行 | 输出通道与任务解耦 | 监听 session close 并取消任务 |
| 多协议渲染 | 格式错乱 | 直接输出 ANSI 文本 | 使用模型和协议适配 |
| 外部命令冲突 | 命令覆盖 | 名称未隔离 | 做命名约束和权限控制 |

## 可迁移知识

交互式工具适合“命令执行器 + 会话 + 渲染器”三层结构；协议适配应位于边界，不能渗入业务命令。

> **面试锚点**
> - CommandProcess 解决了什么问题？
> - Arthas 如何支持外部命令？
> - 为什么输出不能全部写死成 Telnet 文本？

## Related

- [整体架构](/notes/source/java/tools/arthas/architecture/)
- [watch 与 trace 命令](/notes/source/java/tools/arthas/commands/)
