---
title: syncx 并发原语
description: SingleFlight、资源管理、锁边界和同 key 请求合并的源码分析。
category: Backend
tags: [Source Reading, go-zero, Go, Concurrency]
order: 24
updatedDate: 2026-08-16
difficulty: advanced
status: stable
lastReviewed: 2026-08-16
draft: false
sidebar:
  order: 24
---

`syncx` 的价值在于把容易写错的并发生命周期封装起来，其中 `SingleFlight` 是缓存回源和重复计算合并的关键原语。

<!-- more -->

## SingleFlight 流程

```text
Do(key, fn)
   |
   +--> lock map
   |      +-- existing call --> wait --> share result
   |      +-- absent ---------> leader
   |
   +--> leader runs fn
   +--> delete map entry
   +--> publish result / Done
```

`Group.Do` 通过 map 和 mutex 查找进行中的 call；`createCall` 登记新的 `WaitGroup`，follower 解锁等待，leader 完成后删除 key 并广播结果：`core/syncx/singleflight.go:29-81`。

## 它解决什么问题

SingleFlight 只合并“同一个 key、同一时间窗口内”的执行，不是缓存，也不提供跨进程协调。它适合：

- 缓存 miss 后的数据库回源；
- 同一配置 key 的并发刷新；
- 代价高但结果可共享的本地计算。

在本地 cache 的 `Take` 中，进入 barrier 后还需要 double-check，因为等待期间可能已有 leader 填充了缓存：`core/collection/cache.go:127-149`。

## 锁边界

关键原则是“持锁只做状态转移，不执行用户函数”。leader 在登记 call 后释放 mutex 才执行 `fn`，否则慢回源会阻塞其他 key 的登记，扩大锁竞争范围。

## 为什么不直接给每个 key 建锁

**替代方案**：为每个缓存 key 永久维护一个 mutex。
**为什么不行**：key 数量不可控，锁对象生命周期和内存回收复杂；请求结束后还要清理锁，容易产生竞态。
**取舍**：SingleFlight 只保存正在执行的 key，完成后删除，内存与并发窗口绑定。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| key 设计过粗 | 无关请求互相等待 | 把租户/参数漏出 key | key 包含完整业务维度 |
| fn 永不返回 | 所有 follower 一直等待 | 没有 timeout/cancel | 给回源函数设置 deadline |
| leader panic | follower 无法收到结果 | 结果发布未进入清理路径 | 用带清理保证的封装 |
| 误认为跨实例去重 | 多实例仍重复回源 | 状态只在进程内 | 跨实例需要 Redis/队列协调 |

## 可迁移知识

并发合并原语的正确性由三件事组成：进行中状态的原子登记、用户函数不持锁执行、无论成功失败都能清理并唤醒等待者。

> **面试锚点**
> - SingleFlight 和 mutex、channel、缓存分别是什么关系？
> - 为什么 leader 执行函数时必须释放全局锁？
> - 如何把 SingleFlight 扩展成可取消、可观测的版本？

## Related

- [缓存一致性与击穿保护](/notes/source/go/go-zero/cache/)
- [整体架构](/notes/source/go/go-zero/architecture/)
- [Gin Context 复用](/notes/source/go/gin/context-pool/)
