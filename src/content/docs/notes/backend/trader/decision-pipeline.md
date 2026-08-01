---
title: 决策链
description: AlgorithmEngine 的 7 步顺序执行、各步骤的输入输出、Bipartite 拆单、OMS 状态机、Polaris 的衔接和 Go-No-Go 决策点。
category: Backend
tags:
  - Rust
  - Quantitative Trading
  - Algorithm Engine
  - Pipeline
order: 213
updatedDate: 2026-02-28
difficulty: advanced
status: stable
lastReviewed: 2026-07-25
draft: false
sidebar:
  order: 213
---

从行情到达到达订单发出的完整路径。一条不可裁剪、不可梯级的 7 步管道。

<!-- more -->

## 为什么顺序执行

交易系统中的每个步骤有确定的先后依赖关系：

- 你不能在 Risk 拒绝后再让 Execution 拆分订单
- 你不能在没有 Universe 选择前就生成信号（否则可能交易死符号）
- 你不能在没有 OMS 的订单 ID 前就让 Broker 查询状态

同步执行保证了每一轮的 finality：这步的结果就是下一步的输入，没有并行分支的后果。

## 步骤详解

### Step 1: Universe Selection

```
Input: MarketSlice (当前时点的所有标的)
Output: Vec<Symbol> (本轮可交易的标的)
```

允许的选法：

- `static`：预定义列表（如 ["NVDA", "AAPL"]）
- `filtered`：按规则筛选（如 market more than 1B 市值）
- `ranked`：按某个特征排名（如成交量 top N）
- `require_current_data`：只选有当前数据的

### Step 2: Alpha Generation

```
Input: Vec<Symbol> + MarketSlice
Output: Vec<AlphaSignal>
```

Alpha Signal 信息：

```rust
pub struct AlphaSignal {
    pub symbol: String,
    pub direction: SignalDirection,  // Long, Short, CloseLong, CloseShort
    pub confidence: Decimal,         // 0.0-1.0
    pub source: String,              // 策略名
    pub multi_signal: bool,          // NET: 最终映射
}
```

策略可以多票。多信号聚合的单一一指向：

```rust
fn net_signals(signals: &[Signal]) -> Signal {
    // 1. 收集所有 Long 的 confidence
    // 2. 收集所有 Short 的 confidence
    // 3. Net = Long - Short
    // 4. 按成交率过滤
}
```

### Step 3: Portfolio Construction

```
Input: AlphaSignals + CurrentPositions
Output: Vec<TargetPosition>
```

信号转成目标仓位的过程：

```
Long{ NVDA, 0.8 }  + Current_position(NVDA=100) → 保持不变
CloseLong{ AAPL, 0.6 } + Curen_crotaion(AAPL=50) → TargetPosition(AAPL=0)
```

合建容提供不同类型：

- `equal_weight`：每个信号 1/N
- `signal_confidence`：按 confidence 加权
- `risk_parity`：高低波动性均衡

### Step 4: Market Rules

```
输入：TargetOrders + BrokerInfo
输出：ValidationResult + eff
```

核心校验：

- 最小交易量 (min_qty)
- 最小名义价值 (min_notional)
- Tick 大小 (price should be divisible by tick)
- 成本 (fee)：买方费用、卖方费用、政府印花税、上限 fee

Null rule 的模式不允许交易规则中的自定义排序，费用按解密规则计算。

### Step 5: Risk Management

```
输入： TargetPositions + CurrentAccount
输出：RiskVerdict { Approved, Rejected(vec<Reason>) }
```

7 项风险检查：

| # | 检查项 | 含义 |
|---|--------|------|
| 1 | max_order_qty | 单票下单量不能再制最大 |
| 2 | max_order_notional | 单票价值不能超 limit |
| 3 | cash_buffer | 下的总名义价值不能超过可用现金x buffer% |
| 4 | trading_halt | 某些标的是否交易停止 |
| 5 | short_permission | 融券限制 |
| 6 | gross_exposure | 总风险敞口 |
| 7 | margin_limit | 保证金使用比例 |

> **面试怎么聊**：Risk 是 broker 前最后一个闸门。破坏这个步骤的入口等于让策略偷偷执行真实资金。所以 Risk 也只能有自己的 rule 引擎，不在策略处运行。

### Step 6: Execution

```
输入：Risk-Appended Targets
输出：Vec<OrderIntent>  (下单指令)
```

从 Target 到 Order：

- 将一个数量为 500 的 Target 分割成 5 个 100 的 Order (twap soaking)
- 针对 reduce-only、post-only + 不同的仓位处理
- 限制从一次 risk 只发出最多一个的 tick-based order 不能多

### Step 7: OMS

```
输入：OrderIntent[]
输出：BrokerOrder 状态列表
```

Order Identification mapping：

```text
ClientOrderId (内部固定 ID) ↔ BrokerOrderId (外部 ID, 可对 OpenOrders API)
```

下单流程：

1. 生成 ClientOrderId 
2. 向 Broker 发送请求 (submit_order)
3. 接收经纪商通知 (BrokerOrderId)
4. 状态追踪：
   - New → PartiallyFilled → Filled
   - New → Rejected
   - PendingCancel → Canceled
5. 根据 Broker 反馈更新 OMS

## 交易数据传输

```
Strategy code 输出 Signal
    ↓ (part of AlphaSignal)
Portfolio Builder
    ↓ (convert to TargetPosition)
Risk Engine
    ↓ (approve or reject)
Execution Split
    ↓ 转换为 OrderIntent(s)
OMS
    ├─ submit →  Broker →  FillEvent
    └─ wait for FillEvent → update OMS record
```

## Broker 依赖方向

```
OMS  → broker
Risk → OMS
execution → OMS
backtest → paper → brokerage
↑ 不可反转
```

面试高频问题

**Q：信号整合为什么能被多策略发起的信号彼此抵消？**  
A: Multiple signal sources 可以发相同方向信号（Long/Long）→ 互补，或相反方向信号（Long/Short）→ 彼此抵消。博弈员中，白负合并的公式是 `max(0, long_signal - short_signal)`——永远不会产生一个"debated"信号。

**Q: Execution 为什么要拆分成多个小人单？**  
A: (1) 分拆大订单参数减少对市场冲击；(2) 由于分成多个订单，分别发送到不同做市商时可不共享精力；(3) 并行 submit 多个订单导致 broker 并发限制。

**Q: market_rules 为什么要在风险之前执行？**  
A: 无效交易（小于最小交易单位）或不完整的 tick 不应递过 Risk——因为这会导致 Risk 错误拒绝。Market rules 先执行可以确保递送至 Risk 的订单都已经是格式化的。

**Q: OMS 状态机状态存储在哪里？**  
A: OMS 状态存储在 SQLite 中，每个状态更新都触发 `OrderUpdated` 事件发往 WebSocket 订阅者，前端实时看到状态链。
