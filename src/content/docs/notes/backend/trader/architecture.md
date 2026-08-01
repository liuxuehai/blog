---
title: 架构总览
description: Workspace 结构、27 个 crate + 2 个 app、核心不变量、四模式统一运行时、事件驱动数据流和与外部系统的集成视图。
category: Backend
tags:
  - Rust
  - Architecture
  - Quantitative Trading
  - System Design
  - CQRS
order: 211
updatedDate: 2026-01-10
difficulty: advanced
status: stable
lastReviewed: 2026-07-20
draft: false
sidebar:
  order: 211
---

一个支持多市场多资产的量化交易系统，27 个 Rust crate 各司其职。所有四种运行模式（Backtest、Replay、Paper、Live）共享同一条决策链。

<!-- more -->

## 产品定位

Trader 是一个完整的量化交易系统，目标是让人人可以"先研究、后回测、再验证，最后真钱跑"，全程复用同一套代码。

### 四个核心承诺

| 承诺 | 含义 | 技术体现 |
|------|------|----------|
| **一米策略四米跑** | 同一策略可以在 Backtest、Replay、Paper、Live 中无缝复用 | AlgorithmEngine 统一链路 + config 区分模式 |
| **风控是闸门，不是建议** | 订单进入 Broker 前有 7 层硬检查 | Risk > Execution > OMS 三层闸门 |
| **数据可复现** | 研究环境和生产环境的行情、费率、洗件一致 | Parquet checksum + crypto rules engine |
| **实盘保护优先于自动化** | 默认不送单、凭证不落盘、实盘下需人工确认 | `order_submit_enabled` = false 直到显式开启 |

### 明确的反目标

- 不是 AlgoTrading 平台——不做 Web IDE
- 不提供交易信号推荐——不做 SaaS
- 不做矿文远——不做 GPU/ASIC 计算
- 不支持社会经济数据——不做非市场因子

> **面试怎么聊**："四个运行模式但共享一条决策链"是最重要的设计决策。在大多数量化系统中，backtest.py 和 live.py 是两套代码——它们的差异导致实盘表现和回测差距巨大。

## 系统分层

```text
┌───────────────────────────────────────────────────────────┐
│  Apps                                                      │
│  ├─ trader-cli    (命令行工具)                              │
│  └─ trader-server (HTTP/WebSocket 服务)                    │
├───────────────────────────────────────────────────────────┤
│  Runtime Layer                                              │
│  ├─ runtime     (运行编排)                                  │
│  ├─ backtest     (历史回测)                                 │
│  ├─ replay       (行情回放)                                 │
│  └─ paper        (Paper 交易)                              │
├───────────────────────────────────────────────────────────┤
│  Decision Pipeline (AlgorithmEngine)                        │
│  ├─ universe     (标的池选择)                               │
│  ├─ alpha        (信号生成)                                │
│  ├─ portfolio    (目标仓位构建)                                │
│  ├─ market_rules (市场规则+费用)                            │
│  ├─ risk         (风控闸门)                                 │
│  ├─ execution    (订单意图拆分)                            │
│  └─ oms          (订单状态机)                               │
├───────────────────────────────────────────────────────────┤
│  Broker / External                                         │
│  └─ broker (券商/交易所通道)                                │
├───────────────────────────────────────────────────────────┤
│  Data & Infrastructure                                    │
│  ├─ data / market_data (行情模型/实时行情)                 │
│  ├─ storage (SQLite + Parquet)                            │
│  ├─ feature_store (研究特征)                               │
│  ├─ events (事件总线)                                      │
│  ├─ config (配置管理)                                     │
│  └─ accounting / metrics                                  │
├───────────────────────────────────────────────────────────┤
│  Core                                                       │
│  └─ core (领域类型)                                         │
└───────────────────────────────────────────────────────────┘
```

## Crate 清单

