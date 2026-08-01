---
title: Trader 量化交易系统
description: 一个 Rust 实现的量化交易系统——支持 Backtest/Replay/Paper/Live 四种运行模式，27 个领域 crate，统一事件驱动决策链。
category: Backend
tags:
  - Rust
  - Quantitative Trading
  - Architecture
  - System Design
  - Multi-Asset
sidebar:
  order: 210
updatedDate: 2026-03-15
difficulty: advanced
status: stable
lastReviewed: 2026-08-01
---

这里整理 Trader 项目的核心知识库——一个用 Rust 从零构建的多市场、多资产量化交易系统。

内容定位是**架构师视角的深度解读**：为什么这么设计、权衡了什么、面试怎么聊。

## 知识库结构

- [架构总览](/notes/backend/trader/architecture/)：Workspace 结构、27 个 crate、四模式统一运行时、事件驱动决策链
- [运行模式体系](/notes/backend/trader/run-modes/)：Backtest/Replay/Paper/Live 的差异与复用、AlgorithmEngine 统一链路
- [交易决策链](/notes/backend/trader/decision-pipeline/)：Universe → Alpha → Portfolio → Market Rules → Risk → Execution → OMS → Broker
- [数据与存储](/notes/backend/trader/data-storage/)：SQLite 审计、Parquet 研究、MarketSlice、Feature Store、Polars
- [风控与安全](/notes/backend/trader/risk-security/)：Risk 闸门、Live Guard、实盘保护、Reconciliation 对账
- [API 与部署](/notes/backend/trader/api-deployment/)：REST/WS 控制面、CLI 工具、Docker Compose、迁移

## 一句话定位

**一个"以统一决策链为核心的多模式、多市场量化交易系统"**——不是策略回测框架，不是券商城，而是一个完整的数据采集、信号、交易、风控一体化系统。

## 核心特点

| 特点 | 说明 |
|------|------|
| **四模式统一** | Backtest/Replay/Paper/Live 共用同一 AlgorithmEngine，策略零分叉 |
| **事件驱动** | typed event bus + event_store 审计，WebSocket 实时广播 |
| **多市场** | A 股/港股/美股/数字货币现货/永续/合约 |
| **风控前置** | 7 级 Risk 校验：max qty/notional/cash buffer/halt/short/exposure/leverage |
| **实盘保护** | 送单闸门默认关闭、凭证不落库、伪装实盘失败、Live 禁止绕过 OMS 下单 |
| **数据可复现** | MarketSlice 统一行情表达、Parquet 研究数据有 checksum |
| **研究与生产桥接** | Feature Store + 市场规则引擎打通研究到实盘路径 |

## 技术栈

Rust / Tokio / Axum / SQLx / Polars / Parquet / Decimal

## Related

- [Account Manager](/notes/backend/account-manager/)：多上游 LLM 账号代理，Trader 的 Mark 后端依赖之一
- [Mark](/notes/frontend/mark/)：Trader 的 Web 管理后台
- [Backend](/notes/backend/)：后端架构、数据流和工程实践
