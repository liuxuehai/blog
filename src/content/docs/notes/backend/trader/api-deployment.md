---
title: API 与部署
description: REST/WebSocket 控制面、Admin 管理 API、CLI 工具、Linux 部署、Docker Compose、环境变量和监控。
category: Backend
tags:
  - Rust
  - REST API
  - WebSocket
  - Deployment
  - DevOps
  - Docker
order: 216
updatedDate: 2026-06-15
difficulty: advanced
status: stable
lastReviewed: 2026-08-01
draft: false
sidebar:
  order: 216
---

Trader 通过 HTTP + WebSocket 暴露完善的控制面。自命令到查询到实时事件，管理员可以通过统一 API 完成所有工作。

<!-- more -->

## 两种服务

| 服务 | 入口 | 端口 | 场景 |
|------|------|------|------|
| trader-server | HTTP REST + WS + admin | 8080 | Mark 操作界面的后端、运维管理 |
| trader-cli | 命令行入口 | — | 数据初始化、迁移、快速后台任务 |

## REST API

### 路由结构

```
/api/v1/
├── health                  → 系统状态
├── runs                    → 运行列表
├── runs/{run_id}/status    → 运行状态轮询
├── runs/{run_id}/cancel    → 取消运行
├── backtests               → 创建回测
├── paper-runs              → 创建 Paper 运行
├── replays                 → 创建 Replay
├── live-runs               → 创建 Live 运行
├── runs/{run_id}/
│   ├── orders              → 订单列表
│   ├── fills               → 成交列表
│   ├── positions           → 持仓列表
│   ├── metrics             → 绩效指标
│   ├── events              → 事件列表
│   ├── risk-events         → 风控事件
│   ├── reconciliation      → 对账检查
│   ├── reconciliation-drifts → 数据不一致详情
│   ├── portfolio-snapshots → 投资组合快照
│   ├── cash-snapshots      → 现金快照
│   └── position-snapshots  → 持仓快照
├── brokers/status          → 连接状态
├── brokers/account/{id}    → 经纪商账户快照
├── configs                 → 所有配置列表
├── configs/{name}          → 配置版本列表
├── configs/{name}/latest   → 最新配置版本
├── configs/{name}/published → 已发布配置版本
├── configs/{name}/{v}      → 配置版本详情
├── configs/{name}/{v}/state → 配置状态变更
├── configs/{name}/{v}/rollback → 配置回滚
├── configs/{name}/diff     → 配置版本比较
├── configs/{id}/releases   → 发布历史
├── configs/{id}/audits     → 审计日志
├── config-approvals/pending → 待审批配置
├── config-governance/policy → 配置治理策略
├── fee-rules               → 手续费规则列表
├── market-rules/effective  → 实效市场规则
├── funding-rates           → 资金费率查询
├── crypto-market-meta      → crypto 市场元数据
├── corporate-actions       → 公司事件管理页面
├── logs                    → 分页日志查询
├── system-logs             → 系统日志
└── events                  → 事件列表
```

## WebSocket

### 连接

```
ws://127.0.0.1:8080/ws
```

### 订阅

客户端发：

```json
{"action": "subscribe", "types": ["orders", "fills", "risk"]}
```

推送：

```json
{
  "type": "order_update",
  "data": {
    "run_id": "...",
    "order_id": "...",
    "status": "Filled",
    "filled_qty": "100",
    "ts_ms": 1720000000000
  }
}
```

热门订阅频道:

- `orders`: order 状态变更
- `fills`: 新成交
- `portfolio`: 组合快照变更
- `risk`: 风控事件
- `replay`: Replay 进度条
- `system`: 运行通知
- `crypto_positions`: crypto 仓位更新

## CLI 功能

### 基础命令

```bash
trader-cli backtest --config configs/ma_cross.toml --start-date 2025-01-01
trader-cli paper --config configs/paper.toml
trader-cli replay --config configs/replay-v1.toml
trader-cli live --config configs/live-ibkr.toml
```

### 数据管理

```bash
trader-cli import --source path/to/ETHUSDT-1m.parquet
trader-cli fetch-fee-rules --broker binance --market crypto --asset-class spot
trader-cli fetch-corporate-actions --market us --symbol AAPL --from-..."
```

### 市场状态检查

```bash
trader-cli market-rules --symbol BTCUSDT --market crypto
trader-cli effective-rules --symbol NVDA --market us
trader-cli broker-status --kind ibkr --mode status
```

## 部署

### Docker 部署

```bash
docker build -t trader-server .
docker running -p 8080:8080 trader-server
```

### 环境变量

| 变量 | 含义 | 来源 |
|------|------|------|
| `trader_set_run_directory` | 项目根目录 | Path |
| `trader_db_path` | SQLite 文件路径 | Path |
| `trader_log_dir` | 日志文件夹 | Path |
| `trader_api_key` | Client 认证密钥 | Secret |
| `trader_HMC_SHA256` | Binance API 凭证 | Secret |
| `IBKR_ACCOUNT_ID` | IBKR 账户 | Secret |

### Compose 部署

```yaml
version: "3"
services:
  trader-api:
    image: ghcr.io/trader:latest
    port: "8080:8080"
    environment:
      - trader_db_path=/data/trader.sqlite
    volumes:
      - $PWD/data:/data
      - $PWD/datasets:/datasets
```

## 监控与运维

### 查询运行状态

```bash
curl http://localhost:8080/api/v1/runs
curl http://localhost:8080/api/v1/runs/RUN_ID/status
```

### 健康检查

```bash
curl http://localhost:8080/api/v1/health
# → { "status"： "ok" }
```

### 停止错误运行

```bash
curl -X POST http://localhost:8080/api/v1/runs/RUN_ID/cancel
```

### 查看订单

```bash
curl http://localhost:8080/api/v1/runs/RUN_ID/orders?status=filled
```

### 检查 Reconciliation 漂移

```bash
curl http://localhost:8080/api/v1/runs/RUN_ID/reconciliation-drifts
```

## 风险管理仪表板

Admind 使用 Mark 前端可视化仪表板连接 Trader 服务器：

```
Mark 前端 → Mark Server 代理 → Trader API
  (better-auth)         →   (bearer token)
```

Trader 不需要独立前端，所有管理功能通过 Mark 后台实现。

## 面试高频问题

**Q: WebSocket 订阅是否持久化？**  
A: 不是。当 WebSocket 连接断开，订阅立即失效。重连后仍需重新订阅。

**Q: 为什么选择 Raw JSON WebSocket 而非 gRPC？**  
A: Trader 不需要高吞吐量 (100+ msg/ms)。REST + WS 是完全足够的，而且前端易于集成。

**Q: CLI 与 Server 可以同时运行吗？**  
A: 可以，只要使用不同的 run_ids。Server 运行 Production 模式，CLI 运行 Developer 模式，共享同一个 SQLite 文件时需注意并发锁。
