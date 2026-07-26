---
title: 多 Agent 编排
description: Coordinator-Worker 模式、Worker 自包含原则、Durable Swarm、SOP 运行时、Policy 协作。
category: AI
tags:
  - AI Agent
  - Rust
  - Multi-Agent
  - Orchestration
  - SOP
order: 124
updatedDate: 2026-07-24
difficulty: advanced
status: stable
lastReviewed: 2026-07-24
draft: false
sidebar:
  order: 124
---

当单个 Agent 不够用时——任务太复杂、需要并行、需要无人值守——就需要多 Agent 协作。

<!-- more -->

## 为什么需要多 Agent

| 问题 | 场景 |
|------|------|
| **串行瓶颈** | 5 个独立文件需要修改，单 Agent 一次只能改一个 |
| **上下文窗口** | 复杂任务的上下文超过模型限制 |
| **无人值守** | cron 触发的任务没有人工审批 |
| **失败隔离** | 一个工具失败不应影响整个任务 |

Bot 选择 **Coordinator-Worker** 模式，而非 Agent Chain（仍是串行）、Agent Pool（缺乏协调）、DAG 编排（过度工程化）。

## Coordinator-Worker 架构

### 角色定义

```text
用户请求
    ↓
Coordinator (root agent)
    ├─ planner（内部阶段，不是子 Agent）
    ├─ executor（内部阶段）
    ├─ critic（内部阶段）
    │
    ├─ worker_spawn → Worker Agent 1
    ├─ worker_spawn → Worker Agent 2
    └─ worker_spawn → Worker Agent 3
```

**关键设计决策：** `planner / executor / critic` 是 Coordinator 的**内部阶段**，不是工具，不是子 Agent。这避免了递归复杂度。

### 任务分流

| 类型 | 处理方式 | 示例 |
|------|----------|------|
| 简单对话 | Coordinator 直接回答 | "今天天气如何" |
| 简单工程任务 | Coordinator 直接调用工具 | 单文件修改 |
| 复杂任务 | 拆成可独立验证的 worker | "重构整个模块" |
| 并行任务 | 一次发起多个 worker_spawn | "同时修改 5 个文件" |
| 目标不明确 | 先问一个澄清问题 | "你想优化什么？" |

### Worker Runtime 工具

| 工具 | 功能 | 返回 |
|------|------|------|
| `worker_spawn` | 创建新 Worker | worker_id |
| `worker_send` | 发送消息给 Worker | 确认 |
| `worker_stop` | 停止 Worker | 确认 |
| `worker_list` | 列出所有活跃 Worker | Worker 列表 |
| `worker_get` | 获取 Worker 状态和结果 | Worker 详情 |

> **面试怎么聊：** 只有 5 个工具——最小接口原则。spawn/send/stop/list/get 覆盖了 Worker 的完整生命周期。

## Worker 自包含原则

Worker 是无状态的——它不知道 Coordinator 的上下文、用户的原始意图、之前的执行历史。所以 Worker 的 prompt 必须包含一切它需要知道的信息。

### 自包含 prompt 的六个要素

1. **背景**：这个任务的上下文是什么
2. **具体目标**：你需要完成什么
3. **允许修改的文件范围**：你的沙箱边界
4. **推荐工具序列**：建议怎么做
5. **验证命令**：怎么确认你做对了
6. **失败时如何调整**：做错了怎么办

> **面试怎么聊：** 自包含 prompt 是多 Agent 系统的核心设计模式。重点讲"为什么不传上下文"——上下文传递会引入状态依赖，Worker 失败后重试需要重新构建上下文，而自包含 prompt 可以直接重发。

## Coordinator 的 Review 维度

Coordinator 收到 Worker 结果后，从五个维度验收：

| 维度 | 检查内容 |
|------|----------|
| **目标达成** | 是否完成了用户要求的任务？ |
| **工具真实性** | 是否使用了真实工具（无幻觉工具调用）？ |
| **证据可验证** | 结果是否有可验证的证据（diff、测试输出）？ |
| **副作用** | 是否引入了意外的副作用？ |
| **继续/重派** | 是否需要继续执行或重派 Worker？ |

## Swarm 运行时

### Durable Swarm

Swarm 的关键特性是**持久化**——进程崩溃后可以恢复：

