---
title: 统一账号系统
description: 账号域模型、AccountDomain/AuthKind、账号状态机、AccountLease、账号选择器、LRU 排序、账号组隔离、User Token 体系。
category: Backend
tags:
  - Rust
  - Account System
  - Multi-Tenant
  - Authorization
order: 202
updatedDate: 2025-01-18
difficulty: advanced
status: stable
lastReviewed: 2025-10-10
draft: false
sidebar:
  order: 202
---

账号系统是整个代理的核心——所有上游请求最终都要落到一个具体的账号。这里的设计决策直接影响代理的可用性、隔离性和可维护性。

<!-- more -->

## 账号域模型（AccountDomain）

### 设计原则

**账号域 != 认证类型**

这是整个设计中最容易误解的一点。`AccountDomain` 表示"这是谁的服务"，`AuthKind` 表示"怎么认证"。两者是正交的：

```rust
pub enum AccountDomain {
    Antigravity, Codex, Zed, GithubCopilot, Windsurf, Kiro, Cursor,
    Gemini, Codebuddy, CodebuddyCn, Qoder, Trae, Workbuddy,
    ApiKey, Local, Custom,
}
```

### 首批 19 个域的分类

| 类别 | 域 | 上游代理 | 认证方式 |
|------|-----|---------|---------|
| **代理型** | antigravity、gemini、codex、kiro、anthropic、zai、github-copilot | 转发请求到上游 | OAuth2 / API Key |
| **托管型** | local、custom、api_key | 转发请求到自部署/自定义端点 | None / API Key |
| **Token 型** | cursor、windsurf、trae、zed、qoder、codebuddy、codebuddy_cn、workbuddy | 不转发，仅管理 Token | OAuth (PKCE/Device Flow/State Poll) |

### 迁移规则（历史兼容）

旧 codex/openai 账号 → `openai`；旧 codex/anthropic → `anthropic`；旧 codex/openrouter → `openrouter`。迁移在表数据层面处理，不在运行时做域映射。

### 别名规范化

`normalize_account_domain()` 支持别名：
- `"github-copilot"` / `"github_copilot"` / `"ghcp"` → `GithubCopilot`
- `"api_key"` / `"apikey"` / `"byok"` → `ApiKey`

> **面试怎么聊**：账号域和认证类型的正交分离是"可组合设计"的典型案例。你可以用 API Key 连接任何 OpenAII-compatible 端点，不管它实际后端是什么——域负责"是谁"，认证负责"怎么证明"。

## 账号状态机

```text
          创建
           ↓
       [active] ←→ [disabled]  (用户手动启用/停用)
           ↓
    [validation_required]  (token 过期，需要刷新)
           ↓
       [expired]  (刷新失败，凭据已过期)
           ↓
       [revoked]  (被上游撤销)
           ↓
       [error]  (错误状态，需要人工介入)
```

### 三态可用条件

账号可参与代理选择的三个独立条件：

```
enabled = true AND status = 'active' AND NOT proxy_disabled
```

- `enabled`：用户控制的开关
- `status`：系统自动维护的健康状态
- `proxy_disabled`：独立于 `enabled`/`status` 的代理参与控制，支持 `proxy_disabled_until` 定时恢复

### 自动禁用

| 触发条件 | 行为 |
|----------|------|
| 连续 5 次 429 限流（60s 滑动窗口） | proxy_disabled + reason = rate_limited |
| 月度配额耗尽（Kiro 402 / quota 0%） | proxy_disabled + until = month_end |
| 短暂限流（retry-after < 60s） | 内存限流，不持久化禁用 |

> **面试怎么聊**：`enabled` / `status` / `proxy_disabled` 三个独立字段的设计是"关注点分离"的体现。用户操作（disabled）、系统健康评估（status）、代理缓解（proxy_disabled）由不同路径更新，互不干扰。

## 账号表设计

