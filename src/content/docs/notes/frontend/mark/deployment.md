---
title: 部署与运维
description: Cloudflare Workers 部署流程、GitHub Pages/Git 联合部署、数据库迁移、Secret 与 KV 管理、故障排查指南和自定义域名。
category: Frontend
tags:
  - DevOps
  - Cloudflare
  - Deployment
  - CI/CD
  - Monitoring
order: 406
updatedDate: 2025-11-28
difficulty: intermediate
status: stable
lastReviewed: 2025-12-20
draft: false
sidebar:
  order: 406
---

服务器跑在 Cloudflare，前端托管在 Cloudflare Pages。部署模型高度一致——本地开发和线上部署差别最小。

<!-- more -->

## 部署架构

```text
Git Push to GitHub
    ↓
GitHub Action (可选)
    ├── Server: bun run deploy:server  → Workers
    └── Client: Git Connection → Pages (自动)
```

### 自动部署（推荐）

Cloudflare Pages 从 GitHub 仓库自动拉取部署：

```
1. 进入 GitHub → Settings → Integrations → Cloudflare
2. 选择 repo
3. Cloudflare Pages 自动识别 build script
4. 环境变量配置 VITE_API_URL
```

### 手动部署

```bash
# Server
cd server && bun run cf-deploy

# Client
cd client && bun run build && bun run pages-deploy
```

## Secret 管理

在 `server/wrangler.jsonc` 中定义 Binding。

然后通过 CLI 设置 secrets：

```bash
# BETTER_AUTH_SECRET
bunx wrangler secret put BETTER_AUTH_SECRET

# R2 Bucket
bunx wrangler r2 bucket create mark

# D1 Database
bunx wrangler d1 create app-database
bunx wrangler d1 migrations apply DB --remote
```

KV 也是通过 CLI 管理：

```bash
# KV namespace (多环境)
bunx wrangler kv namespace create ACCOUNT_MANAGER_ENVIRONMENTS
# 输入 json
bunx wrangler kv key put environments --path config.json
```

## 配置变量

### Server

```json
{
  "vars": {
    "ALLOWED_ORIGINS": "https://your-app.pages.dev",
    "BETTER_AUTH_URL": "https://server.yourname.workers.dev/api/auth"
  },
  "d1_databases": [...],
  "r2_buckets": [...],
  "kv_namespaces": [...]
}
```

### Client

```bash
VITE_API_URL=https://server.your-app.workers.dev
VITE_APP_TITLE=Mark Admin
```

## D1 数据库

### 数据库迁移

```bash
# 生成迁移脚本
cd packages/db && bun run db:generate

# 应用到本地 D1 (wrangler dev)
bun run db:migrate

# 应用到远程 D1 (production)
bun run db:migrate:prod
```

### 数据库复位

```bash
# 远程
bunx wrangler d1 execute DB --remote --command "DROP TABLE IF EXISTS user"

# 本地
bunx wrangler d1 execute DB --local --command "DROP TABLE IF EXISTS user"
```

## R2 文件存储

```bash
# 查看 Bucket
bunx wrangler r2 object list --name mark

# 下载文件
bunx wrangler r2 object get --name mark/file.png

# 删除文件
bunx wrangler r2 object delete --name mark/file.png
```

上传在应用代码内完成（路由 `/uploads`）。

## Worker 日志

查看实时日志：

```bash
bunx wrangler tail
```

生产监控：

- Workers Dashboard → Analytics → Requests
- 通过 `/metrics` 端点暴露自定义指标 (todo)
- Cloudflare Logpush 整合

## 单次部署大概流程

```bash
# 1. 安装依赖
bun install

# 2. 构建所有 workspace
bun run build

# 3. 部署 Server
cd server
bun run cf-deploy

# 4. 更新 Server URL 变量
cd client
bun run build && bunx wrangler pages install dist
```

## 自定义域名

```
# Server (Workers)
Cloudflare Dashboard → Worker → Settings → Domains → Add Route

api.mycompany.com/*

# Client (Pages)
Cloudflare Pages → Project → Custom Domains → Add

admin.mycompany.com
```

DNS 自动归因到 Cloudflare，TLS 证书自动颁发。

## 监控与告警

### 核心指标

| 指标 | 来源 | 报警阈 |
|------|------|--------|
| Worker Errors | Cloudflare Dashboard | 5xx > 5% |
| API Latency | Workers   | p95 > 200ms |
| D1 Read Count | D1 Dashboard | — |
| R2 Storage | R2 Dashboard | 900GB/1TB |

### 调试命令

```bash
# 查看实时 Worker 日志
bunx wrangler tail

# 查看昨日下载统计
bunx wrangler d1 execute DB --remote --command "SELECT COUNT(*), date(created_at) FROM user GROUP BY date ORDER BY date DESC"

# 查看 R2 Bucket
bunx wrangler r2 object list --benchmark

# 查看部署记录
bunx wrangler deployments list
```

## 故障排查

### 账号问题

```
文档: /auth/login 页面正常
路由: /api/auth/sign-in 有做
connections: workers 错误页 → check BETTER_AUTH_SECRET match
```

### CORS 错误

```
方案: 确保：
1. ALLOWED_ORIGINS 包含 Pages 域名
2. Client 的 VITE_API_URL 匹配 Workers URL
```

### D1 问题

```
步骤：
1. 检查 DB 已经用 script 创建
2. 检查 email 中的 migration 命令
3. bun run db:migrate:prod 执行迁移
```

### R2 Upload 失败

```
检查:
1. R2 Bucket 已创建并配置
2. 文件大小 < 100MB page limits
3. 外部请求中 ABV_ATTACHMENT 显示 error
```

## 成本预估

| 服务 | 使用量 | 月成本 |
|------|--------|--------|
| Workers | 50K 请求 | $0.00 |
| Worker Duration | 5-20ms avg | $0.00 |
| D1     | 10K read /月 | $0.00 |
| R2     | 5MB store | $0.00) |
| Pages  | 5K visits | $0.00/月 |
| KV     | 50K reads | $0.00/月 |
| **总计** | | **$0.00/月** |

个人使用在 Cloudflare Free Tier 充足。

## 面试高频问题

**Q: 成本和性能如何平衡？**

A: Mark 使用 Cloudflare Free Tier——零成本。如果 DAU 超过 1000，升级到 Cloudflare Pro ($20/月) 将 Warm Worker 运行时间从 10ms 升至 50ms。但即使张J中，依然为零成本。

**Q: 如何处理 Deployment 失败？**

A: (1) Cloudflare Pages 在部署失败后保留以前的成功部署——回滚只需 Dashboard 上"Rollback to this deployment"；(2) Worker 也有部署历史，可以回溯；(3) 数据库迁移不能自动回滚——需要手动运行 `bun wrangler drop`。

**Q: D1 容量超额怎么办？**

A: D1 的 5GB limit 是行方向数据 5 GB "最大"——没错 "最大"意味着不能插入更多数据。清理策略：清理 `token_stats`、`tokens_usage_log`、`user_logs`。

**Q: 如何使用 GitHub Actions 自动化？**

A: 参考 `DEPLOYMENT.md` 中的 GitHub Actions 集成方法——设置 `CLOUDFLARE_API_TOKEN` secret + `wrangler-action` marketplace。
