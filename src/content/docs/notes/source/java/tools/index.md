---
title: 诊断工具
description: Arthas 与 SkyWalking 的源码解析索引：动态诊断、字节码插桩、分布式追踪与 OAP 分析。
category: Backend
tags: [Source Reading, Java, Diagnostics]
order: 6
updatedDate: 2026-08-16
difficulty: advanced
status: learning
lastReviewed: 2026-08-16
draft: false
sidebar: { order: 6 }
---

对应源码目录 `E:\source\java\tools\`，本组关注运行中的 Java 系统如何被观测、修改和分析。

<!-- more -->

## 分册

| 仓库 | 主题 | 状态 |
| --- | --- | --- |
| [arthas](/notes/source/java/tools/arthas/) | Attach、Instrumentation、动态增强、命令管道 | ✅ 7 篇 |
| [skywalking](/notes/source/java/tools/skywalking/) | Agent 插桩、上下文传播、OAP 接收与聚合 | ✅ 7 篇 |

## 阅读顺序

1. 先读 Arthas，理解 JVM Attach 与 `ClassFileTransformer`。
2. 再读 SkyWalking Agent，理解插件如何把业务调用变成 Span。
3. 最后进入 OAP，观察接收、分析、存储之间的模块化边界。

## Related

- [Java 源码解析索引](/notes/source/java/)
- [源码解析总览](/notes/source/)