```sql
CREATE TABLE accounts (
    id TEXT PRIMARY KEY,
    account_domain TEXT NOT NULL,
    auth_kind TEXT NOT NULL,
    principal TEXT,
    email TEXT,
    display_name TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    enabled INTEGER NOT NULL DEFAULT 1,
    credentials_json TEXT,
    metadata_json TEXT,
    capabilities_json TEXT,
    quota_json TEXT,
    runtime_options_json TEXT,
    supported_models_json TEXT,
    available_models_json TEXT,
    use_upstream_proxy INTEGER NOT NULL DEFAULT 1,
    proxy_disabled INTEGER NOT NULL DEFAULT 0,
    proxy_disabled_reason TEXT,
    proxy_disabled_until INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    last_used INTEGER
);
```

### JSON 字段分级

| 字段 | 作用 | 刷新时机 |
|------|------|----------|
| `credentials_json` | 认证凭据（access_token / api_key） | OAuth 刷新时 |
| `runtime_options_json` | 运行时配置（base_url / protocol / headers） | 手动配置 |
| `supported_models_json` | 账号"知道哪些模型"，用于展示和排序 | 后台异步 |
| `available_models_json` | 当前可直接选择的模型 ID | 后台异步，选择器读取 |
| `quota_json` | 账号级/窗口级额度状态 | 后台定期刷新 |
| `capabilities_json` | 能力声明 | 配置 |
| `metadata_json` | 扩展元数据（含 rate_limit_window） | 运行时更新 |

## AccountLease（运行时输入快照）

`AccountLease` 是 runtime 执行需要的只读账号快照，不负责执行，只携带信息：

```rust
pub struct AccountLease {
    pub lease_id: String,
    pub trace_id: String,
    pub account_id: String,
    pub account_domain: String,
    pub auth_kind: AuthKind,
    pub runtime_kind: RuntimeKind,
    pub principal: Option<String>,
    pub credentials: RuntimeCredential,
    pub quota_snapshot: Option<QuotaSnapshot>,
    pub capabilities: AccountCapabilities,
    pub runtime_options: Value,
    pub use_upstream_proxy: bool,
    pub proxy_options: Option<ProxyOptions>,
    pub selection_reason: String,
}
```

**关键**：`AccountLease` 是只读快照，runtime 不应反向修改账号域状态。

## 账号选择器

### SelectionRequest 输入

```rust
pub struct SelectionRequest {
    pub trace_id: String,
    pub resolved_model: Option<String>,       // 路由解析后的标准模型名
    pub excluded_account_ids: Vec<String>,    // 跨账号重试的排除列表
    pub required_capability: Option<String>,
    pub requested_runtime_kind: Option<RuntimeKind>,
    pub requested_protocol: Option<String>,
    pub scope: SelectionScope,
}
```

### SelectionScope

```rust
pub enum SelectionScope {
    Unrestricted,                              // admin key / 无 token
    Group { group_id: String, account_ids: Vec<String> },
}
```

### select_lease 选择流程

```
1. 缓存优先：查 selection_cache.select(request)
   ↓ 命中 → 转 AccountLease 返回
   ↓ 未命中 → 仓库路径

2. 查询所有 enabled=true, status=active 账号
   ↓ 空 → NoAccountsInRepository

3. 组过滤（scope = Group）
   ↓ 交集为空 → NoAccountsInGroup

4. 资格过滤：
   - excluded_account_ids → 排除
   - proxy_disabled → 排除
   - required_capability → 检查 capabilities_json
   - requested_protocol → API Key 账号检查 supported_protocols
   - requested_runtime_kind → 检查 runtime 匹配
   - resolved_model → 检查 available_models_json 精确匹配

5. 排序：
   last_used ASC → created_at ASC → id ASC (LRU)

6. 选第一个 → selection_reason: "lru_available_models"
```

### 选择失败原因（12 种）

| 原因 | 含义 |
|------|------|
| `NoAccountsInRepository` | 数据库中完全没有可用账号 |
| `AllAccountsDisabled` | 全部被标记为 disabled |
| `AllAccountsExhausted` | 全部额度耗尽 |
| `NoAccountSupportsModel` | 所有账号的 available_models_json 无匹配 |
| `NoAccountForRuntime` | Runtime 匹配失败 |
| `AccountRuntimeNotConfigured` | 账号配置了无效 runtime |
| `NoAccountForProtocol` | 协议匹配失败 |
| `AccountProtocolNotConfigured` | 账号不支持请求的协议 |
| `NoAccountHasCapability` | 达成所需能力 |
| `AllAccountsExcluded` | 全被排除（重试穷举） |
| `AllAccountsProxyDisabled` | 全被自动禁用 |
| `NoAccountsInGroup` | 组绑定但组为空 |

