---
title: Kratos App 生命周期
description: Kratos App 的启动、服务器并发、注册发现、信号处理和优雅停止。
category: Backend
tags: [Source Reading, Kratos, Go, Lifecycle]
order: 31
updatedDate: 2026-08-22
difficulty: advanced
status: stable
lastReviewed: 2026-08-22
draft: false
sidebar:
  order: 31
---

`App` 是 Kratos 的生命周期编排器。它不创建具体服务器，而是把 hooks、server、registrar 和 OS signal 排成可观察的启动与退出顺序。

<!-- more -->

## 先给答案：Kratos 用统一生命周期把“启动顺序”和“退出顺序”显式化

应用启动时依次准备依赖组件，再启动 HTTP/gRPC server；收到退出信号后先停止接收新请求，再等待在途请求、关闭连接、停止后台任务并注销注册信息。生命周期接口的价值是把这些动作从 main 函数里的手工顺序变成可组合流程。

如果启动顺序错误，server 可能先接收请求但配置或注册中心尚未就绪；如果退出顺序错误，实例会先从进程消失再从注册中心删除，调用方会得到一段时间的连接失败。优雅退出的本质是控制状态转换，而不是简单延迟几秒。

## Run 顺序

```text
buildInstance
    |
beforeStart hooks
    |
start all servers concurrently
    |
register service
    |
afterStart hooks
    |
signal or Stop
    |
deregister -> cancel -> server.Stop
    |
afterStop hooks
```

`Run` 在 `app.go:82-150` 完成全流程：先生成 instance，再执行 `beforeStart`，使用 errgroup 并发启动 server，等待启动 goroutine 进入运行态后注册，最后监听信号。注册超时由 `options.go:86-99` 的 registrar/stop timeout 控制。

## 为什么先启动再注册

注册前必须确保 endpoint 已监听，否则服务发现可能拿到一个尚未可用的地址。`buildInstance` 会优先使用显式 endpoints，没有时从实现 `transport.Endpointer` 的 server 读取实际地址：`app.go:176-198`。

## 停止语义

`Stop` 先执行 `beforeStop`，再调用 registrar.Deregister，最后取消 App context：`app.go:153-173`。服务器停止 goroutine 监听该 context，使用 `context.WithoutCancel` 保留停止阶段上下文，并可附加 `stopTimeout`：`app.go:100-117`。

## 设计取舍

**替代方案**：收到信号后直接强制退出进程。
**问题**：请求、注册信息和连接没有释放机会。
**设计**：先摘除注册，再广播取消，server 自己实现协议级优雅停止；超时后由具体 transport 强制收尾。

## 边界与踩坑

| 场景 | 风险 | 处理 |
| --- | --- | --- |
| afterStart 失败 | 服务已注册但启动失败 | 业务 hook 要保证幂等并主动清理 |
| registrar 超时 | Run 直接返回错误 | 调整 RegistrarTimeout，不要无限等待 |
| 多 server | 部分启动成功 | errgroup 汇总错误，停止路径需可重复 |
| Stop 多次调用 | 重复注销 | registrar 实现应具备幂等性 |

## 可迁移知识

服务生命周期的关键不是“启动函数”，而是注册可见性、流量接收和退出顺序之间的契约。

> **面试锚点**
> - 为什么注册发生在 server 启动之后？
> - `errgroup` 和 `WaitGroup` 在 Run 中分别承担什么职责？
> - Kratos 如何保证优雅停止有超时边界？

## Related

- [整体架构](/notes/source/go/kratos/architecture/)
- [注册发现与负载选择](/notes/source/go/kratos/registry-selector/)
- [go-zero zrpc 服务治理](/notes/source/go/go-zero/zrpc/)
