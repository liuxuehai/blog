---
title: 多集群代理与 API 整合
description: 通过 Mark Server 对 Account Manager/Agent/Trader 的反向代理模式、动态多集群支持、WebSocket 透传、安全边界与监控。
category: Frontend
tags:
  - API Gateway
  - Proxy
  - WebSocket
  - Multi-Cluster
  - Cloudflare Workers
order: 305
updatedDate: 2025-11-15
difficulty: intermediate
status: stable
lastReviewed: 2025-12-15
draft: false
sidebar:
  order: 305
---

Mark 服务器是前端与所有上游服务之间唯一的桥梁。这是一个关键设计决策：浏览器从不直接访问 Account Manager、Agent Gateway 或 Trader 引擎。

<!-- more -->

## 统一的代理模式

```
Browser (Client App)
    |
    | cookie + fetch
    ↓
Mark Server (Cloudflare Worker)
    |
    ├── /api/account-manager/:envId/*  ──→  Account Manager (集群)
    ├── /api/agent/gateway/*          ──→  Agent Gateway (本地)
    └── /api/trader/*                 ──→  Trader Engine (本地)
```

### 各代理端点详解

| 源路由 | 代理目标 | Headers | 认证 |
|--------|----------|---------|------|
| `/api/account-manager/local/*` | 本地 Account Manager | 前端请求中 `X-Account-Manager-Environment` | Environment Token |
| `/api/agent/gateway/*` | Agent Gateway | 本地 Agent Gateway URL + Token | 前端 Bearer Token + Agent Token |
| `/api/trader/*` | Trader Engine | Trader 引擎 Token | 前端 Bearer + Trader Admin Token |
| `WS /api/trader/channel` | Trader WebSocket | WebSocket 协议透传 | 同上 |

## `account-manager` 多集群代理

### 多环境配置

```jsonc
// KV namespace: ACCOUNT_MANAGER_ENVIRONMENTS
{
  "environments": [
    {
      "id": "local",
      "name": "本地 8045",
      "baseUrl": "http://localhost:8045",
      "adminToken": "sk-local"
    },
    {
      "id": "prod-gcp",
      "name": "US West",
      "baseUrl": "https://account-manager-gcp.mycompany.com",
      "adminToken": "sk-prod-gcp"
    }
  ]
}
```

### 如何代理

```
Client: GET /api/account-manager/local/accounts
  → Server 读取 KV"environments"键
  → 按 id=local 匹配 {"id":"local","baseUrl":"http://localhost:8045",...}
  → 添加 Authorization header (adminToken)
  → fetch("http://localhost:8045/api/accounts", headers_fields)
  → 响应透传给 Client
```

### Admin Token 加密

Admin Token 存储在 KV namespace（安全），不在 Client 代码中。

```
// client → server, 带上 session cookie (httponly)
// server → account-manager, 带上 adminToken (secure, 从 KV 获取)
```

## Agent 代理

Agent 的代理是纯 REST + WebSocket，无 cookie 交互：

```
POST /api/agent/gateway/chat
  headers: { "Authorization": "Bearer ${BOT_TOKEN}" }
  body: { messages, model, ... }
  
  → fetch(base_url + "/chat", body)
  → response JSON / SSE chunks
```

本地 Agent Gateway 可能在后端所在机器，Client 不需要知道：

- `AGENT_GATEWAY_BASE_URL=http://192.168.1.10:9999`
- `AGENT_GATEWAY_TOKEN=secret_bot_token`

## Trader 代理

```
POST /api/trader/runs
  → 获取所有策略运行列表

POST /api/trader/trade
  → 提交交易信号

WebSocket: /api/trader/connect
  → 建立双向管道进行实时交易
```

Trader 不支持外部认证，须通过代理层签名检验。

## WebSocket 代理

Cloudflare Workers 支持 WebSocket 转发。与 REST 不同的处理：

```typescript
if (upstreamResponse.status === 101) {
  return upstreamResponse;  // WebSocket upgrade
}
```

对于 Trading 实时数据：

```
Client → WebSocket cloudflare → upstream Trader WebSocket
         |-- workers 透传 --|
```

WebSockets 不需要自定义数据帧转换。Worker 作为中间 node 不处理 frame。

## 安全边界

### Hop-by-hop headers 移除

代理前过滤 headers 以保护自身内部设置：

```typescript
const HOP_BY_HOP = [
  "connection", "keep-alive",
  "proxy-authenticate", "proxy-authorization",
  "te", "trailer", "transfer-encoding",
  "upgrade", "set-cookie"
];
```

### 错误处理

```typescript
// 503 - Agent 或配置不可用
if (!config) {
  return c.json({
    success: false,
    error: "AGENT_NOT_CONFIGURED",
    message: "Agent proxy not configured"
  }, 503);
}

// 502 - 上游无响应
catch (error) {
  return c.json({
    success: false,
    error: "AGENT_PROXY_ERROR",
    message: error.message
  }, 502);
}
```

## 代理模式 vs 直接访问

| 方面 | Mark Server 代理 | 直接浏览器访问 |
|------|-----------------|--------------|
| 认证 | 统一 Better-Auth cookie | 需要多个 token 配置 |
| 管理 | `ALLOWED_ORIGINS` 精准 | 不支持 |
| 敏感信息 | Admin Token、Agent Token 在 server 侧 | 暴露在浏览器 |
| WebSocket | 支持 | 复杂 |
| CORS | 无跨域问题 | 需要配置 |
| 数据泄漏 | server 日志清晰 | 浏览器 console |

## 测试场景

```powershell
# 获取所有 AM 环境
curl GET /api/account-manager/environments
# response: [{"id":"local","name":"本地","status":"online","stats":{"accounts":5,"healthy":4}}]

# 列出某个环境的账号
curl GET /api/account/manager/{envId}/accounts?domain=codex&enabled=true
# response: [accounts[]]

# 测试一个账号
curl POST /api/account/manual/{envId}/accounts/{accountId}/action/latency
```

## 面试高频问题

**Q: 反向代理 vs 直连的选择时机？**

A: 三个信号：(1) 认证复杂度——如果上游使用不同的认证策略，必须代理；(2) 安全——如果上游 Token 不应暴露给浏览器；(3) 驱动程序——如果需要 WebSocket 在浏览器中透传。

Mark 碰巧三个条件都满足，因此统一代理。

**Q: 如果多集群中其中一个集群挂了怎么办？**

A: Mark Server 会返回该环境的 `status: "offline"`——前端尊重这个返回，不加载不可用的环境数据。这是在 `environment-store.ts` 中的逻辑。

**Q: WebSocket 透传 Cloudflare Worker 不会丢帧？**

A: Cloudflare Workers 支持 101 Upgraded WebSocket protocol。Worker 和上游之间的任何消息都不修改 frame，只丢原 node- Rerun transmissions。这对于实时交易 finite frame count 至关重要（不超过 10K 帧/连接）。
