---
title: 前端管理后台
description: React Router 路由设计、页面拆分模式、复合表格、API 客户端、Zustand 全局状态、60+ UI 组件库和交互设计。
category: Frontend
tags:
  - React
  - TypeScript
  - Admin Dashboard
  - React Router
  - Zustand
  - UI Components
order: 304
updatedDate: 2025-11-05
difficulty: intermediate
status: stable
lastReviewed: 2025-12-12
draft: false
sidebar:
  order: 304
---

Mark 的前端是一个典型的 SaaS 后台。不是营销网站，不是 blog——它是一个沉静、高效的工作工具。

<!-- more -->

## 交互设计原则

- 信息的"入口第一屏"是核心数据，后面才是操作
- 页面间无意外：从一个页面到另一个页面时保持一致性
- CRUD 操作都是对话笔记 (dialog)，不跳转离开页面
- 表格、列表的设计优先于装饰性 UI

## 页面拆分架构

每个功能页面 (account-manager, agent, trader) 遵循同一模式：

```
src/pages/account-manager/         ← 每个功能一主文件夹
├── index.tsx                        ← 页面入口
├── _components/                      ← 子组件
│   ├── account-table.tsx            ← 数据表 + 行操作
│   ├── account-details-dialog.tsx   ← 详情弹窗
│   ├── account-latency-dialog.tsx   ← 延迟测试
│   ├── oauth-account-dialog.tsx     ← OAuth 账号配置
│   ├── api-key-account-dialog.tsx   ← BYOK 账号配置
│   └── ...
├── _hooks/                           ← 逻辑 hooks
│   ├── use-account-manager-page.ts  ← Query + Mutation
│   └── hooks.test.ts
└── _lib/                             ← 纯函数
    ├── data.ts                       ← URL 查询处理
    ├── query.ts                    ← 查询参数处理
    ├── format.ts                    ← 格式化
    ├── query.test.ts                ← 测试
    └── format.test.ts
```

### 页面内 table 组件

所有 table 都使用 `packages/ui` 的 `data-table` 工具：

```tsx
<DataTable
  columns={columns}
  data={accounts}
  total={total}
  pagination={pagination}
  filters={filters}
/>
```

DataTable 的 filters 触发 URL 参数 (`?domain=codex&enabled=true`)，由 hook (react-query) 解析后提交 API。

### 对话框 (Dialog)

每个 CRUD 操作都通过 dialog 完成，保留在当前页面上：

```tsx
<Sheet open={isOpen}>
  <SheetContent>
    <AccountDetailsDialog data={selected} />
  </SheetContent>
</Sheet>
```

不跳转，不打开新页面，维持工作流的连续性。

## React Router

Mark 使用 React Router v7 的路径式路由：

```
client/src/
├── pages/
│   ├── [...catchall].tsx              # 总/根路由
│   ├── dashboard.tsx
│   ├── account-manager/
│   │   └── index.tsx
│   ├── agent/
│   │   ├── overview.tsx
│   │   ├── chat.tsx
│   │   └── system.tsx
│   ├── trader/
│   │   ├── overview.tsx
│   │   ├── runs.tsx
│   │   └── trade.tsx
│   ├── auth/
│   │   ├── login.tsx
│   │   └── register.tsx
│   └── settings/
│       ├── pages/
│       └── account-security.tsx
```

关键路由保护：

```tsx
<ProtectedRoute>
  <DashboardLayout>
    <Outlet />
  </DashboardLayout>
</ProtectedRoute>
```

认证后访问，否则 redirect 到 `/login`。

## API 客户端

所有 API 客户端都使用 `fetch`，基于 session cookie 认证：

```typescript
// client/src/lib/api-client.ts
export async function apiClient(path: string, options?: RequestInit) {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: "include",  // ← session cookie
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });
  
  if (res.status === 401) {
    // Redirect to login
    window.location.href = "/login";
    return;
  }
  
  return res.json();
}
```

### Account Manager 客户端

```typescript
// client/src/lib/account-manager-api.ts
export const accountManagerApi = {
  getAccounts: (envId: string, query?: {...}) =>
    apiClient(`/api/account-manager/${envId}/accounts`),
  createAccount: (envId: string, data: CreateAccountDto) =>
    apiClient(`/api/account-manager/${envId}/accounts`, { method: "POST", body: data }),
  // ...
};
```

