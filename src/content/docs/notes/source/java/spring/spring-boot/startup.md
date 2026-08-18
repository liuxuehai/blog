---
title: SpringApplication 启动流程
description: 从 run() 到上下文刷新，解析 Spring Boot 如何编排环境、监听器和应用上下文。
category: Backend
tags: [Source Reading, Spring Boot, Startup]
order: 22
updatedDate: 2026-08-15
difficulty: advanced
status: stable
lastReviewed: 2026-08-15
draft: false
sidebar:
  order: 22
---

`SpringApplication#run()` 是 Boot 的总调度器。它不直接创建所有业务 Bean，而是把环境、监听器、上下文和刷新阶段连接成一条有序流水线。

<!-- more -->

## 调用链

```text
SpringApplication.run
  ├─► getRunListeners
  ├─► prepareEnvironment
  ├─► createApplicationContext
  ├─► prepareContext
  ├─► refreshContext
  └─► afterRefresh / running
```

## 实现拆解

1. `run(String... args)` 在 `core/spring-boot/src/main/java/org/springframework/boot/SpringApplication.java:304` 进入主流程。
2. `getRunListeners(args)` 在 `:312` 前后加载启动监听器。
3. `createApplicationContext()` 在 `:318` 根据应用类型选择上下文。
4. `prepareContext(...)` 在 `:380` 注册环境、启动参数和主配置源。
5. `refreshContext(context)` 在 `:441` 委托 Spring Framework 执行刷新。
6. `getRunListeners` 的实现入口在 `:453`。
7. `createApplicationContext()` 的默认实现位于 `:579`。
8. 启动完成后通过 listeners 发送 started/running 事件，避免把监控逻辑硬编码到业务 Bean。

## 关键取舍

### 为什么不把所有逻辑塞进一个静态 main 方法

**替代方案**：由应用自己的 `main()` 读取配置、创建容器、启动服务器。
**为什么不行**：每个应用都会重复处理环境、异常、监听器和 Web 类型判断，扩展点也无法统一。
**证据**：`SpringApplication#run()` 将 `prepareContext`、`refreshContext` 和 listeners 分开，形成稳定的生命周期边界。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| 配置类不在扫描范围 | 启动成功但 Bean 缺失 | 主配置源选择不对 | 显式指定 sources 或调整包结构 |
| 启动阶段阻塞 | 应用迟迟不 ready | 监听器或初始化器执行阻塞任务 | 将外部任务移到就绪后异步执行 |
| 刷新失败 | 进程退出且 Bean 未完整创建 | Framework refresh 抛异常 | 优先查看 condition evaluation 与根因异常 |

## 可迁移知识

把长流程拆成“发现、准备、执行、完成通知”四段，能让扩展点拥有明确插入位置，也便于在失败时定位阶段。

> **面试锚点**
> - `SpringApplication.run()` 的主要阶段有哪些？
> - `SpringApplicationRunListener` 在什么时候触发？
> - Boot 为什么委托 Framework 的 `refresh()`？

## Related

- [整体架构](/notes/source/java/spring/spring-boot/architecture/)
- [自动装配与 imports](/notes/source/java/spring/spring-boot/auto-configuration/)
- [Spring Framework refresh 生命周期](/notes/source/java/spring/spring-framework/refresh-lifecycle/)