---
title: Cloudflare 基础设施
description: Workers/D1/R2/KV/Wrangler 的选择和实践、Drizzle ORM 建表、本地开发与生产环境的差异、Free Tier 使用分析。
category: Frontend
tags:
  - Cloudflare
  - Workers
  - D1
  - R2
  - SQLite
  - Serverless
order: 302
updatedDate: 2025-10-05
difficulty: intermediate
status: stable
lastReviewed: 2025-12-05
draft: false
sidebar:
  order: 302
---

Mark 的所有后端能力运行在 Cloudflare 上——一个完全免费的、全球分布式、由 CDN 加 Serverless Compute 构建的平台。

<!-- more -->

## Cloudflare 为什么是"合理过度"

Mark 是一个**个人或小团队**使用的后台管理系统。不需要：

- 管理虚拟机或 Docker 容器 (VM 需要定期更新和补丁)
- 配置负载均衡 (单个文件处理)
- 处理 TLS 证书 (Cloudflare 自动)
- 管理数据库连接池 (D1 内部处理)

Cloudflare Workers + D1 + R2 在个人开发规模上完全免费。

| 服务 | 免费额度 | Mark 使用量 | 用法 |
|------|----------|-------------|------|
| Workers | 10 ms CPU/请求 | ~5-20 ms | 处理 API + 反向代理 |
| D1 | 5 GB /月 | ~500 MB | 存储组织、用户、订阅 |
| R2 | 10 GB /月 | ~2-3 MB | 文件附件 (png, webp) |
| KV | 1 GB | ~ 50 KB | Account Manager 的环境缓存 |

## 开发与生产环境分离

### 本地开发

```bash
# 每个 worker 对应一个 Cloudflare 环境
cd server && bun run cf-dev
# 使用 server/wrangler.jsonc 里的 env.dev 配置

# client 使用 Vite 5 开发服务
cd client && bunx vite --host
```

本地开发模式自动连接本地 D1 数据库和 R2 mock。不需要连接到线上 DB。

### 生产部署

```bash
# Server 部署到 Workers
cd server && bun run deal

# Client 部署到 Clouds
cd client && bunx wrangler pages deploy dist
```

### 多环境 KV 存储

多 Account Manager 实例的环境持久化在 KV namespace 中：

```json
{
  "environments": [
    {
      "id": "local",
      "name": "本地环境",
      "baseUrl": "http://localhost:8045",
      "adminToken": "sk-..."
    },
    {
      "id": "production",
      "name": "生产环境",
      "baseUrl": "http://192.168.1.1:8045",
      "adminToken": "sk-prod"
    }
  ]
}
```

KV namespace 通过 Wrangler CLI 配置，不需要重启 Worker 就能动态更新。

## D1 (SQLite 兼容 DB) 设计

### Schema

```sql
-- Better-Auth SaaS schema (自动生成)
-- user, session, account, verification, authenticator, jwks 表

-- 组织/团队/权限
organizations   (id, name, slug, avatar ...)
org_memberships (id, org_id, user_id, role, ...)
invitation       (id, org_id, email, role, ...)

-- 订阅
plans             (id, name, price_monthly, features, ...)
subscriptions     (id, user_id, plan_id, period_start, period_end, ...)
subscription_items(id, subscription_id, plan_id, quantity, ...)

-- 注册的 hooks 扩展
user_settings     (id, user_id, type, key, value, ...)
```

所有 CRUD 通过 Drizzle ORM 实现：

```typescript
// packages/db/src/schema/auth-schema.ts
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  // ...
});
```

### 数据迁移

```bash
# 生成本地 SQL
bun run dbeate

# 执行到 D1 本地
env bun run db:migrate

# 执行到 D1 远程
env bun run db:migrate:prod
```

### 查询方式

```typescript
import { createDbClient } from "db";

const db = createDbClient(c.env.DB);
const users = await db.select().from(schema.user).all();
const user = await db.select().from(schema.user).where(eq(schema.user.id, id)).get();
```

## R2 文件存储

R2 为 Mark 提供文件存储能力。上传文件 → R2 Bucket → 全球 CDN 分发。

```typescript
// 上传到 R2
await env.ATTACHMENTS_BUCKET.put(filename, fileData);
```

配置 Binding 在 `server/wrangler.jsonc`:

```json
"r2_buckets": [
  {
    "binding": "ATTACHMENTS_BUCKET",
    "bucket_name": "mark"
  }
]
```

## Wrangler 配置

### `server/wrangler.jsonc`

```json
{
  "name": "mark-server",
  "main": "src/index.ts",
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "app-database",
      "database_id": "from wrangler"
    }
  ],
  "r2_buckets": [
    {
      "binding": "ATTACHMENTS_BUCKET",
      "bucket_name": "mark"
    }
  ],
  "vars": {
    "ALLOWED_ORIGINS": "http://localhost:5173",
    "BETTER_AUTH_URL": "http://localhost:8787/api/auth"
  }
}
```

### `kv_namespaces`

```json
{
  "kv_namespaces": [
    {
      "binding": "ACCOUNT_MANAGER_ENVIRONMENTS",
      "id": "from wrangler",
      "preview_id": "from wrangler"
    }
  ]
}
```

## D1 与 Cloudflare CDN

D1 使用 SQLite 作为 Engine，运行在全球边缘节点。经过 Cloudflare 建议的读写策略：

- 主写入同步 (primary writes)：请求 → 边缘节点 → 主 DB
- 搜索读取到 electrons (read replicas)：give → 最近的边缘节点 DB

这保证了个人开发工具的延迟在全球范围内低于 50ms，无需额外设计数据库同步和复制。

## Free Tier 陷阱

Cloudflare 的免费额度足够个人使用，但有几点注意：

- **CPU 上限**：Worker 执行不超过 5s（Cloudflare Consumer）
- **D1 并发**：否则考虑用量限制
- **R2 带宽**：集群 Cache-serve 的带宽不应超过 2G 月

> **面试问题**：为什么不直接用 Vercel + Next.js？(1) 零成本完全免费；(2) 可以在 Workers 中运行真正的 Node.js '异步'代码；(3) D1 的 SQL 兼容性让你保持数据逻辑在 server 端，不必把复杂查询移到客户端。

## 关键决定与权衡

### 为什么 D1 不做连接池

D1 的内部采用每请求独立连接的机制。对于 D1 Workers(serverless 模型)，没有持续的 TCP 连接给数据库。实际结果是：每个请求建立一个短暂的 SQL 连接后立即关闭。

### R2 限制

R2 可以存储图像、PDF、CSV，但不应存储超大文件 (>500MB) 或二进制 (iso)。如果在 8K 以下图片压缩到 webp 格式后转为 R2，works 最消耗免费 CDN 带宽。

### 未来考虑

如果日活跃量 (DAU) 超过数千，可以扩展到 Cloudflare Pro (普通的 Workers Unlimited) 或向 Workers 添加 Durable Objects(多方计算)。
