---
title: 风控与实盘安全
description: Risk 7 层闸门、Live Guard 守护、Reconciliation 对账机制、配置版本治理、认证审批和 Broker 抽象防护。
category: Backend
tags:
  - Rust
  - Risk Management
  - Security
  - Live Trading
  - Audit
order: 214
updatedDate: 2026-04-10
difficulty: advanced
status: stable
lastReviewed: 2026-08-01
draft: false
sidebar:
  order: 214
---

对企业级量化系统来说，风控不是选项，而是物理定律般的约束。Trader 在 broker 前设置了 3 层闸门，以及一组持续的核对和审批机制。

<!-- more -->

## 风控的三个层面

```text
1. Market Rules  — 是否合法
2. Risk Engine    — 是否安全
3. Reconciliation — 是否正确
```

每一层独立、不可跳过、决策不可越级。

## Market Rules 层

关键检查：

| 规则 | 示例 | 后果 |
|------|------|------|
| 最小数量 | 合约整型 = 1 | 拆分订单无效 |
| 最小名义价值 | BTC buy = 10 USDT | 微alue 不可匹配 |
| 价格 tick | 价格 100.1$ (tick 0.02$) 是有效 | 无效的 tick 被舍入或被拒绝 |
| 手续费 | 每秒 0.1%， 0.04% | cost\< can't exceed order value |
| 交易边境 | 仅允许 boost 交易的时常 | 夜间时段不触发 |

## Risk Engine 7 网关

```text
每条订单必须 7 关通过
    → 任一不合格
     → Rejected(OfferedWithReason)
    
Additional: 不能提前撤
```

### 错误恢复

当一项被 reject 时

```
RiskRecord {
    step: "margin_limit",
    reason: "Exceeds 2.0x leverage cap",
    advice: "Reduce order qty from 1000 to 800"
}
```

任一中继都不应该自动重试，必须等用户/ operator 手动修复。

## Live 守护

在 Live mode 下有三层额外保护：

### 1. 订单闸门

```toml
[broker]
kind = "ibkr"
mode = "live"
order_submit_enabled = false  ← 默认关闭
```

只有此开关设为 true 才会真正发送。在 CLI 和 Web 中都能控制这个规则。

### 2. 无凭证存储

Broker 凭证只从环境项中读取，不写入：

- SQLite
- Parquet
- Config 字段
- 日志文件
- Event payload

```
来源：
- IBKR Trade：env("QQ_ACCOUNT_ID") + env("IBKR_USER") + env("IBKR_PASS")
- Binance：env("BINANCE_API_KEY") + env("BINANCE_SECRET")
```

### 3. 不能绕过 OMS 下单

Live endpoint 中没有 `POST /trades` 或 `POST /orders` 这种手动下单零点。所有订单必须在 AlgorithmEngine 完成 OMS submit 后才能发送到 broker。

## Reconciliation 对账

### 概念

对账是在 paper/live 运行时，定期比较 Internal State 和 Broker State 的方法。

```
SQLite 状态 vs Broker 查询结果
```

差异发现 → reconciliation alarm → 强制暂停 → 人工干预

### 差池（drift）报告

```json
{
  "ts_ms": 1720000000000,
  "account_id": "x123",
  "symbol": "NVDA",
  "qty_internal": 1000,
  "qty_broker": 50,
  "delta": -950,
  "reason": "MISSING_EXECUTION_OTC"
}
```

### 告警摘要

```json
{
  "block_count": 9,
  "latest_block_ts_ms": 1720000000000,
  "runs": ["run-123"],
  "accounts": ["ac=1"],
  "brokers": ["ibkr"],
  "reasons": {
    "MISSING_FILL": 3,
    "CONSUMED_DUPLICATE": 2,
    "INSTRUMENT_CHANGED": 1
  }
}
```

## 配置版控制

所有配置都采用版本管控模式。修改一个配置时：

```
Config A (Live)
   ↑ latest
   │ 版本 1 (已发布)
   
Config A 版本 2 (草稿)
   ↓ 提升 (promotion)
   ↑ 已发布
   ↓ 审核通过 (2-man rule)
```

### 审批规则

```
ENV=staging → admin 可以 approve
ENV=production → 需要 2-man rule
```

### RBAC 策略

```
Policy Access:
- admin → 所有 env
- quant → staging only
- operator → 只读
- readonly → 无修改
```

## 面试高频问题

**Q: 为什么不能跳过 Reconciliation？**  
A: 因为 OMS 不是全能的——Broker 可能有部分执行状态为 OMS 没有捕获到（比如 broker 重启导致部分序号丢失）。Reconciliation 桥接了 Internal!=Broker 的分歧，终止偏差积累。

**Q: LiveGuard 的 3 层保护是为了防止什么？**  
A: 第一种错误是配置错误——漏添加交易开关导致 auto trade。第二种是凭证泄漏——不慎将 keys 写入日志或 commit。第三种是人为 T> error——通过 API 手动下单。三个层面分别防止这三个错误。

**Q: 为什么不直接用 JWT 令牌认证 Broker API？**  
A: Broker API 没有统一认证标准。IBKR 使用 Java Connection (TWS API)、Binance 使用 HMAC+SHA256 REST、Bitget 使用 Passphrase + timestamp。每种都有独立的认证凭据方式，都规则择于环境变量。