| Crate | 职责 | 依赖方向 |
|-------|------|----------|
| `core` | 领域类型，不依赖任何业务 crate | 无 |
| `events` | 事件总线 + 事件持久化 | core |
| `config` | TOML 配置解析 | core |
| `storage` | 唯一 SQLite/Parquet 访问 | core, events |
| `data` | 行情模型（bar/tick/slice） | core |
| `market_data` | 实时数据来源 (IBKR 等) | data |
| `market_rules` | 费用、交易单位、load | core |
| `universe` | 标的池选择 | core, data |
| `alpha / strategies` | 信号生成 ← 不进 Broker | core, data |
| `portfolio` | 信号 → 目标持仓 | core |
| `risk` | 风控 | core, portfolio |
| `execution` | 目标→订单 | core, market_rules |
| `oms` | 订单管理 | core, events |
| `broker` | 券商接口 | core, 不进 alpha |
| `backtest/replay/paper/runtime` | 运行模式 | 可以装配 |
| `accounting` | 现金/持仓/净利 | core |
| `metrics` | 绩效指标 | core, accounting |
| `api` | HTTP/WS 输入输出 | core, 不进 storage |
| `indicators` | 技术指标 | core |
| `feature_store` | 因子持久 | storage, core |
| `algorithm` | 统一决策链 | universe→alpha→portfolio→rules→risk→exec→oms |
| `apps/trader-cli` | 命令行入口 | all crates |
| `apps/trader-server` | HTTP 服务端口 | all crates |

## 四条不变量

### I1：策略零分叉

同一个 Strategy trait 实现必须在 Backtest、Replay、Paper、Live 中不需要条件编译。策略不应该知道自己在哪个模式下运行。

### I2：broker 之前必定经过 7 层检查

订单进入 broker adapter 前，必须经过 Universe →Alpha→ Portfolio → Market Rules → Risk → Execution → OMS 这 7 步。不能跳过：

- 从 Market Rules 直接到 Broker（跳过 Risk）
- 从 Risk 回到全量（没有 Execution 拆分）

### I3：存储是唯一真、存储对外读写不可透传

只有 `storage` 可以依赖 SQLx 和 mysql。其他模块通过 storage 提供的 repository 和 facade 操作数据，禁止透传 `SqlitePool`。

### I4：Live 默认不送单

```
order_submit_enabled = false
模拟交易模式不发单
```

真实资金交易必须：
- 显式配置 `broker.` \<type\> + mode
- `risk.order_submit_enabled = true`
- `risk.real_trading_mode = true`（不能默认）
- 每单都要通过 reconciliation 对账
- 凭证只在环境变量/secret 来源，不写入 SQLite/Parquet/日志

## 事件驱动数据流

```
请求 → API/CLI → Runtime Manager
                → 分配 Run 资源
                → 事件 Bus → 广播
                → AlgorithmEngine 执行步骤
                  → 在每个步骤间可以中断

异步事件广播: WebSocket / tracer / event_store
            └─ 所有订阅器
```

### Event Envelope

所有事件都包裹在同一格式中：

```rust
pub struct EventEnvelope {
    pub event_id: String,
    pub timestamp: i64,
    pub run_id: String,
    pub event_type: String,
    pub typ: EventType,           // trade, risk, lifecycle, system, ...
    pub level: EventLevel,       // info, warn, error
    pub data: serde_json::Value,
}
```

### 事件 persistence

```sql
CREATE TABLE event_store (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    level TEXT NOT NULL,
    ts_ms INTEGER NOT NULL,
    payload JSON NOT NULL
);
```

用于离线审计和 replay。系统日志 (system_logs) 包含真实的 tracing 输出，与高层次事件分开存储。

## 关键 design tradeoffs

### 为什么用算法模式而非独立模块串联

在一些量化系统中，signal、portfolio、execution 是三个独立服务。Trader 选择将它们在一个进程内的 Algorithm Engine 中连续同步执行。

原因：
- 同步执行减少 0-5ms 的时间误差
- 不允许部分模块未更新就开始下一轮
- 调试和恢复更简单（没有跨步骤的消息丢失问题）
- 性能不需要 RPC 等额外通信

### 为什么策略不能读 Storage

因为策略在 Replay 和 Live 模式下没有内存概念——无法访问磁盘 I/O 读取 SQLite/Parquet。策略只能从 6 步的前驱 affordances 处获得选项（当前价格、持仓、signal）来决策。这样可以避免策略在设计时偷偷阅读未来信息。

### 实盘保护的 3 种状态

| 模式 | 送单 | 凭证来源 | 用途 |
|------|------|----------|------|
| Simulated | 不送单 | 无 | 开发、调参 |
| Testnet | 送单（login:test） | env | 验证 broker |
| Live | 送单（område login:real） | env | 真金白银 |

每个券商交易所批次必须跨这三种模式才能确保从不使用假数据伪装 trading。
