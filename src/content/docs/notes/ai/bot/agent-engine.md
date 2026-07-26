---
title: Agent 引擎
description: Agent 核心循环、tool_loop、状态机、反射机制、Execution Framework，以及 Agent 的多种形态。
category: AI
tags:
  - AI Agent
  - Rust
  - Agent Loop
  - Reflection
order: 122
updatedDate: 2026-07-24
difficulty: advanced
status: stable
lastReviewed: 2026-07-24
draft: false
sidebar:
  order: 122
---

Agent 是整个系统的"大脑"——接收用户意图，调用 LLM，解析响应，执行工具，循环直到得到最终答案。

<!-- more -->

## Agent 核心循环

### 整体流程

```text
用户消息到达
    ↓
Agent 构建上下文
    ├─ 恢复 Conversation + Messages (从 DB)
    ├─ PromptBuilder 构建 system prompt
    └─ 注入 memory / constraints / lecture
    ↓
┌─────── LLM 调用 ←──────────────────────────────┐
│                                                  │
│   LLM 返回                                       │
│     ├─ final answer → 输出响应 → 结束            │
│     └─ tool_call → Policy 决策                   │
│                    ├─ Allow → 执行工具            │
│                    ├─ Deny → 记录 → REFLECT       │
│                    └─ Defer → 等待审批/Lecture    │
│                                                  │
│   tool_result 写回对话轨迹                        │
│   可能触发 Harness 交互记录                       │
│                                                  │
└──────────────────────────────────────────────────┘
```

### 为什么叫 "tool_loop" 而非 "agent_loop"

Agent 和 tool_loop 是两个不同的关注点：

| 组件 | 职责 |
|------|------|
| **Agent** | 上下文管理、对话持久化、生命周期协调 |
| **tool_loop** | LLM 响应解析、tool_call 提取、policy gate → 执行 → 结果回写 |

分离原因：可测试性（tool_loop 可单独测试）、可替换性（不同 Agent 形态复用同一 tool_loop）、关注点分离（Agent 管"我是谁"，tool_loop 管"怎么执行"）。

## 状态机

```text
idle → planning → executing → done
           ↑           ↓
           └── reflecting ←── blocked
```

| 状态 | 含义 | 转换条件 |
|------|------|----------|
| `idle` | 等待用户输入 | 消息到达 → planning |
| `planning` | 分析任务、制定计划 | 计划完成 → executing |
| `executing` | 调用工具执行 | 工具成功 → done；失败 → reflecting |
| `blocked` | 等待审批/外部输入 | 审批通过 → executing |
| `reflecting` | 分析失败、调整策略 | 新策略 → executing |
| `done` | 任务完成 | 回到 idle |

**关键约束：** 复杂任务（worker_spawn、shell、多步执行）**不允许跳过 planning**。

### Execution Framework

所有任务必须走四阶段框架：

```text
[PLAN] → [ACT] → [VERIFY] → [REFLECT] (可选)
```

- **[PLAN]**：分析任务，确定步骤
- **[ACT]**：执行工具调用
- **[VERIFY]**：验证结果是否符合预期（**不允许跳过**）
- **[REFLECT]**：失败/阻塞/用户拒绝时**强制进入**

> **面试怎么聊：** 四阶段框架是 Agent 设计的核心模式。重点讲 `[VERIFY]` 不允许跳过——大多数 AI Agent 框架没有这个约束，导致"执行了但不知道对不对"。

## tool_loop 核心实现

### tool_call 解析

LLM 返回的响应有两种形态：

1. **final answer**：纯文本，直接返回给用户
2. **tool_call**：JSON 结构，包含工具名和参数

tool_loop 的第一步是解析 LLM 响应，提取 tool_call，然后进入 Policy gate → 执行 → 结果回写循环。

### Policy Gate（必经闸门）

在执行任何工具之前，**必须**经过 Policy DecisionEngine：

```rust
let action = Action {
    tool: tool_name,
    params_fingerprint: hash(&params),
    agent_id: current_agent_id,
    root_session_id: session_id,
    turn_idx: current_turn,
};
let verdict = decision_engine.decide(ctx).await;
```

决策结果：`Allow` → 执行工具；`Deny` → 记录到 ledger，进入 REFLECT；`Defer` → 等待人工审批 / Lecture 注入 / 升级到 coordinator。

### 循环控制与退出条件

1. LLM 返回 final answer（正常退出）
2. 达到最大 turn 限制（安全退出）
3. Governor 截断（LoopDetected / BudgetExceeded）
4. 用户取消（CancellationToken）

**死锁防护：** Governor 的 `LoopSource` 检测重复的 tool_call 指纹（`tool + params_fingerprint`），同一指纹 ≥ 3 次 → `Deny(LoopDetected)`，Agent 进入 REFLECT 必须改变策略。

