---
title: 架构总览
description: 系统分层、15 个模块边界、四层数据模型、核心不变量、端到端请求流、技术栈选择。
category: Backend
tags:
  - Rust
  - Architecture
  - Proxy
  - System Design
order: 201
updatedDate: 2024-08-20
difficulty: advanced
status: stable
lastReviewed: 2025-10-15
draft: false
sidebar:
  order: 201
---

一个接收任意 LLM 协议请求、选出最优账号并转发到上游的代理中间层，用 Rust 从零构建。先建立全局认知，再按模块深入。

<!-- more -->

## 产品定位与设计哲学

### 一句话定位

**统一 LLM 账号、协议转换与代理转发服务**——多上游账号统一管理、按模型和协议选择 runtime、请求可审计、账号隔离可控。

### 三个核心承诺

| 承诺 | 含义 | 技术体现 |
|------|------|----------|
| **协议无关** | 不绑定任何特定 LLM 提供商协议 | Canonical IR + Client/Upstream Adapter |
| **账号隔离可控** | User Token 绑定账号组，不能越界访问 | SelectionScope + 组过滤 + fail closed |
| **请求可审计** | 每次转发的完整链路可追溯 | request_logs + token_stats + ProxyOutcome |

### 明确的反目标

- 通用工作流平台（不是 n8n / Airflow）
- 企业 RBAC 中心（不是 Keycloak / Auth0）
- 任意协议网关（专注 LLM API）
- 模型推理/训练服务

> **面试怎么聊**：讲清楚"为什么不做成通用网关"——专注 LLM 协议意味着 Canonical IR 的语义层可以做得很薄，但又能精准建模 text/image/tool_call/thinking 等 LLM 特有概念。通用网关做不到这一点。

## 系统分层

```text
┌──────────────────────────────────────────────────────────────┐
│  API               /v1/*  /internal/*  /api/* /health        │
│    ↓ 客户端请求                                             │
├──────────────────────────────────────────────────────────────┤
│  Middleware         认证 / CORS / IP 过滤 / 日志 / 限流      │
├──────────────────────────────────────────────────────────────┤
│  Protocol Handler   OpenAI Chat / Claude / Gemini / MCP      │
│    ↓ 解码为 CanonicalRequest                                │
├──────────────────────────────────────────────────────────────┤
│  Routing            model_mapping + RuntimeRegistry          │
│    ↓ resolved_model + RuntimeKind                           │
├──────────────────────────────────────────────────────────────┤
│  ProxyOrchestrator  账号 scope 解析 → select_lease → 重试   │
├──────────────────────────────────────────────────────────────┤
│  Accounts           统一账号服务、选择、Lease、组隔离        │
├──────────────────────────────────────────────────────────────┤
│  Upstream Runtime   ProviderRuntime 执行上游请求             │
├──────────────────────────────────────────────────────────────┤
│  Protocol Adapter   encode_request / decode_stream_event     │
├──────────────────────────────────────────────────────────────┤
│  Transport          HTTP client pool / proxy pool            │
├──────────────────────────────────────────────────────────────┤
│  DB                PostgreSQL / SQLite                       │
└──────────────────────────────────────────────────────────────┘
```

### 层间调用方向（单向）

```text
Middleware → Handler → Routing → Orchestrator → Accounts/Selection
                                              → Upstream Runtime →
                                                Transport → 上游服务
```

**关键约束**：

- Handler 不直接选账号；选账号走 `Orchestrator → AccountService::select_lease`
- Runtime 不重新扫 DB 选账号；只消费 `AccountLease`
- 跨账号重试在 Orchestrator 做，不在 Runtime 做
- 协议转换集中在 protocol/，不走点对点硬编码

## 模块清单与职责边界

