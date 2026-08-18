---
title: 字节码增强与回滚
description: Enhancer、ClassFileTransformer、Advice 和 retransform 生命周期。
category: Backend
tags: [Source Reading, Arthas, Bytecode]
order: 13
updatedDate: 2026-08-16
difficulty: advanced
status: stable
lastReviewed: 2026-08-16
draft: false
sidebar: { order: 13 }
---

Arthas 的 `watch`、`trace`、`monitor` 不是各自实现类改写，而是共享 `Enhancer` 将匹配规则编译成 Advice，再触发目标类重转换。

```text
command matcher -> Enhancer -> ClassFileTransformer
                -> retransformClasses
                -> method enter/exit AdviceListener
                -> EnhancerAffect
```

关键坐标：

- `Enhancer#enhance` — `core/src/main/java/com/taobao/arthas/core/advisor/Enhancer.java:400`
- `Enhancer#transform` — `core/src/main/java/com/taobao/arthas/core/advisor/Enhancer.java:190`
- `Enhancer#reset` — `core/src/main/java/com/taobao/arthas/core/advisor/Enhancer.java:720`
- `Enhancer#retransform` — `core/src/main/java/com/taobao/arthas/core/advisor/Enhancer.java:678`
- `InstrumentationUtils#retransformClasses` — `core/src/main/java/com/taobao/arthas/core/util/InstrumentationUtils.java:19`
- `EnhancerCommand#process` — `core/src/main/java/com/taobao/arthas/core/command/monitor200/EnhancerCommand.java:78`
- `WatchCommand#process` — `core/src/main/java/com/taobao/arthas/core/command/monitor200/WatchCommand.java:75`
- `TraceCommand#process` — `core/src/main/java/com/taobao/arthas/core/command/monitor200/TraceCommand.java:65`
- `EnhancerAffect#toString` — `core/src/main/java/com/taobao/arthas/core/util/affect/EnhancerAffect.java:45`

## 为什么使用 retransform

**替代方案**：只拦截未来加载的类。**为什么不行**：线上最需要诊断的类通常已经加载。**选择**：注册可重转换 transformer，再调用 `Instrumentation#retransformClasses`，使已加载类也进入增强流程。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| 重转换暂停 | 请求延迟尖峰 | JVM 类重定义有停顿 | 缩小匹配范围，分批执行 |
| 类不支持修改 | 增强失败 | schema 变化受 JVM 限制 | 只改方法体，不改类结构 |
| 多命令叠加 | 输出重复 | 多个 Advice 同时生效 | 使用 `reset` 清理旧增强 |

## 可迁移知识

动态 AOP 的关键不是生成代理，而是保存“原始字节码到规则集合”的可逆映射；回滚必须是一等能力。

> **面试锚点**
> - 为什么已加载类也能被 watch？
> - retransform 会带来什么线上风险？
> - 如何保证多个诊断命令可以共存？

## Related

- [watch 与 trace 命令](/notes/source/java/tools/arthas/commands/)
- [命令管道与终端协议](/notes/source/java/tools/arthas/shell/)
