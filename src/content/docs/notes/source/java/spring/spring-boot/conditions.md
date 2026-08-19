---
title: 条件注解与评估报告
description: Spring Boot 条件匹配、结果记录与 ConditionEvaluationReport 的源码链路。
category: Backend
tags: [Source Reading, Spring Boot, Conditions]
order: 24
updatedDate: 2026-08-19
difficulty: advanced
status: stable
lastReviewed: 2026-08-19
draft: false
sidebar:
  order: 24
---

条件系统让自动配置能够回答“当前环境是否满足启用要求”，并把命中与未命中的原因保留下来，避免启动诊断只能靠猜。

<!-- more -->

## 先给答案：条件注解把“是否装配”的判断变成可诊断的决策记录

条件判断不是简单返回 true/false。Boot 需要知道哪个类、哪个属性或哪个 Bean 导致配置生效或跳过，并把结果记录下来供启动报告和故障排查使用。

条件的顺序也会影响结果：classpath 条件、Bean 条件和属性条件分别观察不同阶段的事实。一个配置“不生效”可能是候选没有进入、条件不匹配，或条件匹配后又被用户定义的 Bean 覆盖，不能只凭最终 Bean 是否存在反推原因。


## 状态流转

```text
configuration candidate
        │
        ▼
SpringBootCondition#matches
        ├─► condition.matches
        ├─► ConditionOutcome
        └─► ConditionEvaluationReport.recordEvaluation
```

## 实现拆解

- `SpringBootCondition` 在 `core/spring-boot-autoconfigure/src/main/java/org/springframework/boot/autoconfigure/condition/SpringBootCondition.java:39`。
- 统一入口 `matches(...)` 在 `:44`，将匹配结果包装成 `ConditionOutcome`。
- 结果写入 `recordEvaluation(...)`，见 `:102`。
- 组合条件通过 `matches(context, metadata, condition)` 在 `:141` 委托具体 `Condition`。
- `ConditionEvaluationReport` 在 `.../condition/ConditionEvaluationReport.java:53`，维护候选和结果。
- 候选记录入口 `recordEvaluationCandidates` 在 `:105`。
- 报告内部通过 `ConditionAndOutcomes` 和 `ConditionAndOutcome` 聚合多个条件，见 `:223`、`:263`。
- Actuator 的 conditions 端点可以把这份报告变成运行时诊断信息。

## 为什么要记录失败原因

**替代方案**：条件不满足时只返回 false。
**为什么不行**：用户只能看到“Bean 没有创建”，无法区分缺类、缺 Bean、属性不匹配还是显式排除。
**证据**：`SpringBootCondition#matches()` 同时生成 outcome 并记录 report，诊断数据和装配决策共用一次评估。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| 条件依赖 Bean 类型 | 顺序变化导致结果不同 | Bean 尚未注册或被用户替换 | 优先使用类路径、属性等稳定条件 |
| 条件类抛异常 | 启动失败而非简单跳过 | 条件实现本身有副作用或错误 | 条件只做查询，不做业务初始化 |
| 只看最终 Bean 列表 | 无法解释未装配 | 失败原因被忽略 | 使用 conditions report 定位 |

## 可迁移知识

“决策结果 + 原因”应作为同一数据结构传播。配置系统、权限系统和路由系统都可以用 outcome/report 模式提升可诊断性。

> **面试锚点**
> - `@ConditionalOnClass` 为什么通常不会直接加载缺失类？
> - 条件报告记录了什么？
> - 条件判断应该避免哪些副作用？

## Related

- [自动装配与 imports](/notes/source/java/spring/spring-boot/auto-configuration/)
- [Actuator 端点模型](/notes/source/java/spring/spring-boot/actuator/)
- [Spring Framework refresh 生命周期](/notes/source/java/spring/spring-framework/refresh-lifecycle/)
