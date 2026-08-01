---
title: Account Manager
description: 一个 Rust 实现的多上游 LLM 账号代理服务——统一账号模型、协议转换、反代编排和 Provider Runtime。
category: Backend
tags:
  - Rust
  - Proxy
  - Architecture
  - API Gateway
  - Multi-Tenant
sidebar:
  order: 200
updatedDate: 2025-10-03
difficulty: advanced
status: stable
lastReviewed: 2026-07-15
---

这里整理 Account Manager 的核心知识库——一个用 Rust 构建的统一 AI 账号代理与协议转换系统。

内容定位是**架构师视角的深度解读**：为什么这么设计、权衡了什么、面试怎么聊。

## 知识库结构

- [架构总览](/notes/backend/account-manager/architecture/)：系统分层、核心不变量、端到端请求流、技术栈选择
- [统一账号系统](/notes/backend/account-manager/account-system/)：账号域模型、选择器、Lease、组隔离、User Token
- [协议引擎](/notes/backend/account-manager/protocol-engine/)：Canonical IR、Client/Upstream Adapter、流式处理
- [代理编排层](/notes/backend/account-manager/proxy-orchestration/)：Orchestrator、跨账号重试、中间件、安全控制
- [上游运行时](/notes/backend/account-manager/upstream-runtimes/)：Provider Runtime、OAuth、Quota、Transport
- [部署与运维](/notes/backend/account-manager/deployment/)：Compose 部署、环境变量、健康检查、验证清单

## 一句话定位

**一个"接收任意 LLM 协议请求、选出最优账号并转发到上游"的代理服务**——不是 LLM 后端，不是 API 网关，而是一个有账号选择、协议适配和请求审计能力的统一代理中间层。

## 核心特点

| 特点 | 说明 |
|------|------|
| **统一账号域模型** | 19 个账号域，账号域 != 认证类型，BYOK 统一为 api_key 域 |
| **协议无关架构** | Canonical IR 做中间表示，新增协议只需写 adapter |
| **确定性账号选择** | `available_models_json` 精确匹配 + LRU，不依赖运行时推断 |
| **多上游并发代理** | OpenAI / Anthropic / Gemini / Kiro / Z.AI / GitHub Copilot 等 8 个上游 |
| **User Token 隔离** | Token 绑定账号组 + IP/宵禁限制，组为空时 fail closed |
| **OAuth 自动化** | 统一 OAuth 入口，loopback 自动回调，PKCE/Device Flow 全支持 |
| **请求可审计** | 结构化 request_logs、token_stats、ProxyOutcome 追踪 |

## 技术栈

Rust / axum / tokio / sqlx / SQLite / PostgreSQL / reqwest / tracing

## Related

- [Bot 架构知识库](/notes/ai/bot/)：Bot 的 Architecture 与 policy 模块
- [Backend](/notes/backend/)：API、服务端架构和数据流

