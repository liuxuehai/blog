---
title: Bot
description: 一个 Rust 实现的 local-first AI Agent 系统——架构设计、核心模块与面试深度解析。
category: AI
tags:
  - AI Agent
  - Rust
  - Architecture
  - System Design
sidebar:
  order: 120
---

这里整理 Bot 项目的核心知识库——一个用 Rust 从零构建的 local-first、可管控、可审计、可自我进化的 AI Agent 系统。

内容定位是**架构师视角的深度解读**：为什么这么设计、权衡了什么、面试怎么聊。

## 知识库结构

- [架构总览](/notes/ai/bot/architecture/)：系统分层、五条不变量、端到端请求流、技术栈选择
- [Agent 引擎](/notes/ai/bot/agent-engine/)：tool_loop、状态机、反射机制、Execution Framework
- [Policy 治理](/notes/ai/bot/policy-governor/)：Governor 闸门、Tier × Mode 矩阵、Lease、确定性决策
- [多 Agent 编排](/notes/ai/bot/multi-agent/)：Coordinator-Worker、Swarm、SOP 运行时
- [面试专题](/notes/ai/bot/interview/)：设计决策 Q&A、系统设计练习、STAR 故事

## 核心特点

| 特点 | 说明 |
|------|------|
| **确定性权限控制** | Policy Governor，< 5ms 决策，禁止 LLM 进入决策路径 |
| **Workspace 沙箱** | 路径校验 + 工具 Tier 分级 + Policy 闸门 |
| **自我进化** | Harness 反馈闭环 → inferred constraint → 行为进化 |
| **多 Agent 编排** | Coordinator-Worker + 层级 Lease + Durable Swarm |
| **审计链路** | append-only ledger，bundle_hash 锁定策略版本 |

## 技术栈

Rust / tokio / axum / sqlx / SQLite / tracing

## Related

- [AI 辅助开发的工程化闭环](/notes/ai/ai-assisted-engineering-workflow/)
- [Backend](/notes/backend/)：API、服务端架构和数据流