| 模块 | 路径 | 一句话职责 |
|------|------|-----------|
| accounts | `src/accounts` | 账号域模型、账号选择、租约、组隔离 |
| api | `src/api` | HTTP DTO、admin/v1 handler、错误响应 |
| commands | `src/commands` | 服务启动、命令式操作 glue |
| db | `src/db` | **唯一持久化层**，仅此处 SQL |
| integrations | `src/integrations` | 系统进程、cloudflared、CLI 同步、更新检测 |
| locales | `src/locales` | 多语言资源文件 |
| log | `src/log` | tracing 初始化、日志桥接、敏感信息脱敏 |
| models | `src/models` | 跨层 DTO、配置、token、quota 数据结构 |
| observability | `src/observability` | 指标、重试事件和可观测记录 |
| protocol | `src/protocol` | **协议转换中心**：Canonical IR、Client/Upstream Adapter |
| proxy | `src/proxy` | 反代编排：中间件、handler、Orchestrator |
| routing | `src/routing` | 模型路由、RuntimeRegistry、server lifecycle |
| upstream | `src/upstream` | Provider Runtime、OAuth、quota、transport |
| utils | `src/utils` | 通用 ID、HTTP、crypto、cache、i18n、version |

> *面试怎么聊*：15 个模块的拆分不是过度设计——每个模块有明确的"只能做什么"和"不能做什么"。`db` 是唯一能碰 SQL 的，`protocol` 是唯一能做协议语义转换的，`accounts` 是唯一能选账号的。这让代码审查变得机械化。

## 四层数据管道

这是整个系统最核心的设计：**任何 LLM 请求都经过统一的数据转换管道**。

```text
Client Protocol (OpenAI/Claude/Gemini/...)
    ↓ client adapter 解码
Canonical IR (CanonicalRequest)     ← 协议无关的中间表示
    ↓ routing + account selection
    ↓ upstream adapter 编码
Upstream Protocol (发送到上游)
    ↓
Upstream Response/Stream
    ↓ upstream adapter 解码
CanonicalStreamEvent / CanonicalResponse
    ↓ StreamCollector 聚合
    ↓ client adapter 编码
Client Response/SSE
```

**核心设计决策**：

| 设计 | 理由 |
|------|------|
| Canonical IR 不做"超集" | 只包含 LLM 最核心的语义：messages、tools、streaming、thinking、images |
| Client/Upstream 双 Adapter | OpenAI→Claude 和 Claude→OpenAI 只写一次，相互独立 |
| `requested_model` >= `resolved_model` >= `upstream_model` | 三段模型链，每段变更可追溯 |
| 协议选择在 Orchestrator | `resolve_upstream_protocol()` 根据 lease 的 `supported_protocols` 决定 |

> *面试怎么聊*：重点讲清楚"为什么需要 Canonical IR"——不是过度抽象，而是消除 O(N x M) 的协议转换爆炸。8 种客户端协议 x 8 种上游 Runtime 如果不通过 IR，需要 64 个点对点转换器。

## 核心不变量

### I1：账号选择是统一能力

不属于任何协议 handler，不属于任何 runtime。`AccountService::select_lease()` 是唯一入口。所有模块依赖这个函数的返回值决定执行策略。

### I2：组隔离必须 fail closed

User Token 绑定账号组后：组不存在 → 请求失败；查询失败 → 请求失败；组为空 → 请求失败。**不降级到全量账号**。

### I3：API Key 账号必须显式声明

未知协议不能静默落到 Antigravity 或兜底 runtime。必须通过 `runtime_options_json.protocol` 或 `supported_protocols` 声明。

### I4：请求路径三段模型名

`requested_model` → `resolved_model` → `upstream_model`，每段变更可追溯。`provider` 级别名和 fallback 必须可观测。

### I5：协议转换不走捷径

不存在 `handler 直接 JSON.json → runtime 直接 JSON.json` 的路径。必须经过 Canonical IR。

## 端到端请求流

以一次 `POST /v1/chat/completions` 为例：

