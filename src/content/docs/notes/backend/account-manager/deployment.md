---
title: 部署与运维
description: Podman Compose 部署流程、环境变量全表、API Key 账号配置、健康检查端点、验证清单与故障排查。
category: Backend
tags:
  - Rust
  - DevOps
  - Docker
  - Deployment
  - Operations
order: 206
updatedDate: 2025-09-14
difficulty: intermediate
status: stable
lastReviewed: 2025-10-15
draft: false
sidebar:
  order: 206
---

Account Manager 是一个单二进制 Go 服务（纯 Rust），部署模型高度一致：本地开发、测试环境、生产环境共用一套 compose 配置，差异只在于环境变量。

<!-- more -->

## 部署架构

```text
           internet
              |
   ┌──────────▼──────────┐
   │  Reverse Proxy      │
   │  (Caddy / Nginx)    │
   └──────────┬──────────┘
              |
   ┌──────────▼──────────┐
   │  Account Manager    │  ← 仅监听 127.0.0.1:8Port
   │  (Podman Container) │
   └──────────┬──────────┘
              |
   ┌──────────▼──────────┐
   │  PostgreSQL         │  ← 宿主机或其他位置
   │  (ABV_DATABASE_URL) │
   └─────────────────────┘
```

**关键安全约束**：

- 应用只监听 `127.0.0.0.1:8045`，不暴露直接公网
- 公网流量必须经过反向代理
- PostgreSQL 不在 Compose 内管理

## 环境变量表

| 变量 | 别名 | 用途 | 默认值 |
|------|------|------|--------|
| `ABV_API_KEY` | `API_KEY` | 代理接口认证密钥 | — |
| `ABV_WEB_PASSWORD` | `WEB_PASSWORD` | 管理后台密码(优先于 API_KEY) | — |
| `ABV_AUTH_MODE` | `AUTH_MODE` | 认证模式：`Strict` / `Off` | `Strict` |
| `ABV_BIND_LOCAL_ONLY` | — | 只能 127.0.0.1（生产必开） | 未设置（0.0.0.0） |
| `ABV_DATA_DIR` | — | 数据目录（数据库、日志） | 当前目录 |
| `ABV_DATABASE_URL` | `DATABASE_URL` | PostgreSQL 连接串 | 空 → SQLite |
| `ABV_DB_MIN_CONNECTIONS` | — | PostgreSQL 连接池预热连接 | 5 |
| `ABV_DB_MAX_CONNECTIONS` | — | PostgreSQL 连接池上限 | 20 |
| `ABV_DB_ACQUIRE_TIMEOUT_SECS` | — | 等待连接超时 | 10 |
| `ABV_MAX_BODY_SIZE` | — | 最大请求体大小 (bytes) | 104857600 (100MB) |
| `ABV_DIST_PATH` | — | 前端静态资源目录 | `dist` |
| `ABV_PUBLIC_URL` | — | OAuth 回调公网地址 | localhost |
| `RUST_LOG` | — | 日志级别 | `info` |

### 数据库选择规则

```text
ABV_DATABASE_URL 非空 → PostgreSQL
     ↓ 检查串必须以 postgres:// 开头
     ↓ 非法/无法连接 → 立即 crash

ABV_DATABASE_URL 为空 → SQLite（单文件）
     ↓ ABV_DATA_DIR/account_manager.sqlite
     ↓ ABV_DATA_DIR/logs.sqlite
```

### Docker Compose

```yaml
services:
  account-manager:
    image: ghcr.io/you/account-manager:latest
    network_mode: host  # 使用宿主机网络（够连 127.0.0.1）
    environment:
      - ABV_BIND_LOCAL_ONLY=1
      - ABV_API_KEY=...
      - ABV_DATABASE_URL=postgres://...
    ports: []  # host network模式下无效
```

### 发布流程

发布到 GHCR 的 Multi-arch Image：
- `linux/amd64` + `linux/arm64` 双架构
- GitHub Release 挂二进制包
- Compose 拉取 ghcr.io/... 精简镜像

## 管理 API 鉴权

| 方法 | Header | 匹配规则 |
|------|--------|----------|
| `POST /api/...` | `Authorization: Bearer <secret>` | admin_password > api_key |
| `GET /api/...` | `x-api-key: <secret>` | admin_password > api_key |
| `GET /health` | 无需认证 | 放行 |
| `GET /api/health` | 无需认证 | 放行 |

## 健康检查端点

```powershell
# 基础健康检查
curl http://127.0.0.1:8045/health   # 返回 200

# API 健康检查
curl http://127.0.0.1:8045/api/health   # 返回 JSON

# 版本信息
curl http://127.0.0.1:8045/api/version   # Server 版本
```

