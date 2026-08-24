---
title: HttpServer 与 Worker
description: Actix Web 应用工厂、worker 数、listener、阻塞池、连接限制与优雅关闭。
category: Backend
tags: [Source Reading, Actix Web, Server, Worker]
order: 41
updatedDate: 2026-08-22
difficulty: advanced
status: stable
lastReviewed: 2026-08-22
draft: false
sidebar:
  order: 41
---

`HttpServer` 把 socket listener 和应用服务工厂交给 `actix-server`。最容易踩坑的点是：传入 `HttpServer::new` 的闭包不是单例构造器，而是 per-worker 服务工厂。

<!-- more -->

## 先给答案：Worker 模型把连接处理分散到多个独立执行上下文

主线程负责监听和分发，worker 持有自己的事件循环与服务实例，连接在 worker 内推进。这样减少共享锁并让局部状态更容易管理，但跨 worker 的共享必须通过 `Arc`、同步原语或消息传递完成。

worker 数量不是越多越快：CPU 密集任务会阻塞所属 worker，连接分布不均会造成局部拥塞，过多 worker 又会增加上下文和缓存开销。性能排查要同时看 worker 利用率、请求分布和阻塞任务。

## 启动路径

```text
HttpServer::new(factory)
  -> configure workers/listeners/timeouts
  -> bind/listen
  -> create service factory for each socket
  -> actix_server::ServerBuilder::run
  -> each worker calls factory()
  -> ServiceFactory::new_service(AppConfig)
```

`HttpServer` 定义在 `actix-web/src/server.rs:75-96`，`new` 在 `:117-151`，默认配置包含 keep-alive、header timeout、disconnect timeout 和 HTTP/2 window。worker 数设置在 `:158-162`，默认取可用并行度；阻塞池上限在 `:224-228`。

`bind` 入口位于 `server.rs:503-516`，最终 `run` 在 `:1348-1353` 把 server builder 转成 Future。优雅关闭等待时间由 `shutdown_timeout`（`:430-434`）设置。

## 每 worker 一棵应用树

factory 约束为 `F: Fn() -> I + Send + Clone + 'static`（`server.rs:99-103`）。文档明确 factory 至少每 worker 执行一次；若解析出多个 bind 地址，还会按地址和 worker 组合创建更多实例。

这意味着：

- 在 factory 内新建数据库池可能得到多个池；
- `Data::new` 在 factory 内创建会得到 worker 隔离的数据；
- 希望全局共享时，应先在外部创建 `Data`/`Arc`，闭包只 clone handle。

## Worker-local 的收益与代价

```text
listener(s)
  -> worker 1: App Service + local tasks
  -> worker 2: App Service + local tasks
  -> worker N: App Service + local tasks
```

收益是 handler/middleware Future 不必全部 `Send`，局部服务可使用 `Rc`。代价是单个 worker 被同步阻塞时，该 worker 上的连接一起受影响，状态与缓存还可能按 worker 分片。

### 为什么不是每请求一个 OS 线程

**替代方案**：accept 后为每连接或每请求创建线程。

**为什么不行**：高连接数下线程栈与上下文切换成本高，keep-alive 空闲连接会浪费线程。

**证据**：`HttpServer` 只配置固定 worker 数（`server.rs:158`），异步连接在 worker runtime 上复用执行；阻塞工作另有 per-worker blocking pool（`:224`）。

## 连接与关闭参数

| 参数 | 作用 | 坐标 |
| --- | --- | --- |
| `workers` | 每 bind 地址 worker 数 | `server.rs:158` |
| `backlog` | listen backlog | `server.rs:184-188` |
| `max_connections` | 每 worker 并发连接上限 | `server.rs:199-203` |
| `worker_max_blocking_threads` | 每 worker blocking pool 上限 | `server.rs:224-228` |
| `shutdown_timeout` | graceful stop 等待秒数 | `server.rs:430-434` |

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| factory 内创建全局昂贵资源 | 连接数成倍增长 | factory 多次执行 | 外部创建后 clone `Data` |
| worker 设太多 | 内存和连接池放大 | 每 worker 一套服务与局部资源 | 结合 CPU、连接与下游池测量 |
| handler 调同步 DNS/文件 IO | 单 worker 长尾 | 阻塞 current-thread runtime | 使用异步 API 或 blocking pool |
| shutdown 超时太短 | 请求被强制中断 | grace window 不够 | 按最长合法请求配置并做 drain |

## 可迁移知识

服务工厂模型把“可跨线程复制的蓝图”和“线程本地可执行实例”分开。它适合需要弱化 `Send/Sync` 约束、又能接受状态分片的服务器架构。

> **面试锚点**
> - `HttpServer::new` 的 factory 会调用几次？
> - 每 worker App 对共享状态有什么影响？
> - 阻塞调用为什么只拖慢部分请求但仍很危险？

## Related

- [Actix Web 整体架构](/notes/source/rust/actix-web/architecture/)
- [ServiceFactory 与路由树](/notes/source/rust/actix-web/service-routing/)
- [Tokio 阻塞、取消与关闭](/notes/source/rust/tokio/blocking-cancellation/)
