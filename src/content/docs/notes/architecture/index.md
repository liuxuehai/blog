---
title: DDD 领域驱动设计
description: 领域驱动设计核心概念、架构分层、聚合建模与工程实践知识库。
category: Architecture
tags:
  - DDD
  - Architecture
  - Domain Modeling
sidebar:
  order: 30
---

这里整理领域驱动设计（Domain-Driven Design）的核心知识——从概念理解到工程落地，重点放在能指导实际建模的思维方式和设计决策。

内容定位是**面向复杂业务系统的设计方法论**：不是套概念，而是用领域模型承载核心业务规则。

<!-- more -->

## 适合什么场景

**适合：**

- 业务规则复杂、状态流转复杂
- 多团队协作、领域边界清晰但容易耦合
- 长期演进的核心系统（支付、订单、供应链、业财、交易、账号权限）

**不一定适合：**

- 简单 CRUD、原型项目
- 业务规则很少的后台管理
- 短生命周期项目

> DDD 有成本，不能为了 DDD 而 DDD。简单 CRUD 用传统三层架构更直接；复杂核心域才值得投入领域建模。

## 知识库结构

- [业务建模流程](/notes/ddd/business-modeling/)：从还原业务流程到领域模型落地的完整过程
- [核心概念](/notes/ddd/core-concepts/)：统一语言、实体、值对象、聚合、仓储、领域服务、应用服务、领域事件
- [架构与建模风格](/notes/ddd/architecture/)：分层架构、贫血 vs 充血模型、与传统三层架构的对比
- [业务规则放置策略](/notes/ddd/rule-placement/)：规则该放值对象、聚合根、领域服务还是应用服务
- [聚合与聚合根设计](/notes/ddd/aggregate-design/)：聚合根职责、设计步骤、边界划分、跨聚合事务、常见错误
- [限界上下文与微服务](/notes/ddd/bounded-context/)：Bounded Context、Context Map、核心域 / 支撑域 / 通用域
- [工程实践](/notes/ddd/real-world-examples/)：业财系统建模、支付渠道路由、CQRS、老系统引入 DDD
- [面试专题](/notes/ddd/interview/)：常见问题、高难度追问、面试话术

## 面试一句话总结

> DDD 的核心是让代码表达业务，而不是只表达数据库表和技术流程。我通常会先识别限界上下文，再找核心聚合和值对象，把状态流转和不变量放到聚合根方法中。应用服务只负责编排事务和调用领域对象，Repository 负责聚合持久化。跨聚合或跨服务协作尽量通过领域事件、Outbox、消息最终一致和幂等补偿来处理。

## Related

- [Backend](/notes/backend/)：API、服务端架构和数据流
- [AI](/notes/ai/)：AI 工程与 Agent 系统