### 精确匹配规则

`available_models_json` 的匹配规则：

- 空数组 → 不参与任何模型选择
- 包含 `resolved_model` → 候选
- `"gpt-4o"` 不等于 `"gpt-4o-mini"`（不前缀匹配）
- 单模型额度耗尽 → 移除对应模型 → 位置匹配此项
- 账号级额度耗尽 → 整个 `available_models_json` 清空

## 账号组

### 设计动机

多个 User Token 需要共享同一个账号池，但不能互相看到对方以外的账号。

### 组模型

```
AccountGroup  (grp_xxx ID )
  ├─ account_1
  ├─ account_2
  └─ account_3

UserToken_A.group_id = grp_xxx  → 使用组内账号
UserToken_B.group_id = grp_yyy → 另一组
UserToken_C.group_id = null  → 使用所有账号
```

### 组操作

- `assign_accounts_to_group`: 增量添加
- `remove_accounts_from_group`: 移除指定成员
- `move_accounts_between_groups`: 原子移动
- `get_group_member_ids`: 按加入时间排序
- `replace_member`: PUT 全量替换

### 失败关闭（Fail Closed）

绑定组的 User Token 在组为空、不存在、服务不可用时，**一律返回失败，不降级到全账号池**。这是 **I2 不变量** 的体现。

## User Token 体系

### 定位

User Token 是提供给外部客户端用于调用代理接口的认证凭据，与管理后台认证分离。

### Token 验证（5 步）

每次代理请求验证：
1. Token 存在性
2. `enabled = true`
3. `expires_at` 未过期（或 null = 永不过期）
4. **IP 数量限制**：不超过 `max_ips`（0 = 无限制）
5. **宵禁检查**：北京时间 UTC+8 的 `curfew_start` ≤ curfew_end 时间范围内禁止

### 关联表

- **token_ip_bindings**：每个 (token_id, ip) 对，记录首次/最后使用时间和请求计数
- **token_usage_logs**：每次请求的 token 消耗、模型和状态

### Token API

```http
GET    /api/user-tokens
POST   /api/user-tokens
GET    /api/user-tokens/summary
PATCH  /api/user-tokens/:id
POST   /api/user-tokens/:id/renew
DELETE /api/user-tokens/:id
```

## 面试高频问题

**Q：为什么要区分 AccountDomain 和 AuthKind？**

两个原因：**组合性** 和 **可维护性**。在 Proxy Manager 设计中，`ApiKey` 域可以适配 OpenAI、Anthropic、Z.AI、本地模型提供方——只要端点支持 `openai_chat` 或 `anthropic_messages` 协议。如果域和认证类型混在一个枚举里，每新增一个 BYOK 服务就要改枚举定义。

**Q：选择器为什么用 available_models_json 而不是可用**？

A: 因为 `available_models_json` 是**后台异步刷新**的，不在请求链路上现算。这避免在热点路径上查询并解析 `quota_json`，降低中位数延迟。而且精确匹配比正则前缀匹配更安全，避免 `"gpt-4"` 误匹配 `"gpt-4o-mini"`。

**Q：AccountLease 和 Account 有什么区别？**

A: Account 是持久化实体，AccountLease 是运行时的只读快照。Lease 中有 `selection_reason` 字段记录了本次投票的原因，这对请求审计至关重要——系统知道"为什么用了这个账号"。

**Q：User Token 组隔离为什么 fail closed？**

A: 假设某User Token 的组 404 in DB。如果系统允许"当不存在时回退使用全部账号"，出问题的效果不是服务中断，而是**账号范围泄露**。租户 B 的请求可能因为数据库故障而被路由到租户 A 的账号池。Fail closed 保证了"当用户不能确认时，默认为拒绝"。

**Q：组删除后的 Token 会发生什么？**

A: Token 的 `group_id` 字段仍然存在，但组已为空。`resolve_selection_scope()` 返回 `SelectionScope::Group { account_ids: [] }`。`select_lease` 立即返回 `NoAccountsInGroup`。Token 所在的客户端会收到 503 错误——这比默默切换到全账号池安全得多。

