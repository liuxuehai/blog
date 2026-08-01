---
title: Policy 治理
description: Governor 闸门设计、Tier × Mode 矩阵、多信号源并行评估、CapabilityLease 层级委托、Defer 机制。
category: AI
tags:
  - AI Agent
  - Rust
  - Policy
  - Security
  - Authorization
order: 123
updatedDate: 2025-02-15
difficulty: advanced
status: stable
lastReviewed: 2025-08-20
draft: false
sidebar:
  order: 123
---

Policy 是整个系统唯一的权限闸门——每次工具调用必须经过它，决策 < 5ms、确定性、可审计。

<!-- more -->

## 为什么需要 Policy Governor

### 问题场景

场景一：swarm worker 在无人值守时调用 `shell` 执行危险命令——谁来阻止？

场景二：cron 定时任务连续 10 次调用同一个失败的工具——怎么检测？

场景三：coordinator spawn 了 5 个 worker，每个都想执行高危操作——权限怎么隔离？

### 之前的方案（已废弃）

早期 `harness` 承担了部分阻断语义——通过 `MechanicalEnforcer` 和 `RealTimeSensor` 检测失败模式并阻止。问题：职责过重（既要记录反馈，又要阻断）、阻断逻辑和反馈逻辑耦合、没有统一的审计链路。

### 现在的方案

```text
Harness（信号源）→ Policy（唯一闸门）→ Tools（执行）
```

- `harness` 降级为**信号源**，只提供"这个 agent 失败了多少次"等信息
- `policy` 成为**唯一闸门**，所有 allow/deny/defer 决策都在这里产生
- 决策路径**禁止 LLM、禁止网络调用、禁止阻塞 IO**

> **面试怎么聊：** 讲清楚"为什么把阻断权从 harness 移到 policy"——职责单一化。harness 是"经验库"，policy 是"法官"。法官可以参考经验库的记录做判决，但经验库不能直接执行判决。

## 核心数据模型

### 四层风险分级（Tier）

```rust
pub enum Tier {
    T0Safe,        // 只读，无需 lease
    T1Auth,        // 工作区内写入，非交互模式需 lease
    T2Destructive, // 外部网络/跨进程，始终需显式授权
    T3Blocked,     // 永久禁用（kill switch）
}
```

每个工具通过 `ToolDef::tier()` 标注风险等级：

| Tier | 典型工具 |
|------|----------|
| T0 | `file_read`, `glob`, `grep`, `web_search`, `memory_recall`, `task_list` |
| T1 | `file_write`, `file_edit`, `memory_store`, `task_create`, `worker_spawn` |
| T2 | `shell`, `web_fetch`, `worker_stop` |
| T3 | （暂无，预留 kill switch） |

### 三种运行模式（Mode）

```rust
pub enum Mode {
    Interactive,  // 有人在线，可以等人审批
    Swarm,        // 多 agent 自主运行，无人值守
    Cron,         // 定时触发，无人值守
}
```

### 决策结果（Verdict）

```rust
pub enum Verdict {
    Allow { lease_id: Option<String>, ttl: Option<DateTime<Utc>> },
    Deny { reason: DenyReason, rule_hits: Vec<String>, evidence_refs: Vec<EvidenceRef> },
    Defer { target: DeferTarget, deadline: Option<DateTime<Utc>> },
}
```

**Deny 的原因码：**

| DenyReason | 含义 |
|------------|------|
| `TierBlocked` | 当前 mode 下该 Tier 被矩阵禁用 |
| `LeaseMissing` | 需要 lease 但没有可用 lease |
| `LeaseExpired` | lease 已过期或耗尽 |
| `BudgetExceeded` | token/turn/seconds 预算用完 |
| `LoopDetected` | 检测到重复失败 |
| `HarnessFailureStreak` | harness 报告连续失败 |
| `PathDenied` | workspace 路径越界 |
| `Sanitizer` | 敏感信息泄漏风险 |

**Defer 的路由目标：**

| DeferTarget | 含义 |
|-------------|------|
| `Human` | 路由到人工审批 |
| `LectureQueue` | 把拒绝原因注入 worker 下一轮 prompt |
| `EscalationChannel` | 升级到父 coordinator |

> **面试怎么聊：** Verdict 的三态设计（Allow/Deny/Defer）是关键。Defer 不是"不知道怎么办"，而是明确的路由——给人、给 lecture、给升级。这让"需要更多信息"变成了一种确定性的决策。

## 决策引擎（DecisionEngine）

### 架构

```text
DecisionEngine
  ├─ sources: Vec<Arc<dyn DecisionSource>>
  └─ ledger: Option<Arc<dyn DecisionLedger>>
```

每个 `DecisionSource` 实现 `evaluate(&ctx) -> Option<SourceVerdict>`，含 `priority()` 用于聚合排序。

### 六大信号源

| Source | 职责 | 决策依据 |
|--------|------|----------|
| **BundleSource** | tier × mode 矩阵 | bundle.toml 配置 |
| **LeaseSource** | 能力租约检查 | 当前 agent 的活跃 lease |
| **HarnessSource** | 失败模式信号 | harness 记录的失败次数/模式 |
| **LoopSource** | 重复检测 | tool_call 指纹出现频率 |
| **BudgetSource** | 预算检查 | token/turn/seconds 消耗 |
| **Lint/Realtime** | 确定性规则 | 路径校验、参数校验等 |

### 决策流程

```text
1. 并行执行所有 source (join_all)
2. 按优先级聚合 (Verdict::fold)
3. 写入 ledger (best-effort，失败只记日志)
4. 无 source 响应 → 默认 Deny(TierBlocked)
```

### Verdict::fold 聚合算法

