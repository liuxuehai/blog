---
title: 上游运行时
description: ProviderRuntime trait、8 种上游 Provider、OAuth 认证流程、Quota 刷新、Transport 池、Endpoint Fallback 和错误映射。
category: Backend
tags:
  - Rust
  - Runtime
  - OAuth
  - Transport
  - Quota
order: 205
updatedDate: 2025-07-22
difficulty: advanced
status: stable
lastReviewed: 2025-09-28
draft: false
sidebar:
  order: 205
---

上游运行时是不同的 LLM 提供商的实际执行层——不选账号、不查 DB、不跨账号重试。每个 Runtime 专注做好一件事：把协议请求发给上游，把响应转回系统内部格式。

<!-- more -->

## RuntimeKind 与 ProviderRuntime

### Runtime 类型

```rust
pub enum RuntimeKind {
    Antigravity, Gemini, Zai, OpenAI, Anthropic, Local, Kiro, GithubCopilot,
}
```

### ProviderRuntime trait

```rust
pub trait ProviderRuntime: Send + Sync {
    fn kind(&self) -> RuntimeKind;
    fn execute_chat(&self,
        ctx: RequestContext,
        lease: AccountLease,
        request: Value
    ) -> BoxFut<Result<Response, ProxyError>>;
}
```

返回 raw `axum::response::Response`——流式/非流式由 runtime 内部决定。

### 输入来源（只消费，不重新查询）

Runtime 只接收两个输入：

- **RequestContext**：trace_id、模型名、routing hints（来自路由层）
- **AccountLease**：credentials、runtime_options、use_upstrea_proxy（来自账号层）

**Runtime 不能自己扫 DB、不能自己改账号状态、不能自己 reselect 账号。**

## 8 种 Provider

| Provider | RuntimeKind | 协议 | 认证 | 特点 |
|----------|-------------|------|------|------|
| OpenAI | `OpenAI` | OpenAI Chat + Responses | OAuth2 / API Key | 双协议 Canyon IR |
| Anthropic | `Anthropic` | Messages API | API Key | 思维链、工具调用、streaming decoder |
| Gemini | `Gemini` | v1internal | OAuth2 | Google原生，v1internal |
| Antigravity | `Antigravity` | 复用 Gemini | OAuth2 | 内部服务，Cloud Code |
| Kiro | `Kiro` | AWS JSON | OAuth2 | AWS EventStream、可用模型回退 |
| Z.AI | `Zai` | Gemini Bridge | API Key | Zhipu AI 端点 |
| GitHub Copilot | `GithubCopilot` | 内部协议 | OAuth2 Device Flow | GitHub 订阅绑定 |
| Local | `Local` | N/A | None / API Key | Ollama/vLLM/LM Studio |

### 关键实现细节

**Codex (OpenAI) Runtime**：
- `openai_slot.rs` 同时处理 OAuth 和 BYOK
- 差异由 `AccountLease.credentials` 和 `account_link` 决定
- OpenAI Chat/Responses 互转：文本 + 工具调用 6 种路径全部覆盖

**Kiro Runtime**：
- `canonical-only` 分支，不走旧 mapper
- AWS EventStream 二进制帧 → 语义事件解析
- 月度配额处理：`Credit = 0%` → 账号禁用到月底
- 可用模型回退：当月初无余额时自动查询支持列表

**Anthropic Runtime**：
- `AnthropicStreamDecoder` 解析 SSE
- `input_json_delta` 事件中 tool call id 正确携带
- 中间出现 system/developer 消息不静默丢弃，返回 `CapabilityError`

**Gemini Runtime**：
- Antigravity 和 Gemini 共用同一 adapter
- `userAgent=antigravity` vs `userAgent=gemini` 区分
- v1internal 请求、响应、stream 全部支持

## OAuth 认证体系

### 统一流程入口

所有 OAuth 登录走**同一端点**：`/api/accounts/oauth/:domain/*`

| 方法 | 端点 | 含义 |
|------|------|------|
| `POST` | `/oauth/:domain/prepare` | 准备 pending login，返回 authUrl |
| `POST` | `/oauth/:domain/start` | 兼容旧客户端的等待入口 |
| `POST` | `/oauth/:domain/complete` | 手动提交 code 完成登录 |
| `POST` | `/oauth/:domain/cancel`  | 取消 pending |

### Token 刷新

