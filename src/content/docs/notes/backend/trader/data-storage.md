---
title: 数据与存储
description: SQLite 交易状态持久化、Parquet 研究数据存储、Polars 大数据计算、MarketSlice 统一行情模型、Feature Store 和 Manifest 验证。
category: Backend
tags:
  - Rust
  - SQLite
  - Parquet
  - Polars
  - Data Engineering
  - Feature Store
order: 215
updatedDate: 2026-05-20
difficulty: advanced
status: stable
lastReviewed: 2026-08-01
draft: false
sidebar:
  order: 215
---

量化交易系统的存储分成两类：交易状态必须精确到每一位（SQLite），研究数据量可以很大需要高效（Parquet）。

<!-- more -->

## SQLite 存储

### 为什么不是 PostgreSQL

SQLite 的零配置、单文件形态允许：

- 一天的回测产生的状态 > 9999 万行，可以在一个 SQLite 文件中存储
- 无服务器，不需要 docker - 在 CLI 和 Server 中同样直接使用
- SQLite 作为 repository 后端，只需一次 migration

### 核心表

```sql
-- 运行表
runs            (id, name, mode, status, config, ...)
run_configs     (id, run_id, config_id, ...)

-- 账本表
orders             (id, client_order_id, broker_order_id, account_id, ...)
fills             (id, order_id, broker_order_id, price, qty, fee, ...)
positions      (run_id, account_id, symbol, qty, avg_price, ...)
account_balances (run_id, account_id, asset, total, available, ...)

-- 快照表 (审计)
portfolio_snapshots (run_id, ts_ms, account_id, total_equity, cash, ...)
cash_snapshots     (run_id, ts_ms, currency, cash, available_cash, ...)
position_snapshots (run_id, ts_ms, symbol, position_side, qty, avg_price, ...)

-- 审计表
event_store     (id, run_id, event_type, level, ts_ms, payload)
risk_records    (id, run_id, risk_type, decision, reason, ...)
reconciliation_log (id, run_id, alert_type, drift, resolved, ...)

-- 配置控制
configs          (id, name, version, content, state, published, ...)
config_approvals (id, config_id, actor, action, env, reason, ...)
```

### migration 策略

所有 migration 脚本在 `migrations/` 文件夹：

```
0001_init.sql
0002_audit_predictions.sql
0003_market_rules.sql
0004_contract_accounting.sql
0005_reference_snapshots_and_ops.sql
0006_config_lifecycle.sql   ← 配置版本控制
...
0013_config_approvals.sql   ← 审批流
```

**关键**：每次 migration 都无法回滚（SQLite 不支持事务 DDL），因此必须向前兼容。

### repository pattern

```
storage：                   其他 crate：
  write_via_command()  <--  command (write)
  read_via_repo()     -->  read (ref)
  
Api layer：             read model ≠ storage record
```

## Parquet + Polars

Parquet 用于研究数据和批量数据——比 CSV 矿读 10 倍，对列存储。

### 数据源结构

```
datasets/
├── crypto/
│   ├── BTCUSDT-1m-2024.csv
│   └── ETHUSDT-1m-2024.parquet
├── stocks/
│   └── NVDA-2023.parquet
└── benchmarks/
    └── sp500-2024.parquet
```

### MarketSlice 统一模型

多个标的在同一个时间点用一个 `MarketSlice` 表示：

```rust
pub struct MarketSlice {
    pub ts: i64,
    pub bars: Vec<SymbolBar>,
    pub traded_size: Option<Decimal>,
    pub high_price: Option<Decimal>,
    pub vwap: Option<Decimal>,
}
```

所有数据源通过 codec 提供统一的切片供 AlgorithmEngine 使用。

### Feature Parquet Schema

```
研究特征必须包含：
- run_id
- symbol
- name
- ts_ms
- value
- version (corresponding to config version)
```

## Backtest 数据接入

Backtest 模式的数据输入流程：

```
[data]
source = "parquet"
path = "datasets/crypto/ETHUSDT-1m-2024"

[[data.inputs]]             # <- 多标的格式
source = "parquet"
path = "..."
symbol = "ETHUSDT"
hist = "1m"
```

数据读取和解析仅在 data crate 进行。Backtest runtime 通过 Adapter 付款，不处理 Parquet 编码。

## Feature Store

Feature Store 是研究到生产的桥接：

```
Research (jupyter) ──┐
                     └→ Parquet file → FeatureRecord
                        ├─ 读取
                        ├─ 校验 manifest
                        └→ 策略运行时无需 SQLite I/O
```

### Feature Manifest

```toml
[feature_store]
  name = "momentum_alpha"
  path = "datasets/features/001.parquet"
  checksum = "sha256:..."
  symbols = ["BTCUSDT", "ETHUSDT"]
  features = ["close_5ma", "future_ret_5"]
  version = 1
  rows = 120000
  time_range = {from = 1700000000000, to = 1720000000000}
```

验证逻辑：

- 检查路径存在
- 检查 checksum 匹配
- 检查 symbol 覆盖
- 检查行数是否在范围内

### Feature Record

```rust
pub struct FeatureRecord {
    pub run_id: String,
    pub symbol: String,
    pub name: String,
    pub_ts_ms: i64,
    pub value: Decimal,
    pub version: u32,
}
```

各策略只接收这些只读 record，仅通过 context 访问。

## Polars 集成

```rust
// 读取 Parquet 并批量计算列
use polars::prelude::*;

// e.g. 计算 20 日波动率
let df = df.with_column(
    col("close")
        .pct_change(1)
        .rolling_std(20)
        .alias("volatility_20")
);
```

Polars 只在 `data` 和 `backtest` 中使用，不在 engine 中。

## 面试高频问题

**Q: 为什么 SQLite 不用 Postgre？**  
A: 交易系统中的每次状态更新发生在同一进程中。SQLite 避免了 TCP/IP 连接延迟——这是最简单的纯本地设置。每次交易产生的记录数大概在 10/s 以下，SQLite 轻松处理。

**Q: Parquet 和 SQLite 为什么分离？**  
A: 两者属于不同边：历史数据（量极大、不需要更新）放入 Parquet，便于研究和分析。运行时状态（最小、频繁更新、需事务）放入 SQLite。如果将微价格数据存进 SQLite，查询变慢；如果碎将运行状态存储 Parquet，就无法做事务更新。

**Q: Feature Store 和 Alpha 的区别是什么？**  
Feature Store 输出 non-intelligent 数据；Alpha 层输出买入/卖出信号。Feature Store 的数据仅用于读取，Alpha 决策链中用这些数据来计算。

**Q: 为什么使用 Manifest 校验？**  
A: 因子特征可能随时间漂移——模型训练时的因子分布与推理时的分布若不同，特征的 checksum 会变，manifest 立即捕获。

**Q: SQLite migration 为什么不能回滚？**  
A: 因为迁移通过 `000X_name.sql` 手工执行，没有 DDL 事务回滚。设计 migration 时总是只增加新列、不删除和修改老列——避免破坏生产数据结构。
