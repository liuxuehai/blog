---
title: 架构总览
description: 系统分层、五条不变量、端到端请求流、技术栈选择、与其他 AI 框架的对比。
category: AI
tags:
  - AI Agent
  - Rust
  - Architecture
order: 121
updatedDate: 2025-01-10
difficulty: advanced
status: stable
lastReviewed: 2025-08-15
draft: false
sidebar:
  order: 121
---

一个 local-first、可管控、可审计、可自我进化的 AI Agent 系统，用 Rust 从零构建。先建立全局认知，再按模块深入。

<!-- more -->

## 产品定位与设计哲学

### 一句话定位

**一个"能执行、能反思、能进化"的个人 AI 助手**——不是聊天机器人，不是工作流平台，而是一个有记忆、有权限、有自我纠错能力的执行型智能体。

### 三个核心承诺

| 承诺 | 含义 | 技术体现 |
|------|------|----------|
| **能识别并修复自身问题** | 失败有反馈、有沉淀、不重复 | Harness 反馈闭环 + Governor LoopDetected |
| **能识别并补齐执行环境** | 缺工具/缺权限时主动探测，不靠 LLM 反复试错 | Harness 环境探测 + Policy Lease 提权 |
| **能在受限授权下自主跑** | 多 agent / swarm / cron 不需要人盯着 | Policy Governor + 确定性决策 |

### 明确的反目标

- 多租户 SaaS / 企业 RBAC
- 通用工作流编排（不是 n8n / Airflow）
- Sandbox 隔离（WASM/Docker）—— workspace 边界 + governor 已经够
- 高密度 UI / dashboard

> **面试怎么聊：** 讲清楚"为什么不做成 SaaS"—— local-first 意味着数据主权在用户、部署零依赖、审计链路可控。这是架构决策的起点，不是限制。

## 系统分层

```text
┌──────────────────────────────────────────────────────────────┐
│  Channel          CLI / TUI / HTTP / WS / cron               │
│    ↓ ChannelRequest                                          │
├──────────────────────────────────────────────────────────────┤
│  Agent            root coordinator + workers                 │
│    ├─ tool_loop   (LLM → tool_call → policy → execute)       │
│    ↓ before exec                                             │
├──────────────────────────────────────────────────────────────┤
│  Policy           唯一闸门, < 5ms, 确定性, 可审计            │
│    ├─ BundleSource  (tier × mode 矩阵)                       │
│    ├─ LeaseSource   (能力租约)                               │
│    ├─ HarnessSource (失败模式信号)                           │
│    ├─ LoopSource    (重复检测)                               │
│    ├─ BudgetSource  (token/turn/seconds)                     │
│    └─ Lint / Realtime (确定性规则)                           │
├──────────────────────────────────────────────────────────────┤
│  Tools            workspace 边界内的能力执行 (~40+ 内置)     │
├──────────────────────────────────────────────────────────────┤
│  Harness (信号源)  │  Memory (短/长期)  │  Skills (领域能力) │
├──────────────────────────────────────────────────────────────┤
│  Prompt            system prompt 构建、缓存、family sections │
├──────────────────────────────────────────────────────────────┤
│  DB               bot.sqlite — 单一事实源                    │
└──────────────────────────────────────────────────────────────┘
```

### 层间调用方向（单向，不可逆）

```text
Channel → Agent → Policy → Tools → DB
                ↑
         Harness / Memory / Skills（信号注入，非调用）
```

**关键约束：**

- `Agent → Policy → Tools` 是单向调用，**Policy 是必经闸门**
- `Harness` 是 Policy 的信号源之一，**不再有阻断权**（已降级）
- `Memory` 仅由 Agent / Curator 写入，工具不能直接写业务记忆
- 配置事实源是 DB，不是 env

### 模块清单与职责边界

| 模块 | Crate | 一句话职责 |
|------|-------|-----------|
| app | `crates/app` | CLI 入口编排、启动模式、DB 初始化 |
| agent | `crates/agent` | 用户意图 → tool_call / final 闭环 |
| channels | `crates/channels` | 输入/输出通道契约、审批确认 |
| config | `crates/config` | 配置数据模型、workspace root 解析 |
| cron | `crates/cron` | 定时任务调度 |
| daemon | `crates/daemon` | 守护进程监督、健康快照 |
| db | `crates/db` | **唯一持久化层**，仅此处可 SQL |
| gateway | `crates/gateway` | HTTP/SSE/WS 接入、鉴权、限流 |
| harness | `crates/harness` | 被动反馈：交互记录、约束生成、环境探测 |
| hooks | `crates/hooks` | 生命周期拦截点、可插拔扩展 |
| llm | `crates/llm` | provider/profile 抽象、请求/响应、重试 |
| memory | `crates/memory` | 短期/长期记忆、FTS5 + 向量 hybrid search |
| policy | `crates/policy` | **Governor 唯一闸门** |
| prompt | `crates/prompt` | system prompt 构建、缓存、family |
| skills | `crates/skills` | skill manifest、工具权限映射 |
| sop | `crates/sop` | SOP 加载、解析、步骤提取 |
| tools | `crates/tools` | 工具协议、安全边界、MCP 集成 |
| utils | `crates/utils` | 统一错误封装与分类 |

