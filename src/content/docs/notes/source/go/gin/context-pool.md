---
title: Context 复用与 sync.Pool
description: Gin 如何重置并复用 Context，以及为什么异步 goroutine 必须使用 Copy。
category: Backend
tags:
  - Source Reading
  - Gin
  - sync.Pool
  - Concurrency
order: 13
updatedDate: 2026-08-19
difficulty: advanced
status: stable
lastReviewed: 2026-08-19
draft: false
sidebar:
  order: 13
---

Gin 把请求级状态集中在 `Context`，再用 `sync.Pool` 复用对象。性能收益来自减少分配，但正确性依赖严格的 reset 边界。

<!-- more -->

## 先给答案：Context 池化省掉的是对象分配，不是请求状态本身

Gin 用 `sync.Pool` 复用 `Context`，前提是每次请求开始前彻底 reset，结束后不能再把它当作当前请求的容器。池化只优化生命周期明确、短时间高频创建的对象；它不会让 handler 自动变得线程安全，也不会延长 Context 的有效期。

`Copy` 的存在正是为了跨 goroutine 使用：异步任务需要的是请求数据的快照和可安全访问的副本，而不是把原始 Context 带出请求生命周期。判断能否异步使用时，重点不是“这个指针是否还能访问”，而是数据是否已经与池中下一个请求隔离。


## 生命周期

```text
pool.Get()
   -> writermem.reset + Request = req
   -> Context.reset()
   -> handler chain
   -> 请求结束
   -> pool.Put(context)
```

`Engine` 在 `gin.go:183` 持有 `pool`，`New` 在 `gin.go:225` 设置 `pool.New`，而 `allocateContext` 在 `gin.go:252` 预分配 `Params` 和 skipped nodes 的容量。

## reset 清理了什么

`ServeHTTP` 的取出、初始化和归还集中在 `gin.go:662` 到 `gin.go:674`。`Context.reset` 位于 `context.go:103`，会重置 `Writer`、参数、handlers、index、fullPath、Keys、Errors、Accepted、query/form cache 和 wildcard 回退状态。

其中 `index = -1` 很关键：第一次进入 `Next` 时会先加一，正好执行 chain 的第 0 项，见 `context.go:198`。`Params` 不直接重新分配，而是把底层 slice 截断到 0，配合 `allocateContext` 的容量复用。

## Copy 的边界

`Copy` 在 `context.go:122` 创建独立 Context，把 writer 改为不可写的副本，并把 index 设置成 `abortIndex`，见 `context.go:132`。Keys 通过 `maps.Clone` 复制，参数和 Errors/Accepted 也分别复制，见 `context.go:139` 到 `context.go:160`。

这解决的是 goroutine 跨越请求生命周期的问题：主请求返回后，原 Context 可能被 `pool.Put`，下一请求会再次 reset 并覆盖字段。复制后的数据可以安全读取，但不意味着可以在后台 goroutine 继续写原响应。

### 为什么不用每次 new Context

**替代方案**：每个请求直接 `&Context{}`，请求结束让 GC 回收。
**为什么不行**：高 QPS 下 Context、Params 和临时 slice 都是短命对象，会增加分配和 GC 扫描压力。
**证据**：`ServeHTTP` 明确使用 `engine.pool.Get/Put`，`allocateContext` 还预分配参数和 skipped node 容量，见 `gin.go:252`、`gin.go:662`。

### 为什么不把原 Context 直接传给 goroutine

**替代方案**：异步任务直接捕获 handler 参数中的 `*Context`。
**为什么不行**：请求结束后池会复用它，异步代码读到的是后续请求的数据，甚至和 reset 并发产生数据竞争。
**证据**：`Context.Copy` 的注释明确要求跨 goroutine 使用副本，且它复制 Keys、Params 和 Errors，见 `context.go:122`、`context.go:139`。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| goroutine 捕获原 Context | 日志中的 path/Keys 串请求 | Context 已被池复用 | 启动 goroutine 前 `cp := c.Copy()` |
| Copy 后写响应 | 响应没有按预期发送 | copy writer 的底层 ResponseWriter 被置空 | 异步只读上下文或使用独立通信 |
| 自定义字段未清理 | 请求间残留状态 | 字段不在 Gin 的 reset 清单中 | 不在 Context 上挂可变全局状态 |
| 保存 `Params` slice | 后续请求覆盖数据 | 原参数底层数组复用 | 跨生命周期复制值 |
| 大量 Body 缓存 | 请求内存上涨 | `ShouldBindBodyWith` 把 body 放进 Keys | 只在确需多次绑定时使用 |

## 可迁移知识

- 对象池必须配套“完整 reset 清单”；池化本身不是性能优化的充分条件。
- 异步边界要区分“可读快照”和“可写资源句柄”。复制数据不等于复制连接。
- 预分配 slice 容量适合结构上限可估计的请求元数据，但必须防止异常大输入拖高单对象容量。

> **面试锚点**
> - Gin 为什么能安全复用 Context？reset 做了哪些事？
> - `sync.Pool` 复用和普通缓存有什么区别？
> - 为什么 goroutine 中不能直接使用 handler 的 `*Context`？
> - `Context.Copy` 复制了哪些字段，为什么 writer 要特殊处理？

## Related

- [整体架构](/notes/source/go/gin/architecture/)
- [中间件与 Abort](/notes/source/go/gin/middleware-and-abort/)
- [参数绑定与校验](/notes/source/go/gin/binding-and-validation/)
