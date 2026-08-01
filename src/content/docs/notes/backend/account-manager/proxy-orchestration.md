---
title: 代理编排层
description: ProxyOrchestrator 编排引擎、跨账号重试、Account Scope 解析、中间件体系、安全控制、IP 过滤和限流。
category: Backend
tags:
  - Rust
  - Proxy
  - Orchestration
  - Middleware
  - Security
order: 204
updatedDate: 2025-04-05
difficulty: advanced
status: stable
lastReviewed: 2025-10-05
draft: false
sidebar:
  order: 204
---

代理编排层是请求的控制中心——接收、验证、选择账号、执行、重试。每一行代码都是 "Gate"：决定这个请求能不能过，如果不能，用户看到什么。

<!-- more -->

## ProxyOrchestrator

Orchestrator 是整个代理请求的"指挥"：

1. 解析账号 scope
2. 选择账号
3. 解析上游协议
4. 调用 runtime 执行
5. 记录 outcome
6. 失败判断跨账号重试

### 核心数据结构

```rust
pub struct ProxyOrchestrator {
    account_service: Arc<AccountService>,
    runtime_registry: Arc<RuntimeRegistry>,
}

pub enum ProxyProtocol {
    OpenAIChat, OpenAIResponses, OpenAICompletions,
    OpenAIImages, OpenAIAudio,
    ClaudeMessages, Gemini, Mcp,
}
```

### execute_chat 流程

```text
1. 解析 selection_scope（resolve_selection_scope）
   User Token → SelectionScope::Group / Unrestricted

2. 循环最多 max_attempts 次：
   ┌─ select_lease(request, excluded_account_ids)
   │  → AccountLease
   │
   ├─ resolve_upstream_protocol(lease)
   │  优先 lease.runtime_options.supported_protocols
   │  回退到 lease.runtime_kind
   │
   ├─ RuntimeRegistry.get(kind)
   │  → ProviderRuntime
   │
   ├─ runtime.execute_chat(context, lease, request)
   │  → Response (SSE stream / JSON)
   │
   ├─ SUCCESS:
   │  流式: wrap_streaming_outcome_response
   │  非流式: 直接记录 ProxyOutcome::Success
   │  → 返回
   │
   └─ FAILURE:
       记录 outcome → should_retry?
        YES → excluded_account_ids.push → loop
        NO → 返回错误
```

### 跨账号重试策略

```rust
fn should_retry(error: &ProxyError) -> bool {
    // 429  限流 → 换账号重试
    // 5xx  上游故障 → 换账号重试
    // Network → 换账号重试
    // 401/403 → 不重试（认证失败）
}
```

**关键边界**：跨账号重试在 Orchestrator 做，**不在 Upstream Runtime 做**。Runtime 只负责同账号的 endpoint fallback 和 retry-with-backoff。

> **面试怎么聊**：重试策略的双层设计是"关注点分离"的体现。Orchestrator 层面关心"这个账号还能不能用"，被 401 的请求不应该重试其他账号；Runtime 层面关心"这个 endpoint 暂时可用不"。

## Account Scope 解析

`resolve_selection_scope()` 是账号隔离的核心：

```text
No user_token_id → Unrestricted
Token无有 group_id → Unrestricted
Group 不在缓存中 → 使败（fail closed）
Group 为空 → Group { account_ids: [] } → select_lease → NoAccountsInGroup
Group 有成员 → Group { group_id, account_ids }
```

**失败关闭**：绑定组的 token 如果无法解析组成员，请求失败，不降级为所有账号。

## 中间件体系

| 中间件 | 位置 | 职责 |
|--------|------|------|
| `auth_middleware` | 代理请求入口 | User Token 验证 |
| `admin_auth_middleware` | /api/* 入口 | 管理后台密钥验证 |
| `cors_layer` | 全路径 | CORS 交叉域 |
| `ip_filter_middleware` | 代理请求入口 | IP 白/黑名单 |
| `monitor_middleware` | 代理请求入口 | Trace ID 注入 + 请求时间 |
| `service_status_middleware` | 服务层 | 服务健康状态 |

### 管理后台认证

管理 `/api/*` 路由认证策略：

- `Authorization: Bearer <secret>` 或 `x-api-key:` 或 `x-goog-api-key`
- 先匹配 `admin_password`，未设置则匹配 `api_key`
- `auth_mode = Off` 时全部放行
- `/health`、`/healthz`、`/api/health` 无需认证

### UserToken 验证

代理请求 (`/v1/query`) 的验证：
1. 检查认证 Header
2. 匹配 `api_key` or `admin_password` → 直接放行（admin 级别）
3. 检查 User Token
4. 验证 enabled、expires_at、IP 限制、宵禁
5. 注入 `UserTokenIdentity` 到请求扩展

## 安全控制

### IP 过滤

ip_filter 中间件支持 IP 白名单和黑名单配置，在账号选择之前拦截。先检查白名单，再检查黑名单。

### 速率限制

基于滑动窗口的速率限制：

- 代理行：每 60s 窗口 5 次失败触发 `proxy_disabled`
- 管理 API：无内置速率限制（应由 Nginx/Caddy 控制）
- User Token 的 间隔制：通过 `max_ips` 限制同时使用的 IP 数量

### 请求安全性

- 最大请求体大小：100MB（可通过环境变量 `ABV_MAX_BODY_SIZE`调整）
- CORS 根据前端配置精确设置允许的源
- 请求与 SStrict-Transport-Security，部署时由反向代理处理

## Proxy 协议路由

每个 handler 入口标记了对应的 `ProxyProtocol`：

| Handler | 路径 | 协议 |
|---------|------|------|
| OpenAI Chat | `/v1/chat/completions` | `HttpClientChat` |
| OpenAI Images | `/v1/images/generati...` | `HttpClientImages` |
| Claude Messages | `/v1/messages` | `ClaudeMessages` |
| Gemini | `/v1beta/models/...` | `Gemini` |
| MCP | `/internal/mcp` | `Mcp` |

## 错误场景

| 错误 | 返回 | 含义 |
|------|------|------|
| 无认证 | 401 | Bearer/key 缺失 |
| UserToken 过期 | 401 | `expired` |
| Token 组为空 | 503 | NoAccountsInGroup |
| 无可用账号 | 503 | NoAccountSupportsModel / AllAccountsExhausted |
| 上游全部失败 | 502 | 最后一个 runtime 错误 |

## 面试高频问题

**Q：为什么 429 选择跨账号重试而不是 wait-and-retry？**

A：因为 LLM 代理场景中，好几个账号可能都有相同模型。当 OpenAI 账号A 被 429 限时，账号B 大概率正常。跨账号重试比等待重试更高效——客户端不受影响。

**Q：Token 组隔离在什么情况下会"fail？"**

A：三种情况：组 ID 存在但为空（手动误删）；AccountService 不可用（数据库故障）；组查询失败（SQLite 只读）。三种情况下都会返回错误——因为在这种情况下默默回退到全账号池意味着租户隔离泄露。

**Q：中间件执行顺序为什么是关键？**

A：鉴权在最前，IP 过滤在鉴权之后。因为不通过鉴权的请求不应该产生 IP 过滤日志——IP 过滤的信息可以反推系统拓扑。脱敏在日志写入前，中间件只管采集。

**Q：max_ips 的限制是如何工作的？**

A：`token_ip_bindings` 表追踪每个 (token_id, ip) 对。当请求到达时，查询此 token 的 `SELECT COUNT(DISTINCT ip) FROM token_ip_bindings WHERE token_id = ...`.如果达到 `max_ips` 且当前 IP 不在表中，返回 401。已存在的 IP 不会增加计数。

