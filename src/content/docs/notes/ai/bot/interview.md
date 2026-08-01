---
title: 面试专题
description: 7 个核心设计决策 Q&A、4 个系统设计练习、架构图绘制指南、STAR 故事模板。
category: AI
tags:
  - AI Agent
  - Rust
  - Interview
  - System Design
order: 125
updatedDate: 2025-03-22
difficulty: advanced
status: stable
lastReviewed: 2025-09-10
draft: false
sidebar:
  order: 125
---

把前几篇的技术深度转化为面试中的表达——设计决策 Q&A、系统设计练习、STAR 故事模板。

<!-- more -->

## 项目一句话介绍

> 用 Rust 构建的本地优先 AI Agent 系统。核心特点：确定性权限控制（Policy Governor，< 5ms 决策）、workspace 沙箱安全、可自我进化的反馈闭环（Harness）、Coordinator-Worker 多 Agent 编排。面向个人/小团队，单二进制部署，SQLite 存储。

| 场景 | 侧重 |
|------|------|
| 后端面试 | 强调 Rust、并发模型、DB 设计、Policy 引擎 |
| AI/LLM 面试 | 强调 Agent 循环、工具安全、记忆系统、prompt 工程 |
| 系统设计面试 | 强调分层架构、权限模型、多 Agent 编排、审计链路 |

## 核心设计决策 Q&A

### Q1: 为什么选 Rust 而不是 Python/TypeScript？

约束驱动选择：

1. **Policy 决策 < 5ms** —— Python 的 GC 停顿和解释器开销很难保证 p99 < 5ms。Rust 零成本抽象、无 GC。
2. **单二进制部署** —— local-first，用户不应该装 Python 环境、pip 依赖。Rust 编译出一个静态链接的二进制，拷贝即用。
3. **并发安全** —— Agent 需要同时处理多个 Worker、多个 Channel、异步工具调用。Rust 的所有权系统在编译期消除 data race。

### Q2: Policy 为什么是确定性决策而不是 LLM 辅助？

三个"不允许"：

1. **不允许慢** —— < 5ms。LLM 调用至少 100ms+。
2. **不允许不确定** —— 同样的输入必须给同样的输出。LLM 有温度参数、有幻觉。
3. **不允许贵** —— 每次工具调用都调 LLM 做权限判断，token 成本翻倍。

LLM 只在主链路用一次——Agent 调用 LLM 获取 tool_call 或 final answer。决策、loop 检测、leak 过滤都不经过 LLM。

### Q3: Workspace 沙箱和 Docker/WASM 隔离有什么区别？

够用就好：

1. **复杂度** —— Docker 需要 daemon、镜像管理、网络配置。目标是单二进制部署。
2. **够用** —— workspace 沙箱做三件事：路径校验、工具 Tier 分级、Policy 闸门。
3. **性能** —— 进程隔离有开销。workspace 路径校验是内存操作，< 1ms。

怎么防止 LLM 诱导的路径逃逸？代码层面校验，不信任 LLM 输出——`path_authorization.rs` 禁止 `..`、绝对路径、symlink escape。

### Q4: 为什么需要 Curator 来管理记忆？

防止记忆污染：

1. **幻觉污染** —— LLM 可能把错误信息当事实写入记忆，下次召回形成恶性循环。
2. **记忆膨胀** —— 每次对话都写记忆，召回质量下降。

Curator 守门：写入策略（只记有价值的）、召回策略（FTS5 + 向量 hybrid search）、淘汰策略（过期/低频/低质量清理）。

### Q5: Coordinator-Worker 和单 Agent + 工具链的区别？

1. **并行能力** —— 单 Agent 串行。Coordinator 可同时 spawn 多个 Worker 并行。
2. **失败隔离** —— 单 Agent 一个工具失败，整个 turn 中断。Worker 失败只影响自己。
3. **关注点分离** —— Coordinator 专注计划和验收，Worker 专注执行。

### Q6: SOP 运行时和普通 tool_loop 的本质区别？

有状态 vs 无状态：SOP 支持暂停/恢复、步骤级审计、回滚、预算管理。tool_loop 是"LLM 自主决定做什么"，SOP 是"预定义流程 + Agent 执行每一步"。

### Q7: append-only ledger 的设计动机？

审计三要素：不可篡改（触发器禁 update/delete）、可追溯（action + verdict + bundle_hash）、可回滚（bundle hash 锁定策略版本）。写入失败 best-effort——不改变 runtime verdict。

## 系统设计练习

### 练习 1：设计一个 AI Agent 的权限控制系统

设计思路：

1. 风险分级：每个工具标注风险等级（T0-T3）
2. 运行模式：区分有人值守和无人值守
3. 决策矩阵：风险等级 × 运行模式 → 决策结果
4. 能力租约：无人值守场景预授权，有时间/次数/范围边界
5. 审计链路：每次决策 append-only 记录
6. 性能约束：决策 < 5ms，禁止二次 LLM 调用

### 练习 2：设计一个带记忆的对话系统

设计思路：

1. 双层记忆：短期（当前会话）+ 长期（持久化）
2. 写入策略：Curator 守门，只记有价值的
3. 召回策略：FTS5 关键词 + 向量语义 → hybrid merge
4. 淘汰策略：过期、低频、低质量清理
5. 与 Agent 联动：反射输出 → inferred constraint → 记忆