> **面试怎么聊：** 22 个 crate 的拆分不是过度设计——每个 crate 有明确的"只能做什么"和"不能做什么"。`db` 是唯一能碰 SQL 的，`policy` 是唯一能出 Deny 的，`harness` 已经不能阻断了。这种约束让代码审查变得机械化。

## 五条不变量（不可妥协）

这五条是整个系统的"宪法"，任何 PR 都不能违反：

### I1：执行优先于解释

能动手就动手；解释作为副产物，不作为主输出。Agent 的输出格式强制为三段式：**结论/动作 → 关键点 → 必要细节**。禁止冗长铺垫、复述用户内容。

### I2：失败必须改变策略

同一失败路径不允许重复两次。技术保障：

- Governor 的 `LoopDetected` 检测重复失败
- Harness 的 inferred constraint 注入"上次为什么失败"
- Agent 的 `[REFLECT]` 阶段强制分析根本原因

### I3：决策必须可审计可回滚

每次工具调用的 allow/deny 都进 append-only ledger。技术保障：

- `policy_decisions` 表 append-only（触发器禁 update/delete）
- `bundle_hash` 锁定策略版本
- `CapabilityLease` 树可从 DB 恢复

### I4：关键路径不依赖 LLM 二次调用

闸门决策、loop 检测、leak 过滤必须确定性 < 5ms。技术保障：

- `DecisionEngine` 的所有 Source 都是确定性规则
- 禁止 LLM 调用、网络调用、阻塞 IO 进入决策路径
- `Verdict::fold` 是纯函数，无副作用

### I5：工作区即沙箱

工具操作不允许越出 `WorkspaceResolver` 定义的边界。技术保障：

- 路径校验禁止 `..`、symlink escape、绝对路径
- 越界一律 `Deny(PathDenied)`

> **面试怎么聊：** 不变量是"设计约束"而非"功能需求"。讲不变量时要讲"为什么需要这条"和"怎么保证它不被违反"——这比罗列功能更能展示架构思维。

## 端到端请求流

以一次用户通过 HTTP 发起的工具调用请求为例：

```text
① 用户 POST /chat
    ↓
② Gateway 鉴权 + 限流
    ↓ ChannelRequest
③ Agent 构建上下文
    ├─ 从 DB 恢复 Conversation + Messages
    ├─ PromptBuilder 构建 system prompt
    │   ├─ Static sections (identity, rules, tone)
    │   ├─ Dynamic sections (memory, constraints, lecture)
    │   └─ 按 lease 渲染可用工具列表
    └─ 调用 LLM
    ↓
④ LLM 返回 tool_call 或 final answer
    ├─ final → ⑧
    └─ tool_call → ⑤
    ↓
⑤ Policy DecisionEngine.decide()
    ├─ 并行执行所有 Source（Bundle/Lease/Harness/Loop/Budget/Lint）
    ├─ Verdict::fold 聚合
    ├─ Allow → ⑥
    ├─ Deny → 写入 ledger，错误返回 Agent → 进入 REFLECT
    └─ Defer → ApprovalBroker / LectureQueue / Escalation
    ↓
⑥ Tools 执行
    ├─ Workspace 路径校验
    ├─ 执行工具逻辑
    └─ 返回 ToolResult（成功/失败/截断）
    ↓
⑦ Agent 将 tool_result 写回对话轨迹
    ├─ 记录到 DB
    ├─ 可能触发 Harness 交互记录
    └─ 回到 ④ 继续循环
    ↓
⑧ 最终响应
    ├─ 持久化 Conversation/Message 到 DB
    ├─ Memory 策略决定是否写入摘要
    └─ Channel 输出响应
```

### 关键时序约束

| 步骤 | 约束 |
|------|------|
| Policy 决策 | < 5ms（p99） |
| LLM 调用 | 可重试，有超时 |
| 工具执行 | workspace 边界内 |
| DB 写入 | 不允许静默丢弃 |
| Ledger 记录 | best-effort，不阻塞主流程 |

