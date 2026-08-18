---
title: Mapper 路由与 Pipeline/Valve
description: Tomcat 如何按 Host、Context、Wrapper 逐级路由，并通过 Valve 链执行请求。
category: Backend
tags: [Source Reading, Tomcat, Routing]
order: 35
updatedDate: 2026-08-15
difficulty: advanced
status: stable
lastReviewed: 2026-08-15
draft: false
sidebar: { order: 35 }
---

Mapper 负责请求落到哪个容器，Pipeline/Valve 负责请求经过哪些处理步骤。

<!-- more -->

```text
host + URI -> Mapper#map -> Engine/Host/Context/Wrapper
           -> EngineValve -> HostValve -> ContextValve -> WrapperValve
```

`Mapper#map` 位于 `java/org/apache/catalina/mapper/Mapper.java:688`，内部查找从 `:730` 开始；映射表通过 `insertMap`/`removeMap`（`:1480`、`:1495`）更新。`StandardEngineValve#invoke` 位于 `java/org/apache/catalina/core/StandardEngineValve.java:54`，`:71` 进入 Host；Host、Context、Wrapper Valve 分别从 `StandardHostValve.java:78`、`StandardContextValve.java:54`、`StandardWrapperValve.java:84` 开始。

## 为什么查找和执行分离

**替代方案**：每个 Valve 自己遍历子容器并匹配 URI。
**为什么不行**：路由算法和执行策略耦合后，通配路径、并发更新和自定义 Valve 会互相污染。Mapper 专门优化查找，Valve 专门实现认证、日志、访问控制和 Servlet 调用。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| Host 头异常 | 命中默认 Host | Host 映射失败 | 明确 defaultHost |
| Context 歧义 | 命中错误应用 | 路径匹配或版本选择错误 | 检查部署命名 |
| Valve 不调用 next | 请求链中断 | 自定义 Valve 提前返回 | 明确短路条件 |
| 动态更新路由 | 短时旧视图 | 映射表快照切换 | 正确发布顺序 |

## 可迁移知识

不可变快照读加受控写切换适合路由表和规则引擎；前置/后置责任链适合认证、审计和限流。

> **面试锚点**
> - Mapper 和 Pipeline 分别解决什么问题？
> - Host、Context、Wrapper 如何命中？
> - 自定义 Valve 忘记调用 next 会怎样？

## Related

- [HTTP 请求处理链](/notes/source/java/base/tomcat/request-pipeline/)
- [容器层级与组件关系](/notes/source/java/base/tomcat/container-hierarchy/)