确定性优先级聚合：

1. 按 `SourcePriority` 降序排列
2. **任何 Deny → 最高优先级的 Deny 胜出**（rule_hits 和 evidence_refs 取并集）
3. **任何 Defer → 最高优先级的 Defer 胜出**（deadline 取最早值）
4. **全部 Allow → 最高优先级的 Allow 胜出**（ttl 取最早值）
5. **无 source 响应 → None**（调用方默认 Deny）

**关键特性：Deny 优先**——任何一个 source 说不行，就不行。这是安全设计的基本原则：默认拒绝，显式允许。

> **面试怎么聊：** 讲 `Verdict::fold` 时重点讲"Deny 优先"和"并行评估"。并行保证性能（< 5ms），Deny 优先保证安全。聚合算法是纯函数，无副作用，可单元测试。

## 能力租约（CapabilityLease）

### 设计动机

在 swarm/cron 模式下，没有人可以实时审批。但 worker 可能需要执行 T1/T2 操作。答案：**预先授予有限能力的租约**。

### 数据模型

```rust
pub struct CapabilityLease {
    pub lease_id: String,
    pub agent_id: String,
    pub parent_lease_id: Option<String>,     // 层级关系
    pub capabilities: Vec<Capability>,       // 授予的能力集合
    pub mode: Mode,                          // 适用模式
    pub bundle_hash: String,                 // 锁定策略版本
    pub budget_json: Option<String>,         // 预算约束
    pub granted_at: DateTime<Utc>,
    pub expires_at: Option<DateTime<Utc>>,   // 时间边界
    pub max_uses: Option<u32>,               // 使用次数边界
    pub used: u32,                           // 已使用次数
    pub status: LeaseStatus,
}
```

### Capability 类型

```rust
pub enum Capability {
    Tool(String),           // 允许使用某个工具
    PathPrefix(String),     // 允许访问某个路径前缀
    Tier(Tier),             // 允许某个风险等级的所有工具
    Custom(String),         // 自定义能力
}
```

子集语义：`capability.is_covered_by(parent)` —— 同类型精确匹配；`PathPrefix` 用 `starts_with`；跨类型永远不覆盖。

### Lease 生命周期

```text
创建 (Active)
  ├─ 使用 (used += 1)
  │   ├─ used >= max_uses → Consumed
  │   └─ 继续使用
  ├─ 过期 (now >= expires_at) → Expired
  ├─ 预算耗尽 → BudgetExhausted
  └─ 显式撤销 → Revoked
```

### 层级 Lease（delegation）

```text
Coordinator 的 parent lease
  ├─ worker_spawn → 自动 delegate_child(parent_lease, subset)
  │   └─ child lease: 能力是 parent 的子集
  └─ worker_spawn → 另一个 child lease
```

- `worker_spawn` 时 Policy 自动创建 child lease
- child 的 capabilities 必须是 parent 的子集（`is_subset_of` 检查）
- parent lease 过期/撤销 → 所有 child 自动失效

> **面试怎么聊：** Lease 机制是"无人值守场景"的核心解决方案。重点讲"层级 lease"——coordinator 的 lease 是"大权限"，spawn worker 时自动分发"小权限"。这比"给每个 agent 完整权限"安全得多。

## PolicyBundle 配置

### tier × mode 矩阵

```toml
[matrix.interactive]
T0 = "allow"; T1 = "allow"; T2 = "defer_human"; T3 = "deny"

[matrix.swarm]
T0 = "allow"; T1 = "allow_if_lease"; T2 = "deny"; T3 = "deny"

[matrix.cron]
T0 = "allow"; T1 = "allow_if_profile"; T2 = "deny_with_lecture"; T3 = "deny"
```

| | T0 Safe | T1 Auth | T2 Destructive | T3 Blocked |
|---|---|---|---|---|
| **Interactive** | allow | allow | defer_human | deny |
| **Swarm** | allow | allow_if_lease | deny | deny |
| **Cron** | allow | allow_if_profile | deny_with_lecture | deny |

`bundle_hash` 锁定策略版本。所有 lease 和 decision 记录都携带 `bundle_hash`，保证策略变更可追溯、lease 在 bundle 变更后可能失效、审计链路完整。

## DecisionLedger（审计链路）

设计原则：**append-only**（触发器禁 update/delete）、**best-effort**（写入失败不改变 runtime verdict）、**完整追溯**（每个 decision 记录 action、verdict、duration、bundle_hash）。

审计查询能力：按 agent_id、按 tool、按 evidence、按时间范围。

## 面试高频问题

**Q: 为什么 Policy 决策要 < 5ms？**
因为它是工具调用的必经路径。如果决策需要 100ms，一个 agent turn 可能调用 10+ 工具，光决策就 1s+。关键是所有 source 都是确定性规则（查表、查 lease、查指纹），没有 I/O。

**Q: 为什么不用 LLM 做权限决策？**
三个原因：LLM 不确定性——同样输入可能不同输出，审计困难；延迟——LLM 调用至少 100ms+，远超 5ms 预算；成本——每次工具调用都调 LLM，token 成本翻倍。

**Q: Lease 和 RBAC 有什么区别？**
RBAC 是静态角色绑定——"你是 admin，所以你能做所有 admin 能做的事"。Lease 是动态能力授予——"你现在能用 shell，但只能用 3 次，5 分钟后过期，而且只能在 /tmp 下操作"。Lease 有时间边界、使用次数边界、能力子集约束。

**Q: 如果 Policy 引擎崩溃了怎么办？**
默认行为是 Deny——如果决策引擎无法给出 verdict，返回 `Deny(TierBlocked)`。这是"安全失败"原则：不确定时拒绝。