## 代理请求端到端测试

```powershell
$BASE = "http://127.0.0.1:8045"
$KEY = "your-api-key"
$H = @{ Authorization = "Bearer $KEY"; "Content-Type" = "application/json" }

# OpenAI Chat
$body = '{"model":"gpt-4o-mini","messages":[{"role":"user","content":"Hello"}],"stream":false}'
curl -X POST "$BASE/v1/chat/completions" -H $H -d $body
# 期望: 200

# Anthropic
$body = '{"model":"claude-sonnet-4-20250514","messages":[{"role":"user","content":"Hi"}],"max_tokens":50,"stream":false}'
curl -X POST "$BASE/v1/chat/completions" -H $H -d $body
# 期望: 200 (需要 Anthropic 账号)

# Gemini
$body = '{"model":"gemini-2.5-flash","messages":[{"role":"user","content":"Hello"}],"stream":false}'
curl -X POST "$BASE/v1/messages" -H $H -d $body
# 期望: 200

# 模型列表
curl "$BASE/v1/models" -H $H
# 期望: 返回数组

# 无认证
curl -X POST "$BASE/v1/chat/completions" -H "Content-Type: application/json" -d '{}'
# 期望: 401

# 无可用账号
$body = '{"model":"unknown-xyz","messages":[{"role":"user","content":"x"}]}'
curl -X POST "$BASE/v1/chat/completions" -H $H -d $body
# 期望: 503
```

## 常用诊断命令

```powershell
# 查看日志（trace_id）
rg "trace_id=xyz" /var/log/account-manager/app.log

# 账号可用性
curl "$BASE/api/accounts?domain=codex&enabled=true&status=active" -H "x-api-key: KEY"

# 检查 UserToken
curl "$BASE/api/user-tokens" -H "x-api-key: KEY"

# 刷新单账号 OAuth token
curl -X POST "$BASE/api/accounts/:id/actions/refresh-credential" -H "x-api-key: KEY"

# 批量刷新 token
curl -X POST "$BASE/api/accounts/tokens/refresh" -H "x-api-key: KEY"
```

## 备份策略

| 数据 | 备份方式 | 频率 |
|------|----------|------|
| account.sqlite | rsync/pg_dump | 每天凌晨 |
| logs.sqlite | 按日轮转到 S3 | 每天 |
| state.vscdb (Antigravity/IDE) | 备份原文件 | 修改后 |
| GitHub Actions 发布 | 按需 | 手动/自动发布 |

## 验证清单

部署后验证清单：

- [ ] health 端点返回 200
- [ ] 管理 API 有认证保护
- [ ] OAuth 回调可以正常打开
- [ ] 至少一个账号能成功转发请求
- [ ] 流式响应不截断
- [ ] 跨账号 retry 正确重试 different 账号
- [ ] User Token 隔离正常
- [ ] 额度耗尽账号不会出现在选择中
- [ ] 日志不包含明文 token/API key

## 面试高频问题

**Q：生产环境下为什么责任分区到 Compose 和宿主机 PostgreSQL？**

A: Compose 只包含代理应用 layer（计算），PostgreSQL 由宿主机负责（存储）。这样分离的动机是：数据库备份、恢复、迁移由 DBA/运维已有的流程覆盖，应用开发不管 PostgreSQL 的配置。Conpose 不能强行"内置 PostgreSQL"——那会污染数据层。

**Q：`ABV_BIND_LOCAL_ONLY` 是安全关键吗？**

A: 是。在多租户或公网部署场景下，如果应用直接监听 `0.0.0.0`，任何跳过 Caddy 的扫描器都能直接打应用。只监听 `127.0.0.1` 保证所有流量都必须经过 Caddy/Nginx 才能到达应用——Caddy 可以处理 TLS、限流、路由、IP 过滤这些应用不擅长的功能。

**Q：数据库选择为什么 crash 而不静默 fallback？**

A: 如果 Production 部门配置了 PostgreSQL 连接但 URL 格式错误，静默回退到 SQLite 会发生什么？所有业务数据会写到 SQLite 文件里；PostgreSQL 的空表继续等待数据。第二天用户切到另一个实例时发现自己昨天聊天记录全没了。Crash 在这个场景是**最好的错误处理**——让运维发现配置错误，而不是让架构切换数据丢失。

**Q：`accounts.sqlite` 备份策略为什么建议按日轮转？**

A: 账号数据 —— credentials、status、model_capabilities —— 变化频率很低，但也可能因 OAuth 刷新而更新。按日备轮转保证了**数据新鲜度**（最多丢失 24h 的修改），同时不产生过度备份压力（轮转自动清老文件）。

