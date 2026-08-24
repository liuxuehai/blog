---
title: 整体架构
description: go-zero 从治理组件、RPC 运行时到 goctl 生成链的源码地图。
category: Backend
tags: [Source Reading, go-zero, Go, Architecture]
order: 21
updatedDate: 2026-08-24
difficulty: advanced
status: stable
lastReviewed: 2026-08-24
draft: false
sidebar:
  order: 21
---

go-zero 的架构重点是把“请求保护”和“工程生成”放在同一套默认约束里：运行时负责承载流量，核心库负责限制故障扩散，goctl 负责把契约转换成可运行的服务骨架。

<!-- more -->

## 先给答案：go-zero 的架构重点是把“请求保护”和“工程生成”放在同一套默认约束里：运行时负责承载流量，核心库负…

go-zero 的架构重点是把“请求保护”和“工程生成”放在同一套默认约束里：运行时负责承载流量，核心库负责限制故障扩散，goctl 负责把契约转换成可运行的服务骨架。 正文沿“分层 -> 请求保护顺序 -> 三条主流程”展开：先确认入口和状态归属，再跟踪控制流或数据流的推进，最后落到对外可观察的结果。

主要失效边界集中在“只启用服务端保护、把 CPU shedder 当全局限流、生成代码直接改业务”这些场景。它们破坏的是容量、顺序、并发或生命周期前提；排查时应先确认状态是否仍由正确对象持有，再核对推进条件和清理路径。

## 分层

```text
API / Proto
    |
    +--> goctl parser --> project context --> generated service
                                      |
Client --> resolver --> gRPC --> zrpc interceptors --> logic
                                      |
              breaker / shedder / limit / cache / syncx
```

| 层 | 代表包 | 主要职责 |
| --- | --- | --- |
| 工具层 | `tools/goctl` | 解析 API/Proto，生成配置、服务、逻辑和入口 |
| 传输层 | `zrpc` | gRPC server/client、发现、健康、拦截器、停机 |
| 治理层 | `core/breaker`、`core/load`、`core/limit` | 失败隔离、并发抑制、配额控制 |
| 数据层 | `core/collection`、`core/stores/cache` | 本地/Redis 缓存、回源合并与坏值处理 |
| 并发层 | `core/syncx` | SingleFlight、锁、原子值和资源生命周期 |

## 请求保护顺序

服务端先通过 timeout、recover、统计和鉴权等 interceptor 建立统一边界，再由业务逻辑选择 breaker、shedder、limit 和 cache。客户端侧的 breaker 应放在远程调用之前，避免失败请求继续占用连接、协程和下游配额。

`zrpc.NewServer` 负责把配置转成本地或发布型 RPC server：`zrpc/server.go:29-49`。核心保护组件则保持独立，因此可以被 HTTP、RPC 或后台任务复用，而不绑定到某个传输协议。

## 三条主流程

```text
启动: conf -> NewServer -> interceptors -> register -> health ready -> Serve
调用: Allow -> remote call -> Promise.Accept/Reject -> metrics window
回源: cache hit -> SingleFlight -> double-check -> DB -> cache / placeholder
```

熔断器的入口在 `core/breaker/breaker.go:110-123`，自适应负载保护在 `core/load/adaptiveshedder.go:94-120`，缓存和并发合并分别落在 `core/stores/cache/cachenode.go:187-239` 与 `core/syncx/singleflight.go:29-81`。

## 为什么治理组件保持独立

**替代方案**：把限流、熔断、缓存和 RPC 拦截器写成一个大中间件。
**为什么不行**：不同组件的状态粒度不同，breaker 关注调用结果，shedder 关注进程负载，limit 关注配额，cache 关注数据生命周期；耦合后难以单测和替换。
**证据**：这些能力位于独立 `core` 包，`zrpc` 只负责装配 interceptor 和生命周期。

## 边界与踩坑

| 场景 | 风险 | 处理 |
| --- | --- | --- |
| 只启用服务端保护 | 出站调用仍可能放大故障 | 客户端也配置 breaker、timeout |
| 把 CPU shedder 当全局限流 | 多实例总配额不受控 | 全局配额使用 Redis/令牌桶 |
| 生成代码直接改业务 | 重新生成覆盖修改 | 将业务放在 logic 和扩展层 |
| 停机只关监听 socket | LB 仍认为实例可用 | 先更新 health，再 graceful stop |

## 可迁移知识

高质量微服务框架的价值不只是提供 RPC API，而是把故障边界、资源边界和代码边界固化为默认装配顺序。

> **面试锚点**
> - go-zero 的核心治理能力为什么放在 `core` 而不是 `zrpc`？
> - 请求保护和代码生成如何形成互补？
> - 自适应 shedder 与固定配额限流的边界是什么？

## Related

- [go-zero 总览](/notes/source/go/go-zero/)
- [自适应熔断](/notes/source/go/go-zero/adaptive-breaker/)
- [zrpc 服务治理](/notes/source/go/go-zero/zrpc/)
- [goctl 代码生成](/notes/source/go/go-zero/goctl/)
