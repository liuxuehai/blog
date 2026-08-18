---
title: Actix Web 面试专题
description: Actix Web worker、ServiceFactory、路由、提取器、中间件与 WebSocket Actor 的源码级高频题。
category: Backend
tags: [Source Reading, Actix Web, Rust, Interview]
order: 49
updatedDate: 2026-08-17
difficulty: advanced
status: stable
lastReviewed: 2026-08-17
draft: false
sidebar:
  order: 49
---

Actix Web 面试最常见的误区是把它等同于 Actor。高质量回答应先讲 worker 与 ServiceFactory，再说明 Actor 的可选边界。

<!-- more -->

## 1. Actix Web 的核心请求模型是什么

`HttpServer` 为每个 worker 调用应用工厂，`ServiceFactory::new_service` 构建本地 Service 树；请求在 `AppRouting`、Resource、Route 和 middleware Service 中流转。普通 HTTP 不经过 Actor mailbox。

## 2. App factory 为什么会执行多次

至少每 worker 一次，并可能随 bind 地址增加。源码约束和说明在 `server.rs:99-162`。昂贵共享资源应在外部创建，再 clone handle 进闭包。

## 3. ServiceFactory 与 Service 的区别

Factory 属于初始化面，可异步创建每 worker Service；Service 属于数据面，接收请求并返回 Future。这样允许局部 `Rc` 状态和异步依赖初始化。

## 4. Scope、Resource、Route 怎么分工

Scope 提供路径前缀和嵌套作用域，Resource 代表路径模式与一组 routes，Route 用 method/guard 选择 handler service。源码：`scope.rs:57`、`resource.rs:51`、`route.rs:23`。

## 5. Extractor 如何拿 body

所有 `FromRequest` 接收 `&HttpRequest` 与同一个 `&mut Payload`（`extract.rs:65-93`）。多个聚合 body extractor 会竞争同一流，业务应指定唯一 body owner。

## 6. `Data<T>` 是全局单例吗

不必然。它是 `Arc<T>` 包装，但放进哪个 App/Scope/Resource extensions 决定作用域；若在每次 App factory 内 `Data::new`，则通常是 per-worker 实例。

## 7. Transform 为什么存在

中间件需要先用内层 Service 初始化出 middleware Service。配置解析、缓存构建和异步 init 留在 worker 启动期，热路径只执行 `call`。

## 8. Actix Web 的 Future 为什么可以 non-Send

worker 运行本地服务树，future 不必在线程间迁移，因此大量使用 `LocalBoxFuture`。代价是 worker 内阻塞会影响该 worker 上的所有请求。

## 9. Actor 在哪里使用

典型在 `actix-web-actors` 的 WebSocket 集成：`ws::start` 建立升级响应，`WebsocketContext` 驱动 actor 与 frame stream。普通 REST handler 不需要 Actor。

## 10. 单个 worker CPU 100% 怎么排查

```text
同步阻塞/长 CPU handler
  -> middleware 持 borrow/锁跨 await
  -> local task 自唤醒循环
  -> WebSocket actor handler 长时间不返回
  -> body decode/压缩热点
```

按 worker 线程采样，同时记录请求到 worker 的分布和 service span。

## 11. Actix Web 与 Axum 怎么选

看 Tower 生态、non-Send/worker-local 需求、状态注入偏好、团队运行时经验和现有组件，不应只看 hello-world benchmark。

## 12. 一句话总结 Actix Web

Actix Web 用 ServiceFactory 为每个 worker 异步构建局部 Service 树，用 Scope/Resource/Route 分层路由，用 FromRequest/Responder 适配业务函数，并把 Actor 保留为 WebSocket 等长连接的可选模型。

## Related

- [Actix Web 整体架构](/notes/source/rust/actix-web/architecture/)
- [HttpServer 与 Worker](/notes/source/rust/actix-web/server-worker/)
- [与 Axum 的设计对照](/notes/source/rust/actix-web/axum-compare/)
