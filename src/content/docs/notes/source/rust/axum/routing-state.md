---
title: 路由与状态共享
description: Router 的路径匹配、MethodRouter 分派、nest/merge、fallback 与缺失状态类型。
category: Backend
tags: [Source Reading, Axum, Routing, State]
order: 24
updatedDate: 2026-08-17
difficulty: advanced
status: stable
lastReviewed: 2026-08-17
draft: false
sidebar:
  order: 24
---

Axum 路由由两级分派组成：先用 `matchit` 匹配路径，再由 `MethodRouter` 匹配 HTTP method。`Router<S>` 的 `S` 表示“仍缺少、需要在运行前提供的状态”。

<!-- more -->

## 两级路由

```text
URI path
  -> PathRouter / matchit::Router<RouteId>
  -> 写入 URL params 与 MatchedPath
  -> Endpoint::MethodRouter
  -> MethodRouter 按 GET/POST/... 选择 Route
  -> fallback / 405
```

`Router<S>` 保存 `path_router`、`fallback_router`、`default_fallback` 与 v0.7 checks 标记（`axum/src/routing/mod.rs:86-94`）。`PathRouter` 的内部匹配器包装在 `routing/path_router.rs:404-432`，调用入口在 `path_router.rs:325-372`。`MethodRouter` 定义在 `routing/method_routing.rs:549-558`，实际 method 分派在 `method_routing.rs:1200-1251`。

## route、nest、merge

- `Router::route` 把 `MethodRouter` 插入路径树（`routing/mod.rs:192-205`）。
- `Router::nest` 同时处理路径前缀、fallback 与 nested path extensions（`routing/mod.rs:220-249`）。
- `Router::merge` 合并两棵路由树，并检查 fallback 冲突（`routing/mod.rs:250-301`）。
- `MethodRouter::merge` 合并 method endpoint，重复 method 会 panic（`routing/method_routing.rs:1171-1198`）。

## “缺失状态”模型

`Router<S>` 不是“已经持有 S”，而是“还需要一个 S”。调用 `with_state(state: S)` 后返回 `Router<S2>`（`routing/mod.rs:444-450`）；通常让 `S2 = ()`，此时 Router 才能直接作为 Service 或交给 `serve`。`State<T>` extractor 定义在 `extract/state.rs:301`，借助 `FromRef<S>` 从应用状态投影子状态（`extract/state.rs:304-324`）。

```text
Router<AppState> --with_state(app_state)--> Router<()>
     缺状态                              可运行
```

### 为什么状态类型表达“缺少”而不是“拥有”

**替代方案**：`Router<S>` 永远表示内部已经存有 S。

**为什么不行**：路由组合时很难区分“构建模板”和“可运行服务”，嵌套路由也容易过早固定状态。

**证据**：`with_state<S2>` 消费当前缺失类型并返回新的缺失类型（`routing/mod.rs:444`）；只有 `Router<()>` 的 Service/make-service 路径最自然。

## fallback 语义

404 与 405 分开：路径没匹配走 Router fallback；路径存在但 method 不匹配走 MethodRouter fallback。`default_fallback` 标记用于 merge 时判断用户是否已自定义 fallback，避免静默覆盖。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| 重复注册同 path+method | 构建期 panic | 路由冲突无法确定优先级 | 集中路由表并写启动测试 |
| nest 后 URI 认知错误 | middleware 看到的路径不同 | nested path 会写扩展并剥前缀 | 使用 `OriginalUri` / `NestedPath` 明确语义 |
| 状态被多层 `Arc<Mutex<_>>` 包裹 | 锁粒度失控 | 把整个应用状态当共享可变对象 | 按领域拆 state，内部选并发结构 |
| fallback 被 merge 覆盖或冲突 | panic 或响应变化 | 两棵树都定义自有 fallback | merge 前约定唯一所有者 |

## 可迁移知识

路由树与 method 表分层，可把路径匹配算法和 HTTP 语义解耦；用类型参数表示“尚未满足的构建依赖”，则可在编译期区分 builder 与 runnable object。

> **面试锚点**
> - Axum 为什么要做路径与 method 两级路由？
> - `Router<S>` 中的 S 为什么是 missing state？
> - 404 fallback 与 405 fallback 有什么不同？

## Related

- [Extractor 类型级管线](/notes/source/rust/axum/extractors/)
- [中间件与错误边界](/notes/source/rust/axum/middleware-errors/)
- [Actix Web Service 与路由树](/notes/source/rust/actix-web/service-routing/)
