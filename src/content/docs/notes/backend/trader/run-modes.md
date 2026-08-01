---
title: 运行模式体系
description: Backtest/Replay/Paper/Live 四种运行模式的差异与复用、RuntimeManager、AlgorithmEngine 统一链路、Run 生命周期和配置切换。
category: Backend
tags:
  - Rust
  - Quantitative Trading
  - Runtime
  - Backtest
  - Replay
  - Paper Trading
order: 212
updatedDate: 2026-02-05
difficulty: advanced
status: stable
lastReviewed: 2026-07-20
draft: false
sidebar:
  order: 212
---

四合一运行体系是最独特的设计——不是四个不同的模式在 run.py / live.py / replayer.py 中独立存在，而是统一在一个 `AlgorithmEngine` 之下，模式差异只在数据和事件来源。

<!-- more -->

## 四种模式对比

| 维度 | Backtest | Replay | Paper | Live |
|------|----------|--------|-------|------|
| **行情来源** | 历史 Parquet/CSV | 历史 Parquet，重放 | 实时市场流 | 实时市场流 |
| **时间控制** | 模拟时钟，按 bar 推进 | 跟随历史时间，可按倍速/seek | 真实时间 | 真实时间 |
| **订单执行** | 虚拟成交，成交模型 | 虚拟成交 | 模拟/测试券商/真实 paper | 真实券商 |
| **下单** | 不送 | 不送 | 可选送单至 Broker | 送单至 Broker |
| **数据存储** | SQLite + Parquet | SQLite + Parquet | SQLite + Parquet | SQLite + Parquet |
| **人类交互** | 1 次启动 | 可暂停/恢复/seek | 可停/止 | 可监控 |
| **可复现性** | 完全可复现 | 可复现 | 不可复现(真实市场) | 不可复现 |

## 统一的 AlgorithmEngine

所有模式共享同一条 Algorithm Engine：

```text
AlgorithmEngine.run_once() {
    // 1. 裁剪 Universe - 今天哪些标的可交易
    universe.select()
    
    // 2. 信号生成 - 每个策略输出 Signal 列表
    alpha.compute()
    
    // 3. 组合构建 - 信号 → 目标持仓
    portfolio.construct()
    
    // 4. 市场规则校验 - 最小手数/tick/lot 等
    market_rules.validate()
    
    // 5. 风险控制 - 7 层 check
    risk.evaluate()
    
    // 6. 执行拆分 - 目标持仓 → 多笔委托
    execution.split()
    
    // 7. 委托管理 - 发送 OrderIntet
    oms.submit()
}
```

> 各模式的区别在哪儿？

区别在 **config**——config 的选择在不同模式下自动选择不同的 adapter：

```
BacktestConfig  → HistoricalMarketDataSource, FakeClock, SimulatedBroker
ReplayConfig    → HistoricalBarESource, ReplayClock, SimulatedBroker
PaperConfig     → LiveDataSource,    RealClock,    PaperBroker
LiveConfig      → LiveDataSource,    RealClock,    LiveBroker
```

## 周期与 pacing

所有运行模式的最小时间精确到 `market.bar` 事件。不同 market 的 bar 频率：

- Crypto 的 1m、5m 和 1h
- Stock 的 1d

每种模式下 `market.bar` 发布的方式不同：
- **Backtest**：从前预先读取所有 bar，逐个推入 engine
- **Replay**：按配置速率从历史数据流中按 bar feed 推入
- **Paper/Live**：外部实时行情到达后，根据最新 bar 启动 engine

## RunSpec 和 RuntimeManager

```rust
pub struct RunSpec {
    pub run_id: String,
    pub mode: RunMode,          // 四选一
    pub strategy_name: String,
    pub symbols: Vec<String>,
    pub start_date_ms: i64,
    pub end_date_ms: Option<i64>,
    pub config_ref: ConfigRef,  // 配置版标识
}
```

### RuntimeManager 生命周期