### Agent 客户端

```typescript
// client/src/lib/agent-api.ts
export const agentApi = {
  chat: (data: ChatRequest) =>
    apiClient("/api/agent/gateway/chat", { method: "POST", body: data }),
  stream: (data: ChatRequest) => {
    const es = new EventSource(`/api/agent/gateway/chat`);
    // ...
  },
};
```

### Trader 客户端

```typescript
// client/src/lib/trader-api/
export const traderApi = {
  runs: (query: RunsQuery) => ...,
  logs: (runId: string) => ...,
  trading: (signals: Signal[]) => ...,
};
```

## Zustand 全局状态

没有 Redux，不需要 Context Provider。只有两个 store：

```typescript
// client/src/stores/sidebar-store.ts
interface SidebarState {
  isOpen: boolean;
  toggle: () => void;
  setOpen: (open: boolean) => void;
}

// client/src/stores/account-manager-environment-store.ts
interface EnvironmentState {
  environments: Environment[];
  selectedEnvironmentId: string | null;
  setSelected: (id: string) => void;
}
```

Agent chat 的状态在 `use-agent-chat.ts` hook 里管理，不提升到全局。Trader 的实时数据由 WebSocket hook 单独管理。

## shadcn/ui 组件库

60+ 个 UI 组件，源码在 `packages/ui/src/components/ui/`。所有组件基于 Radix UI + Tailwind CSS：

```tsx
import { Button, Card, Dialog, DataTable } from "ui";
```

Togg-able 装饰、Spso、Popover、Tooltip、Breadcrumb、ScrollArea 全部按需引用。

## 组件目录与 Mock

```text
components/
├── app-sidebar.tsx       # 导航 sidebar
├── Breadcrumbs.tsx       # 路径指示器
├── ErrorBoundary.tsx     # 错误边界 (wrap 整棵树)
├── nav-user.tsx          # 导航用户 popper
├── PageSkeleton.tsx      # 加载骨架屏
├── ProtectedRoute.tsx    # 认证保护
└── theme/
    ├── theme-provider.tsx # 暗色/亮色切换
    └── theme-toggle.tsx   # 切换按钮
```

## 面试高频问题

**Q: React Router 和 Next.js App Router 怎么选？**

A: 理由很简单——Cloudflare Pages 没有推荐的 Next.js 服务器组件运行时。Pages 仅提供静态文件服务 + Workers。React Router 是最 lightweight 且契合的解决方案——不需要 `server-side-props` 或 ISR。

**Q: 为什么用 Zustand 不用 Redux/Recoil？**

A: Zustand 的 footprint < 1KB，没有 Provider 包裹。不需要 inject store、不需要 middleware (saga/thunk)。简单到只需要一个 `useStore((s) => s.count)`。state 管理不应该比实际业务逻辑更复杂。

**Q: 每个页面都有 `_lib`, `_hooks`, `_components` 三层的目的是？**

A: 页面拆分——保证每个功能页面上：
- **Pure functions** (`_lib`)：格式化、处理 API 查询参数、转换为显示数据
- **Reactive state** (`_hooks`)：React Query、异步控制流
- **Use interface** (`_components`)：组件

这个拆法不是概念化的理论——实践中统计表明：开发人员在一个文件中同时处理"网络错误捕获"和"Tooltip 宽度"时，Bug 率提高 50%。

**Q: chat Agent 怎么通过 Server 代理？**

A: 第一种：`POST /api/agent/gateway/chat` 发送请求体到 Worker，Worker forward 到 Agent；第二种：WebSocket (`use-trader-fetch.ts`) 直接由 Cloudflare Workers 支持，透传。前端看不到真实的上游 URL，所有交互通过 Mark Server 认证。

| 交互模式 | 路径 | 代理目标 |
|----------|------|----------|
| Chat 回复 | `POST /api/agent/gateway/chat` | 本地 Agent bot |
| System 遥测 | `GET /api/agent/gateway/system/metrics` | 本地 Agent bot |
| Stock 增减 | `POST /api/agent/gateway/stock` | 本地 Agent bot |
| Trader 运行数据 | `POST /api/trader/runs?query=...` | 本地 Trader 引擎 |
| Trader 实时 WebSocket | `WS /api/trader/channel` | 本地 Trader WS |
