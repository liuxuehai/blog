---
title: ServiceFactory 与路由树
description: AppInit 初始化、AppRouting 匹配、Scope/Resource/Route 分层与 guard fallback。
category: Backend
tags: [Source Reading, Actix Web, Routing, ServiceFactory]
order: 42
updatedDate: 2026-08-24
difficulty: advanced
status: stable
lastReviewed: 2026-08-24
draft: false
sidebar:
  order: 42
---

Actix Web 路由不是一张运行时字符串表，而是启动时由多个 `HttpServiceFactory` 注册、再异步实例化出的 Service 树。

<!-- more -->

## 先给答案：Actix Web 路由不是一张运行时字符串表，而是启动时由多个 HttpServiceFactory 注…

Actix Web 路由不是一张运行时字符串表，而是启动时由多个 HttpServiceFactory 注册、再异步实例化出的 Service 树。 正文沿“三层路由 -> App 初始化 -> Resource 与 guard”展开：先确认入口和状态归属，再跟踪控制流或数据流的推进，最后落到对外可观察的结果。

主要失效边界集中在“动态注册期待热更新、同路径 guard 重叠、Scope appdata 覆盖全局”这些场景。它们破坏的是容量、顺序、并发或生命周期前提；排查时应先确认状态是否仍由正确对象持有，再核对推进条件和清理路径。

## 三层路由

```text
AppRouting
  -> ScopeService      前缀与嵌套命名空间
     -> ResourceService 路径模式与 guard 集合
        -> RouteService method/guard + handler service
```

`Scope` 定义在 `actix-web/src/scope.rs:57-65`，其工厂与服务分别在 `:462-516`、`:518-551`。`Resource` 定义在 `resource.rs:51-58`，工厂/服务在 `:518-548`、`:550-572`。`Route` 位于 `route.rs:23-31`，`RouteService` 在 `:114-151`。

## App 初始化

`AppInit::new_service`（`app_service.rs:48-160`）完成：

1. 建立默认 404 service；
2. 调用所有注册 factory 写入 `AppService`；
3. 构造 `AppRoutingFactory` 与 `ResourceMap`；
4. 等待异步 data factory；
5. 初始化 middleware endpoint；
6. 返回 `AppInitService`。

`AppRoutingFactory` 定义于 `app_service.rs:262-317`，会为每个资源定义异步创建 endpoint service。数据面 `AppRouting::call` 在 `:324-349`：router 命中后记录 path match，并调用对应 service；否则走默认 service。

## Resource 与 guard

路径模式匹配由 `actix-router` 的 `ResourceDef` 和 `Router` 完成。一个 Resource 下可有多条 Route；Route guard 检查 method、header 等条件。若路径命中但全部 guard 失败，ResourceService 使用 default service，通常形成 405 或用户定义结果。

## 为什么需要 ServiceFactory

**替代方案**：注册时立即创建所有 middleware 和 endpoint service。

**为什么不行**：部分服务初始化是异步的，且每 worker 需要独立实例；注册期还没有完整 `AppConfig` 与 worker runtime。

**证据**：`AppInit::new_service`、`AppRoutingFactory::new_service`、`ResourceFactory::new_service` 都返回 `LocalBoxFuture`（`app_service.rs:64`、`:280`、`resource.rs:529`）。

## 路由顺序与组合

| 组件 | 组合 API | 坐标 |
| --- | --- | --- |
| App | `service` / `route` | `app.rs:243` / `:217` |
| Scope | `service` / `route` | `scope.rs:232` / `:203` |
| Resource | `route` | `resource.rs:240` |
| Route | `guard` / `method` | `route.rs:214` / `:228` |

路由重叠时要关注注册顺序与 guard；不要依赖模糊模式“碰巧”先命中。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| 动态注册期待热更新 | 运行中无变化 | 服务树在 worker 初始化完成 | 重建服务/进程或显式动态路由层 |
| 同路径 guard 重叠 | 命中非预期 Route | 顺序与 guard 共同决定 | 路由表测试覆盖边界 |
| Scope app_data 覆盖全局 | extractor 得到局部值 | extensions 有层级优先级 | 明确状态作用域并命名类型 |
| init future 失败 | worker 无法启动 | middleware/data 初始化错误 | 启动探针与失败即退出 |

## 可迁移知识

路由与中间件可先注册成声明式 factory graph，再在执行单元启动时完成异步实例化。这样既支持依赖注入，也能为每 worker 生成局部优化实例。

> **面试锚点**
> - Scope、Resource、Route 各负责什么？
> - 路由为什么在 worker 初始化时构建？
> - 路径命中但 method 不匹配如何处理？

## Related

- [HttpServer 与 Worker](/notes/source/rust/actix-web/server-worker/)
- [Extractor 与 Handler](/notes/source/rust/actix-web/extractors-handler/)
- [Axum 路由与状态共享](/notes/source/rust/axum/routing-state/)