```text
                        POST /backtest
                        ┌───────────────────┐
                        │   RuntimeManager   │ loading SQLite + Parquet
                        └────────┬──────────┘
                                 │ construct RunSpec
                                 ▼
                        ┌───────────────────┐
                        │  BacktestRuntime   │
                        │  ReplayRuntime     │
                        │  PaperRuntime      │
                        │  LiveRuntime       │
                        └────────┬──────────┘
                                 │
                                 ▼
                        ┌───────────────────┐
                        │  AlgorithmEngine   │  ← 统一决策链
                        └───────────────────┘
```

每个 runtime 负责：
- 启动和停止（cancel/stop）
- 消费 market.bar 事件
- 调用 AlgorithmEngine
- 保持可恢复状态

生命周期管理：

```
Running→Paused→Resumed→Canceled→Terminated
                 ↓
               Stopped   ← 只能来自用户或限风
```

## Replay 控制

Replay 运行是唯一支持暂停、恢复和 seek 的模式。适合回溯调试策略：

```
Pause at bar 120 → inspect → seek to bar 50 → 从 bar 50 重新播放
```

基础端点：

```
POST /api/v1/replay/{run_id}/pause      ← 暂停
POST /api/v1/replay/{run_id}/resume     ← 恢复
POST /api/v1/replay/{run_id}/seek/{offset}   ← 跳转到 offset bar
POST /api/v1/replay/{run_id}/speed/{speed}    ← 调整倍速 (0.5, 1, 2, 5)
```

WebSocket 推送 `replay_state` 事件，前端可以展示实时进度条。

## 策略零分叉的成就

示例：MovingAverage 策略在所有 4 种模式下共享同一代码：

```rust
// 这段代码在 4 种模式下完全复用
impl Strategy for MovingAverageCrossover {
    fn on_bar(&self, bar: &SymbolBar, context: &StrategyContext) -> Vec<Signal> {
        let fast = self.compute_ema(bar.close, self.fast_window);
        let slow = self.compute_ema(bar.close, self.slow_window);
        
        if fast > slow {
            vec![Signal::Long { symbol: bar.symbol.clone(), confidence: Decimal::ONE }]
        } else if fast < slow {
            vec![Signal::CloseLong { symbol: bar.symbol.clone() }]
        } else {
            vec![]
        }
    }
}
```

StrategyContext 在四种模式下提供不同的数据，但 strategy 不需要知道。

| 模式下 | 提供的 `market_slice` | strategy 需要关心的 |
|--------|---------------------|---------|
| Backtest | 单个 bar 的数据窗口 | 返回 Signal 数组 |
| Replay | 同上 | 同上 |
| Paper | 实时 bar | 同上 |
| Live | 实时价格 + 订单 | 同上 |

## 面试高频问题

**Q：为什么策略不能自己读 SQLite？**

A：因为策略在 4 种模式下不会有相同的资源——Backtest 用 Parquet 文件，Live 用实时数据流，存储的回读 I/O 在两种模式下的延迟和内容根本不同。限制策略只从前驱 affordances 读取意味着策略代码在 4 种模式下完全相同。

**Q：Reconciliation 的作用是什么？**

A：Reconciliation（对账）是在 Live 和 Paper 模式下被触发的兜底检查——它是最后一道核对，确保 Internal State 和 Broker State 一致。如果某笔订单被交易所拒绝但 OMS 没有捕获，Reconciliation 会发现这个 drift 并触发告警。

**Q：Cost 为什么需要 Trade 分离？**  
A：因为 Dead code 移除：回测时不需要交易费，但 Live 时需要。MarketRules 层分离了\(cost_rules\)和\(trading_rules\)，让回测只执行 num的 cost 模型，而 Live 和 Paper 执行完整的引擎。

**Q：为什么没有 Canvas-Clock 独立模块？**  
A：clock 内置在每个 runtime 里。因为：
- Backtest Clock 是线性推进
- Replay 支持 pause/resume/seek
- Paper Clock 跟随真实时间
- Live 时钟也是真时间的基础

如果 Clock 做成一个独立模块，会产生复杂的状态同步，RuntimeManager 需要同时同步多个 clock——这种复杂性不需要，把 Clock 都放进 Runtime 的内部结构更训练。