OAuth 刷新归一到账号生命周期，不散落在 runtime 中：
1. 账号到期前刷新
2. 成功后更新 credentials
3. `invalid_grant` → 标记 `validation_required`
4. 网络失败 → 临时禁用（不污染模型能力）

## Quota（额度）管理

### 统一额度数据结构

```json
{
  "last_updated": "2026-07-25T10:30:00Z",
  "status": "available",
  "quota_kind": "codex_windows",
  "remaining_percentage": 85,
  "reset_time": "2026-07-26T00:00:00Z",
  "subscription_tier": "pro",
  "is_forbidden": false,
  "windows": [
    { "name": "primary", "remaining": 85 },
    { "name": "secondary", "remaining": 100 }
  ]
}
```

### 不同 Provider 的额度体系

| Provider | 额度模型 | 查询方式 |
|----------|----------|----------|
| Codex | primary/secondary 窗口 | `/usage` API |
| Kiro | 账号 credit + monthly request count | `/billing` API |
| Gemini | 模型池（单个模型 available_count） | 模型列表 |
| Antigravity | 复用 Gemini 模型池 | 模型列表 |
| BYOK | 无服务端额度 | — |

### 自动限流（Rate Limit）

- **滑动窗口**：60s 内 5 次失败触发 proxy_disabled
- **短期限流** (retry-after < 60s)：临时内存限流，不持久化
- **月度配额耗尽**：proxy_disabled_until = end_of_month
- **成功请求**：清除 rate_limit_window 计数器

## Transport

所有 HTTP 客户端由 transport module 管理，支持：
- 连接池
- 代理池（SOCKS）
- AWS EventStream 二进制帧
- `use_upstream_proxy` 个人账户开关

**关键：`use_upstream_proxy = false`**
- 应用使用 `.no_proxy()` 的 HTTP 客户端
- 不只省略应用级 `.powxy(...)`，因为 HTTP 库默认还要读取环境变量
- 防止账户流量走应用代理、环境变量代理、系统代理

## 错误与回退映射

| 上游状态 | 转码 | 影响 |
|----------|------|------|
| 401 | `InvalidCredential` | 不跨账号重试 |
| 403 | `PermissionDenied` | 不跨账号重试 |
| 429 | `RateLimited` | 记录 outcome →换账号重试 |
| 5xx | `UpstreamServerError` | 记录 outcome →换账号重试 |
| 网络断开 | `UpstreamNetworkError` | 记录 outcome →换账号重试 |
| 流式错误 | `StreamFailed` | 记录 outcome，不伪装成功 |

## 面试高频问题

**Q：为什么 Token 刷新不散落在 Runtime 中？**

A：两个原因：(1) 刷新前不刷新后——选择阶段看到的是最新 token，不需要在请求途中临时更新；(2) 原子性——在 `AccountService` 层面刷新时持有全局独占锁 `refresh_scheduler`，可以防止多个并发请求同时对同一账号裸刷多条 token。

**Q：配额清除 `rate_limit_window` 后账号能否立即重新参与？**

A：不能。`proxy_disabled`字段一旦设置，只能通过：(1) 用户手动 toggle-proxy；(2) `proxy_disabled_until <= now` 由定时器自动清除；(3) 管理员手动 reset。成功请求会清除 rate_limit_window 计数器，但不会覆盖 proxy_disabled。

**Q: API Key 账号如何支持两种协议？**

A：通过 `runtime_options_json.supported_protocols` 声明多个协议。Orchestrator 调用 `resolve_upstream_protocol()` 时，根据请求的 `ProxyProtocol` 选择匹配的协议。例如：`["openai_chat", "anthropic_messages"]` ——同一个 API Key 账号既可以正确处理 OpenAI Chat 格式，也可以处理 Anthropic 格式。

**Q：为什么 Kiro 的 quota 模型有不同处理？**

A：Kiro 既是 OAuth2 账号，也有按月 credit 模型。402 返回时不是传统的"限流重试"，而是"本月剩余模型=0"。此时需要将 `proxy_disabled_until` 设置为月底（每月 31 日），而不是设置短时间窗口。

**Q：Anthropic `cache_control` 怎么处理？**

A：Claude 的 `cache_control` 会在 client adapter 编码为 Canonical IR 的 metadata。Decoding microservice 返回 Anthropic 时，从 metadata 提取并重建 `ephemeral` 字段。这保证：Grok→Claude 的请求返回的 `cache_control` 不会丢失；Claude→OpenAI 时 client adapter 不生成它（因为 OpenAI 不支持）。