## 反射机制（进化核心）

### 触发条件

- tool 失败
- approval 被拒
- 连续 2 次无进展
- 结果不符预期
- Governor 截断（LoopDetected / BudgetExceeded / LeaseExpired）

### 反射输出结构

```text
问题：什么没达成
原因：根本原因（不是表面错误码）
错误假设：哪个判断错了
新策略：下次怎么避免重复
```

### 反射的下游流转

```text
Agent REFLECT 输出
    ↓
Harness::SteeringEngine
    ↓ 生成 inferred constraint
MemoryCurator
    ├─ 决定是否沉淀为长期 memory
    └─ 注入下一轮 system prompt
    ↓
Policy HarnessSource
    └─ 下次类似操作可能触发 Deny(HarnessFailureStreak)
```

### 为什么不能"换个参数重试"

大多数 AI Agent 的重试策略是：失败 → 换个参数再试。问题：（1）效率低——盲目重试浪费 token 和时间；（2）不学习——第 100 次犯同样的错误。

Bot 的策略：失败 → 分析根本原因 → 形成约束 → 下次自动避免。这是 I2 不变量（失败必须改变策略）的运行时实现。

> **面试怎么聊：** 反射机制是 Bot 和其他 AI Agent 框架的核心差异。重点讲"约束如何形成"和"约束如何注入 prompt"——这是一个闭环，不是一次性动作。

## Execution Mode（行为风格连续谱）

| 模式 | 确认策略 | 使用场景 |
|------|----------|----------|
| `strict` | 默认确认，不做额外推断 | interactive + high-risk |
| `adaptive` | 合理推断，减少确认 | interactive 默认 |
| `autonomous` | 直接执行，最小确认 | swarm / cron |

切换规则：用户显式指定 → 立即切换；连续阻塞 ≥ 2 次 → 自动提一级；命中 `high_risk_capabilities` → 立即降级为 `strict`。

Execution Mode 和 Policy Mode 是**正交的**：Execution Mode 控制行为风格（多少确认），Policy Mode 控制权限矩阵（哪些 Tier 允许）。

## 取消与超时

所有可取消的流程沿用 `CancellationToken` 传递：

```text
Channel (持有 token) → Agent → tool_loop → Tool 执行
```

超时策略：

| 组件 | 超时 | 处理 |
|------|------|------|
| LLM 调用 | 可配置 | 重试 → 返回明确失败 |
| 工具执行 | 工具特定 | 返回结构化错误 |
| Policy 决策 | < 5ms (p99) | 超时视为 Deny |
| 审批等待 | 可配置 | 超时 → Defer 升级 |

## 工具协议

每个工具实现 `Tool` trait：

```rust
pub trait Tool: Send + Sync {
    fn name(&self) -> &str;
    fn description(&self) -> &str;
    fn parameters(&self) -> serde_json::Value;  // JSON Schema
    fn tier(&self) -> Tier;
    async fn execute(&self, params: Value, ctx: &ToolContext) -> ToolResult;
}
```

参数 coercion 处理 LLM 返回的不完全符合 schema 的 JSON：类型转换、默认值填充、必填字段校验，失败返回结构化错误而非 panic。

## Agent 的多种形态

### Root Agent（交互模式）

```text
用户 → Channel → Root Agent → tool_loop → 最终响应
```

### Coordinator（协调模式）

```text
用户 → Channel → Coordinator
                  ├─ planner（内部阶段，不是子 Agent）
                  ├─ executor（内部阶段）
                  ├─ critic（内部阶段）
                  └─ worker_spawn → Worker Agent
```

`planner / executor / critic` 是 Coordinator 的**内部阶段**，不是工具，不是子 Agent。真实执行通过 `worker_spawn` 建立独立 Worker。

### Worker Agent（执行模式）

```text
Coordinator → worker_spawn → Worker Agent
                              ├─ 接收自包含 prompt
                              ├─ 独立 tool_loop
                              └─ 回报结果给 Coordinator
```

## 面试高频问题

**Q: Agent 循环怎么保证不死锁？**
三层防护：Governor LoopSource 检测重复 tool_call 指纹；最大 turn 限制硬退出；CancellationToken 支持外部取消。最关键的是 Governor——它在代码层面强制执行，不依赖 LLM 判断。

**Q: tool_loop 为什么和 Agent 分离？**
关注点分离。Agent 管上下文和生命周期，tool_loop 管执行循环。不同的 Agent 形态（interactive / coordinator / worker）可以复用同一个 tool_loop 实现。

**Q: 反射机制和普通重试有什么区别？**
普通重试是"换个参数再试"，反射是"分析为什么失败、形成约束、下次自动避免"。反射的输出会进入 Harness → inferred constraint → 下一轮 prompt，形成行为层面的进化。