### 练习 3：设计一个多 Agent 协作框架

设计思路：

1. 角色分离：Coordinator（监督）+ Worker（执行）
2. 生命周期管理：spawn/send/stop/list/get 五个工具
3. 自包含 prompt：Worker 无状态，prompt 包含一切
4. 权限委托：parent lease → child lease（能力子集）
5. 持久化恢复：heartbeat + recovery
6. 教育机制：LectureQueue 注入拒绝原因

### 练习 4：设计一个 LLM 工具调用的安全沙箱

设计思路：

1. 路径校验：禁止 `..`、symlink escape、绝对路径
2. 工具分级：T0-T3，每个工具有风险标注
3. 闸门控制：所有工具调用经过 Policy 决策
4. 输出过滤：LeakSanitizer 检测敏感信息泄漏
5. 审批协商：高危操作需要人工确认
6. 审计记录：所有操作 append-only 记录

## 架构图绘制指南

### 系统分层图

```text
┌─────────────────────────────────┐
│  Channel (CLI/HTTP/WS/cron)     │  ← 入口层
├─────────────────────────────────┤
│  Agent (coordinator + workers)  │  ← 编排层
├─────────────────────────────────┤
│  Policy (governor, < 5ms)       │  ← 决策层
├─────────────────────────────────┤
│  Tools (workspace sandbox)      │  ← 执行层
├─────────────────────────────────┤
│  Harness │ Memory │ Skills      │  ← 能力层
├─────────────────────────────────┤
│  DB (SQLite, single source)     │  ← 存储层
└─────────────────────────────────┘
```

### Policy 决策流程图

```text
Action → [BundleSource]  ─┐
         [LeaseSource]   ─┤
         [HarnessSource] ─┤→ Verdict::fold → Allow/Deny/Defer
         [LoopSource]    ─┤
         [BudgetSource]  ─┘
                               ↓
                          DecisionLedger (append-only)
```

### Agent 状态机图

```text
idle → planning → executing → done
           ↑           ↓
           └── reflecting ←── blocked
```

## STAR 故事模板

### 故事 1：Policy Governor 设计

**S：** 系统需要支持 swarm/cron 无人值守场景，但原有的 harness 阻断机制职责不清。

**T：** 设计一个独立的权限闸门，要求 < 5ms、确定性、可审计、可回滚。

**A：** 新建 `crates/policy` 作为唯一闸门。设计 tier × mode 矩阵 + 多 Source 并行评估 + Verdict::fold 聚合。引入 CapabilityLease 支持无人值守的权限委托。

**R：** 决策 p99 < 2ms。swarm/cron 场景可以无人值守运行。审计链路完整。

### 故事 2：反射机制实现

**S：** Agent 经常重复犯同样的错误——同一个工具调用失败后只是换个参数重试。

**T：** 设计"失败必须改变策略"的机制。

**A：** 实现 I2 不变量：Governor LoopSource 检测重复指纹；REFLECT 阶段强制分析根本原因；Harness 生成 inferred constraint 注入下一轮 prompt。

**R：** 同一失败模式在 30 天内复现率从 ~30% 降到 < 5%。

### 故事 3：多 Agent 编排

**S：** 复杂任务用单 Agent 串行执行效率低，且一个工具失败影响整个任务。

**T：** 设计 Coordinator-Worker 多 Agent 模式。

**A：** 实现 5 个 Worker 管理工具。Worker prompt 自包含。引入层级 Lease（parent → child 能力子集）。实现 Durable Swarm（heartbeat + recovery）。

**R：** 复杂任务执行时间从 ~10min 降到 ~3min。Worker 失败可独立重派。进程崩溃后自动恢复。

## 常见追问与应对

**"这个项目有多少用户？"**
个人/小团队工具，不是 SaaS。但设计上考虑了可扩展性——bundle 可热更新、lease 可从 DB 恢复、Worker 可水平扩展。

**"最难的部分？"**
Policy Governor 的设计。难点不是代码实现，而是决策边界——什么情况下 allow、什么 deny、什么 defer。需要平衡安全性和可用性。

**"如果重新做，会改什么？"**
三个改进：更早引入 Policy；DB 用 rusqlite 而非 sqlx（更轻量）；更早做 SOP 运行时。

**"怎么测试？"**
四层测试：单元测试（Verdict::fold 穷举）；集成测试（Agent + Policy + Tools 完整链路）；边界测试（workspace 逃逸、lease 过期）；验证脚本（cargo check + clippy + db-boundary check）。

## 技术深度展示清单

| 话题 | 深度点 |
|------|--------|
| 权限控制 | "Policy 决策确定性，< 5ms，禁止 LLM 进入决策路径" |
| 安全沙箱 | "workspace 路径校验在代码层面强制，LLM 说什么都不影响" |
| 记忆系统 | "FTS5 + 向量 hybrid search，Curator 守门防止幻觉污染" |
| 多 Agent | "层级 Lease 委托——parent lease spawn 时自动创建 child lease" |
| 审计 | "append-only ledger，触发器禁 update/delete，bundle_hash 锁定策略版本" |
| 进化 | "失败 → 反射 → inferred constraint → 注入 prompt → 避免重复" |
| 可靠性 | "Durable Swarm——heartbeat + recovery，进程崩溃不丢任务" |
| 性能 | "Policy 决策 p99 < 2ms，所有 source 并行评估，Verdict::fold 纯函数" |
