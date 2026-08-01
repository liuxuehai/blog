---
title: Mark 后台管理
description: 一个基于 Bun + Hono + React + Cloudflare Workers 的全栈 TypeScript 管理后台，聚合 Account Manager、Agent 网关、Trader 交易平台于一体。
category: Frontend
tags:
  - TypeScript
  - React
  - Hono
  - Cloudflare
  - Admin Dashboard
  - SaaS
sidebar:
  order: 300
updatedDate: 2026-07-01
difficulty: intermediate
status: stable
lastReviewed: 2026-08-01
---

这里整理 Mark 项目的核心知识库——一个基于 Cloudflare 全栈套件的聚合式管理后台。

这是 Account Manager 的前端，也是 Agent 网关，也是 Trader 平台的入口。一个"无所不包"的后台系统。

## 知识库结构

- [架构总览](/notes/frontend/mark/architecture/)：monorepo 结构、技术栈、服务分层、数据流
- [Cloudflare 基础设施](/notes/frontend/mark/cloudflare-stack/)：Workers/D1/R2/KV 的选型与使用
- [SaaS 认证体系](/notes/frontend/mark/auth-system/)：Better-Auth 集成、多租户、订阅模型
- [前端管理后台](/notes/frontend/mark/frontend-design/)：React Router、页面拆分、数据表重置、API 封装
- [多集群代理层](/notes/frontend/mark/api-proxy/)：与 Account Manager 集成、Agent/Trader 代理机制
- [部署与运维](/notes/frontend/mark/deployment/)：Cloudflare Pages + Workers 部署流程、secret 管理

## 一个管理系统，三个核心功能

| 功能 | 说明 |
|------|------|
| **Account Manager 前端** | 完整的多集群账号管理界面，包含 OAuth、额度统计、测试等 |
| **Agent 网关代理** | 使用同源 auth，反向代理 Agent 请求到本地 Bot 服务器 |
| **Trader 交易平台** | 策略配置、实时监控、日志查看、风险控制 |

## 技术栈

Bun / React / Hono / Drizzle ORM / Cloudflare Workers / D1 / R2 / Tailwind

## Related

- [Account Manager](/notes/backend/account-manager/)：多上游 LLM 账号代理服务
- [Agent 网关](/notes/ai/bot/)：本地 Agent 网络的运维后台入口
- [Frontend 其他笔记](/notes/frontend/)：React、UI 架构和组件设计