> **面试怎么聊：** 画这个流程图时，重点讲"Policy 在哪里拦截"和"失败怎么回来"——这是系统的核心控制流。

## 核心数据模型

### 对话域

```text
Conversation
  └─ ConversationMessage[] (role: user/assistant/system/tool)
       ├─ content: String
       ├─ tool_calls: Vec<ToolCall>
       └─ tool_results: Vec<ToolResult>
```

### Policy 域

```text
Action (tool, params_fingerprint, agent_id, root_session_id, turn_idx)
  ↓
Verdict: Allow | Deny | Defer
  ↓
DecisionRecord → policy_decisions (append-only)
```

```text
CapabilityLease
  ├─ lease_id, agent_id, parent_lease_id?
  ├─ capabilities: Vec<Capability>  // Tool | PathPrefix | Tier | Custom
  ├─ mode, bundle_hash
  ├─ budget_json?, granted_at, expires_at?, max_uses?, used
  └─ status: Active | Expired | Revoked | Consumed | BudgetExhausted
```

### Memory 域

```text
MemoryItem
  ├─ content: String
  ├─ source: String
  ├─ created_at, updated_at
  └─ embedding: Option<Vec<f32>>
```

> **面试怎么聊：** 数据模型讲"为什么这么分域"——对话域、策略域、记忆域各自独立，通过 ID 关联而非嵌套。这让每个域可以独立演进。

## 与其他 AI 架构的对比

| 维度 | Bot | LangChain | AutoGPT | Claude Code |
|------|-----|-----------|---------|-------------|
| 语言 | Rust | Python | Python | TypeScript |
| 部署 | 单二进制 | pip 依赖链 | Docker | npm/CLI |
| 权限控制 | 确定性 Policy Governor | 无内置 | 无内置 | Permission mode |
| 记忆 | FTS5 + 向量 hybrid | 外部集成 | 简单文件 | 无内置 |
| 多 Agent | Coordinator-Worker + SOP | AgentExecutor | 任务队列 | Subagent |
| 审计 | append-only ledger | 无 | 无 | 无 |
| 工具安全 | workspace 沙箱 + path auth | 无内置 | 无内置 | workspace 校验 |
| 自我进化 | Harness 反馈 + inferred constraint | 无 | 无 | 无 |

### 核心差异

**确定性闸门 vs 信任 LLM** —— 大多数 AI 框架把权限控制交给 prompt（"你不能做 X"）。Bot 用代码层面的 Policy Governor 强制执行——LLM 说什么都不重要，闸门说不行就是不行。

**本地优先 vs 云优先** —— SQLite 单文件存储、单二进制部署、零外部依赖。不是因为不能做分布式，而是 local-first 是产品决策——数据主权、部署简单、审计可控。

**能自我进化 vs 静态行为** —— Harness 记录每次失败 → 生成 inferred constraint → 注入下一轮 prompt → 避免重复失败。这不是 RAG，是**行为层面的进化**。

## 技术栈选择

### 为什么是 Rust？

| 需求 | Rust 优势 |
|------|-----------|
| Policy < 5ms | 零成本抽象、无 GC 停顿 |
| 并发模型 | tokio + async/await，结构化并发 |
| 内存安全 | 所有权系统，无 data race |
| 单二进制 | `cargo build --release`，零运行时依赖 |
| 类型系统 | 强类型 + trait，编译期捕获架构违规 |

### 为什么是 SQLite？

| 需求 | SQLite 优势 |
|------|------------|
| local-first | 单文件，无 server 进程 |
| FTS5 | 内置全文搜索扩展 |
| 向量 | sqlite-vec 或自定义扩展 |
| 可靠性 | WAL 模式，进程崩溃不丢数据 |

## 实现路线

| Phase | 内容 | 状态 |
|-------|------|------|
| P0 | agent + llm + db + channels 主链路 | 已完成 |
| P1 | memory + hooks + skills 集成 | 已完成 |
| P1/P2 | tools 安全与 MCP 接入、DB 迁移版本化 | 已完成 |
| P2 | 命令模式、HTTP 渠道、prompt 构建与缓存、SOP | 已完成 |
| Governor MVP | policy crate、bundle、lease、agent gate | 已完成 |
| auto-mode 加固 | loop/harness/budget/lecture/sanitizer | 已完成 |

> **面试怎么聊：** 讲路线时要讲"为什么这个顺序"——先跑通主链路（agent + llm），再加安全（policy），再加记忆和进化（harness + memory）。每个 Phase 都是在前一个 Phase 稳定后才开始。