```text
1. 请求进入 Axum route (routing/server/ routes)
2. auth_middleware 验证 User Token / admin key
3. ip_filter_middleware 检查 IP 过滤
4. monitor_middleware 注入 trace_id 和时间
5. OpenAI chat handler 解码请求 (protocol/client/openai)
   → CanonicalRequest { requested_model: "gpt-4o-mini" }
6. model_mapping 解析: "gpt-4o-mini" → "gpt-4o-mini"
   → resolved_model, RuntimeKind::OpenAI
7. account_scope::resolve_selection_scope()
   User Token 有 group_id → SelectionScope::Group { group_id, account_ids }
8. AccountService::select_lease(Request)
   ├─ 过滤: enabled/status/proxy_disabled/protocol/runtime/model
   ├─ 排序: last_used ASC → created_at ASC → id ASC (LRU)
   └─ 返回 AccountLease { account_id, credentials, runtime_kind }
9. ProxyOrchestrator::execute_chat(OrchestratorRequest)
   - 最多 max_attempts 次
   - resolve_upstream_protocol: checks lease.runtime_options.supported_protocols
   - RuntimeRegistry::get(RuntimeKind::OpenAI)
   - ProviderRuntime::execute_chat(RequestContext, lease, request)
   - 失败调用 should_retry (429/5xx/network) → 排除账号 → select_lease 再选
10. ProviderRuntime 执行:
    - upstream adapter encode_request(CanonicalRequest) → OpenAI JSON
    - transport send → upstream response SSE/JSON
    - upstream adapter decode_stream_event → CanonicalStreamEvent
    - StreamCollector 聚合
    - client adapter encode → OpenAI Chat SSE chunks
11. Orchestrator 记录 ProxyOutcome::Success
12. request_logs 异步写入 DB
13. 客户端收到 SSE/JSON 响应
```

## 与其他代理/网关的对比

| 维度 | Account Manager | LiteLLM | One-API | Gateway API |
|------|----------------|---------|---------|-------------|
| 语言 | Rust | Python | Go | Go |
| 账号选择 | 确定性 avai ... | 轮询/随机 | 轮询 | 路由表 |
| 协议转换 | Canonical IR | 无 | 无 | 无 |
| 账号组隔离 | 原生 support | 无 | 无 | 无 |
| OAuth 自动化 | 统一入口 + loopback | 无 | 无 | 无 |
| 流式协议互转 | OpenAI/Claude/Gemini 双向 | 无 | 无 | 无 |
| 部署模式 | 二进制 / Compose / 容器 | Docker / pip | Docker | Docker |

> **面试怎么聊**：重点讲"为什么用 Rust"和"为什么自己写 Canonical IR"。Rust 带来的零成本抽象让 IR 转换无 GC 停顿——这对流式 100+ chunks/second 不是一个新 API 门面。

## 技术栈选择

### 为什么是 Rust

| 需求 | Rust 优势 |
|------|-----------|
| 代理延迟敏感 | SSE 流式转发不抖动 |
| 高并发连接池 | actix/axum + tokio，结构化并发 |
| 单二进制部署 | `cargo build --release` |
| 类型安全 | 编译期捕获账号域/协议匹配错误 |

### 为什么是 SQLite/PostgreSQL 双模式

| 模式 | 场景 |
|------|------|
| SQLite | 单机部署、开发环境 |
| PostgreSQL | 多实例部署、共享账号池 |

`ABV_DATABASE_URL` 环境变量决定数据库选择，设置 Postgres 连接串则使用 Postgres，否则使用 SQLite。非法连接 Postgres 配置直接报错，不静默回退。

## 实现路线

| Phase | 内容 | 状态 |
|-------|------|------|
| P0 | 账号模型 + 数据库 + OAuth + 基本代理 | Done |
| P1 | Canonical IR + Client/UpstreamAdapter | Done |
| P2 | 统一账号选择 + 代理编排 | Done |
| P3 | 流式转换 + 多Client 协议 | Done |
| P4 | User Token 隔离 + 账号组 | Done |
| P5 | 管理 API + 前端 | Done |
| P6 | 生产部署 + 自动发布 | Done |