```text
Worker 启动 → 写入 DB (status=running, heartbeat=now)
    ↓
Worker 执行中 → 每个 turn 入口刷新 heartbeat
    ↓
Coordinator 恢复时
    ├─ 查询 status=running 的 worker
    ├─ 检查 last_heartbeat_at
    │   ├─ 超时 → 标记为 interrupted/lost
    │   └─ 仍在心跳 → 继续监控
    └─ interrupted worker 的 task 回退到 pending
```

### Worker 状态机

```text
pending → running → completed
            │
            ├── interrupted（进程崩溃，可恢复）
            ├── lost（心跳超时，不可恢复）
            └── failed（执行失败）
```

> **面试怎么聊：** Durable Swarm 是"无人值守场景"的关键能力。重点讲"heartbeat + recovery"——Worker 定期写心跳，Coordinator 恢复时检查心跳，超时的 Worker 被判定为 interrupted 并回退任务。

## Coordinator-Worker 的 Policy 协作

### Lease 委托

```text
Coordinator 的 parent lease (capabilities: [file_read, file_write, shell])
    ↓ worker_spawn
Policy: delegate_child(parent_lease, subset)
    ↓
Worker 的 child lease (capabilities: [file_read, file_write])  // 没有 shell
```

### LectureQueue 教育

Worker 尝试调用没有权限的工具 → Policy `Deny + Lecture` → 把"为什么不让你做"注入 worker 下一轮 prompt → Worker 调整策略。

### Capability 提权

Worker 需要更多权限 → `worker_request_capability` → Coordinator 检查 pending requests → `worker_grant_capability` → 扩展 child lease。

> **面试怎么聊：** Lease 委托 + LectureQueue + Capability 提权构成完整的权限管理闭环。默认最小权限，需要时提权，拒绝时教育。

## SOP 运行时（V3 架构）

### SOP vs 普通 tool_loop

| | 普通 tool_loop | SOP 运行时 |
|---|---|---|
| 状态 | 无状态 | 有状态（SopInstance） |
| 流程 | LLM 自主决定 | 预定义步骤 |
| 暂停 | 不支持 | 支持（用户干预/确认） |
| 回滚 | 不支持 | 支持（失败回退到上一步） |
| 审计 | 工具调用记录 | 步骤级审计 |

### SopInstance 状态机

```text
created → running → completed
            │
            ├── paused（用户干预 / 需要确认）→ running（恢复）
            ├── failed → running（重试）或 aborted（无法恢复）
            └── reflecting（连续失败）→ running（新策略）或 failed
```

### SOP 执行流程

```text
用户请求
    ↓
Coordinator: SOP 匹配器（意图/关键词/上下文）
    ↓
SOP Runtime: 创建 SopInstance
    ↓
遍历 SOP 步骤：
    ├─ Coordinator 评估需要哪种 Worker
    ├─ worker_spawn(专用 prompt + 步骤上下文)
    ├─ Worker 执行 → 回报结果
    ├─ Coordinator 验收 (VERIFY)
    │   ├── 通过 → 进入下一步
    │   └── 不通过 → REFLECT → 重试或升级
    └─ Policy Gate 检查 (budget/lease/loop)
    ↓
SOP 完成 → 生成总结 → 存入记忆
```

## 面试高频问题

**Q: Coordinator 和 Worker 的职责边界？**
Coordinator 是监督者——计划、任务拆分、结果验收。Worker 是执行者——接收自包含任务、独立执行、回报结果。Coordinator 不直接执行业务逻辑（除了简单任务）。

**Q: Worker 崩溃怎么办？**
Durable Swarm + Heartbeat。Worker 每个 turn 写心跳到 DB。Coordinator 恢复时检查心跳，超时的 Worker 标记为 interrupted，其任务回退到 pending。

**Q: SOP 运行时和普通工作流引擎的区别？**
三个核心差异：与 Agent 深度集成——SOP 步骤由 Worker Agent 执行；Policy 联动——每步执行前经过 Policy 决策；反射机制——失败时进入 REFLECT 分析根本原因。

**Q: 多 Agent 场景下怎么保证权限不越界？**
层级 Lease 机制。Coordinator 的 parent lease 包含完整权限，spawn Worker 时自动创建 child lease（能力子集）。Worker 尝试越权 → Deny(LeaseMissing)。
