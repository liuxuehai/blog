---
title: 架构总览
description: Monorepo 结构、三层架构（Presentation/API/Data）、组件树、页面路由表、数据流以及与其他系统的集成视图。
category: Frontend
tags:
  - TypeScript
  - React
  - Monorepo
  - Hono
  - Cloudflare
  - Architecture
order: 301
updatedDate: 2025-09-15
difficulty: intermediate
status: stable
lastReviewed: 2025-12-20
draft: false
sidebar:
  order: 301
---

A full-stack TypeScript monorepo built on Bun + Hono + React + Cloudflare Workers。但是它已经远远超出了模板的范围——它是一个聚合式的后台管理系统。

<!-- more -->

## 产品定位

一个聚合式管理后台，三个核心用户：

- **系统管理员**：管理 Account Manager 多集群、 User Tokens、OAuth 账号
- **Agent 开发者**：查看 Agent 状态、投入资产、监控路由、操作代理网关
- **策略交易员**：配置交易策略、回溯分析、监控风险、实时市场数据

所有用户都在同一个认证体系下，通过 Better-Auth 的**组织/团队**隔离不同工作区。

## 系统分层

```text
┌─────────────────────────────────────────────┐
│  Client (React + Vite + Tailwind)            │
│  ├─ _components/   (UI 页面的细粒度定义)      │
│  ├─ _lib/          (数据控制 + 格式化)       │
│  ├─ _hooks/        (React方圆术 自定义钩子)   │
│  └─ src/lib/       (API 客户端)              │
├─────────────────────────────────────────────┤
│  Server (Hono + Cloudflare Workers)          │
│  ├─ middleware/    (认证 + 鉴权 + IP 过滤)    │
│  ├─ routes/        (REST + 代理端点)          │
│  ├─ services/      (业务逻辑)                │
│  └─ openapi/       (tionsschema 文档)       │
├─────────────────────────────────────────────┤
│  Packages                                     │
│  ├─ packages/db/       (Drizzle ORM schema)   │
│  ├─ packages/types/    (共享工具类型)         │
│  └─ packages/ui/       (60+ UI 组件库)        │
├─────────────────────────────────────────────┤
│  Cloudflare 基础设施                           │
│  ├─ Workers           (Hono 应用运行时)        │
│  ├─ D1                (SQLite 兼容 DB)         │
│  ├─ R2                (对象存储 + CDN)         │
│  └─ KV                (配置缓存)               │
├─────────────────────────────────────────────┤
│  上游服务整合                                │
│  ├─ Account Manager → 多域名多集群            │
│  ├─ Agent 网关 → Bot 本地网络                  │
│  ├─ Trader 平台 → 交易策略引擎                │
│  └─ Better-Auth → SaaS 身份认证              │
└─────────────────────────────────────────────┘
```

## Monorepo 工作空间

```
mark/
├── client/           # React 前端 (Vite + Tailwind)
│   └── src/
│       ├── pages/         # 路由页面 (account-manager, agent, trader, auth, ...)
│       ├── components/   # 跨页面共享的 UI 组分
│       ├── layouts/      # Dashboard, Auth 布局
│       ├── hooks/       # 组合钩子 (agent-chat, trader hooks, ...)
│       ├── stores/      # Zustand 全局状态 (sidebar, 环境配置)
│       └── lib/          # API 客户端 + Auth client + upload client
├── server/           # Hono 后端 (Cloudflare Workers)
│   └── src/
│       ├── routes/        # 8 RESTful 路由模块
│       ├── services/      # Auth, Organization, Subscription
│       ├── middleware/    # Auth 令牌验证、 addReqCtx
│       └── openapi/       # 响应和 schema 生成
├── packages/
│   ├── db/               # Drizzle ORM schema + D1 操作
│   ├── types/            # 共享日志工具、 date utils、 error codes
│   └── ui/               # shadcn/ui 组件库 + 数据表组件
└── docs/              # 架构设计文档
```

## 页面路由

