---
title: SaaS 认证体系
description: Better-Auth 集成、多租户认证、团队管理、订阅模型、cookie/session 管理、API 限流和保护。
category: Frontend
tags:
  - TypeScript
  - Better-Auth
  - SaaS
  - Multi-Tenant
  - OAuth
  - Security
order: 303
updatedDate: 2025-10-18
difficulty: intermediate
status: stable
lastReviewed: 2025-11-28
draft: false
sidebar:
  order: 303
---

Mark 的后台不是一个公开网站——它是一个需要登录的管理后台。认证支持 SaaS 多租户模式，包括组织/团队、订阅管理、成员管理和 OAuth。

<!-- more -->

## 为什么 Better-Auth 而不是 Auth0/next-auth

| 方面 | Better-Auth | Auth0 | Next.js |
|------|-------------|-------|---------|
| 价格 | **免费** | 付费 | 免费 (内联) |
| 与 Cloudflare Workers 兼容 | **原生** | 需要中间件 | **原生** |
| 多租户内置 | **org plugin** | 需要 B2B 特性 | 无 |
| D1/SQLite 适配器 | **通过 drizzle** | 无 | 无 |
| 部署复杂度 | 一行配置 | 高建议 | 中等 |

选择 Better-Auth 基于两个核心需求：(1) **必须免费**；(2) **必须能在 Cloudflare Workers 中运行**。

## Better-Auth 配置

```typescript
// server/src/services/auth.ts
export function createAuth(db: D1Database, env?: {...}) {
  return betterAuth({
    database: drizzleAdapter(dbClient, {
      provider: "sqlite",
      schema,
    }),
    
    // 邮箱 + 密码认证
    emailAndPassword: { enabled: true },
    
    // 用户名插件
    username: { enabled: true },
    
    // 多会话支持
    multiSession: { enabled: true },
    
    // 两步验证
    twoFactor: { enabled: true },
    
    // 组织/团队 - 多租户核心
    organization: {
      enabled: true,
      maxTeams: 5,
      maxMembers: 50,
      allowUserToCreateTeam: true,
    },
  });
}
```

## 多租户模型

```
User (John)
  ├─ Org: "Personal"      (owner)
  ├─ Org: "Team A"        (admin)
  └─ Org: "Client X"      (member)
```

每个用户可以有多个组织。在每个组织中有不同的角色：owner、admin、member、viewer。

session cookie 绑定当前活跃的组织：

```typescript
// 获取当前用户的活跃组织
const session = await auth.api.getSession({
  headers: c.req.raw.headers,
});
const activeOrgId = session?.session?.activeOrganizationId;
```

## 组织生命周期

### 创建组织

```typescript
// POST /api/organizations
{
  "name": "My Company",
  "slug": "my-company"
}
```

由 owner 创建后，自动成为该组织的唯一成员 (owner 角色)。

### 邀请成员

```typescript
// POST /api/organizations/:id/invitations
{
  "email": "colleague@example.com",
  "role": "member"
}
```

被邀请人收到邮件后接受邀请。

### 权限查看

| 操作 | owner | admin | member | viewer |
|------|-------|-------|--------|--------|
| 查看组织 | 是 | 是 | 是 | 是 |
| 修改名称 | 是 | 是 | 否 | 否 |
| 管理成员 | 是 | 是 | 否 | 否 |
| 删除组织 | 是 | 否 | 否 | 否 |

## 会话管理

```typescript
session: {
  expiresIn: 60 * 60 * 24 * 7,  // 7 天过期
  updateAge: 60 * 60 * 24,      // 每 24h 滚动更新 token
  maximumSessions: 5             // 最多 5 个并发设备
}
```

session cookie 使用 `better-auth.session_token`。所有在请求中嵌入认证信息。

## Rate Limiting

单个用户 60 秒内最多 100 次认证请求 (sign-in/sign-up/reset)。

在 `middleware/auth.ts` 中，经过 Better-Auth 验证后的所有 API 请求也都有一个 `/user` 的隐式限流。

## 订阅模式

| 计划 | 月费 | 年费 | 存储 | 用户数 | 特点 |
|------|------|------|------|--------|------|
| Free | $0 | $0 | 1GB | 1 | 社区支持 |
| Pro | $19 | $190 | 50GB | 5 | 多组织、邮件支持 |
| Business | $99 | $990 | 500GB | 50 | 优先支持、API 访问 |
| Enterprise | — | — | 无限 | 无限 | 专属支持、自定义 |

每个 plan 的 feature access 可以在 `subscriptions.ts` 中自定义 limit flow。

### 订阅流程

```typescript
// 开始试用 (14天)
POST /api/subscriptions/trial

// upgrade
POST /api/subscriptions/upgrade { plan: "pro", billing: "monthly" }

// downgrade
POST /api/subscriptions/upgrade { plan: "pro" }

// cancel
POST /api/subscriptions/cancel
```

## 用户个扩展字段

Beyond Auth 标准模型，Mark 添加了增强的用户字段：

```typescript
user: {
  additionalFields: {
    role: { type: "string", defaultValue: "user" },
    isActive: { type: "boolean", defaultValue: true },
    lastLoginIp: { type: "string" },
    avatar: { type: "string" },
    bio: { type: "string" },
    displayUsername: { type: "string" }
  }
}
```

## 面试高频问题

**Q: 为什么需要组织(organization)？**

A: 一个人可能同时属于多个团队。一个组织可能有多个人。Better-Auth 的 organization 机制将"个人身份"和"组身份"分离开。session 里携带活跃的组织 ID，让 API 可以在正确的组织 scope 中查询、操作。这和 `SelectionScope` 的原理几乎相同。

**Q: `activeOrganizationId` 的作用时机？**

A: 所有 /api/* 路由都会在 auth 中间件中读取当前 session。如果 session 的 `activeOrganizationId` 指定了一个组织 ID，后续的组织 API 都会自动识别。不需要在每个 API 调用中额外传 organization_id。

**Q: 为什么不做 JWT？**

A: Better-Auth 使用 cookie-based session。关键原因是 cookie 自动随请求携带，不需要在 React 前端手动管理 Authorization header。安全性上，Complex 同时使用 HttpOnly + Secure + SameSite 尽力。

**Q: 订阅引擎没有 Stripe 集成为什么还写？**

A: Stripe 集成会在后续版本加入。但是 Billing 表的设计已就绪——plans、subscriptions、subscription_items。当 Stripe 迁移都准备好了，只补充支付集成层，不改变认证模型。