| 路由 | 功能 | 数据来源 |
|------|------|----------|
| `/dashboard` | 总览页 | All APIs |
| `/account-manager` | 多集群账号管理 | AM API proxy |
| `/agent/chat` | Agent 对话式控制 | Agent Gateway proxy |
| `/agent/system` | Agent 系统信息 | Agent Gateway proxy |
| `/agent/stock` | 股票池管理 | Agent Gateway proxy |
| `/agent/automation` | Agent 自动化任务 | Agent Gateway proxy |
| `/trader/overview` | 交易总览 | Trader proxy |
| `/trader/runs` | 策略运行列表 | Trader proxy |
| `/trader/trade` | 实时交易监控 | Trader proxy + WebSocket |
| `/trader/risk` | 风险控制面板 | Trader proxy |
| `/trader/logs` | 运行日志 | Trader proxy |
| `/auth/login` | 登录页 | Better-Auth |
| `/users` | 用户管理 | D1 |
| `/organizations/:orgId/members` | 组织成员 | D1 |

## 前端架构

每个功能区域遵循相同的组织模式：

```
src/pages/xxx/
├── index.tsx                      # 主页面
├── _components/                    # 子组件
│   ├── xxx-dialog.tsx             # 对话框
│   ├── xxx-table.tsx              # 数据表
│   └── common.tsx                  # 共享样式或工具
├── _hooks/                        # React Query Hook
│   ├── use-xxx.ts                 # CRUD + 列表
│   └── use-xxx.test.ts
└── _lib/                          # 纯函数逻辑
    ├── query.ts                   # URL 参数构建
    ├── format.ts                  # 数据显示格式
    └── format.test.ts
```

这个模式保证每个页面都可以被独立开发和测试，不会影响其他功能。

## 关键设计决策

### 为什么用 Cloudflare Workers

Cloudflare Workers 的免费额度 (100K 请求/天) 足以支撑 10 用户的中型团队。D1 提供免费的 5GB SQLite 兼容数据库，R2 提供 10GB 免费对象存储。

关键优势：

- **零运维**：没有 Docker、没有 Compose、没有裸机管理
- **全球 CDN**：内置缓存，同一 worker 部署全球
- **TypeScript 原生**：不需要 WebAssembly/Node 桥接
- **全托管 D1**：不用管理备份、迁移、连接池

> **面试怎么聊**：选型的关键不是"Cloudflare vs AWS"，而是"可自主维护 vs 需要 DevOps"。一个人管理的后台不需要 k8s。

### 为什么用 monorepo

三个共享包：

- `packages/ui` (纯 UI 组件)，被 client 引用
- `packages/types` (logger, errors)，同时被 client 和 server 引用
- `packages/db` (Drizzle schema)，被 server 引用

这保证了**类型安全在编译时完全检查**，而不是靠手工契约和 API 文档。

### 为什么 Agent/Trader 用反向代理

Client 不直接访问 Agent 或 Trader 的本地服务。Server 被部署在公网(Workers)，Client 通过 Server 的同源认证后，再转发请求到内网 Agent Gateway 或 Trader：

```
Browser  <->  Cloudflare Worker  <->  本地 Agent Gateway
         auth                    fetch
```

三个好处：
1. **统一认证**：所有请求共用同一 session cookie
2. **安全隐藏**：Agent 和 Trader 端点的 URL 和 Token 只在 server 环境变量中保存
3. **WebSocket 支持**：Cloudflare Workers 支持 WebSocket 透传，Agent chat 和 Trader 实时数据可以使用同一管道

## 应用场景与使用流程

### 账号管理（高频率操作）

管理员登录→进入 Account Manager 页面→创建 OAuth 账号 / BYOK 账号→检查模型配额→测试延迟

### Agent 交互

开发 → 连接 Agent Gateway→ chat 或 stock→ 执行自动化→ 查看诊断日志→ 观察运行指标

### Trader 交易监控

交易员 → 开启策略 → 监控运行 → 查看日志 → 查看交易信号 → 调整

## 质量基线

- **Type Check**：`bun run type-check` 对所有工作区生效
- **Lint**：Biome 对所有代码风格 enforce
- **Test**：前端数据表有测试，后端 /api/test 覆盖关键路径
- **OpenAPI**：`/api/openapi.json` 生成 schema 文档

## 关键词

Monorepo, TypeScript Full-Stack, Cloudflare Workers, Hono, React, Better-Auth, Drizzle ORM, D1, R2, SaaS Multi-Tenant
