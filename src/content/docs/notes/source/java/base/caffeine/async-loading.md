---
title: 异步加载与刷新
description: future 去重、refreshAfterWrite、异常传播与线程池边界。
category: Backend
tags: [Source Reading, Caffeine, Async, LoadingCache]
order: 56
updatedDate: 2026-08-24
difficulty: advanced
status: stable
lastReviewed: 2026-08-24
draft: false
sidebar:
  order: 56
---

异步缓存把正在加载的 `CompletableFuture` 也建模成缓存值，相同 key 的请求复用一个 future。

<!-- more -->

## 先给答案：异步缓存把正在加载的 CompletableFuture 也建模成缓存值，相同 key 的请求复用一个 f…

异步缓存把正在加载的 CompletableFuture 也建模成缓存值，相同 key 的请求复用一个 future。 正文沿“refreshAfterWrite -> 线程池边界”展开：先确认入口和状态归属，再跟踪控制流或数据流的推进，最后落到对外可观察的结果。

主要失效边界集中在“异步 API 只负责 future 编排，不保证 loader 非阻塞”这些场景。它们破坏的是容量、顺序、并发或生命周期前提；排查时应先确认状态是否仍由正确对象持有，再核对推进条件和清理路径。

## refreshAfterWrite

旧值仍可返回，刷新 future 在后台替换。刷新判断在 `BoundedLocalCache.java:1293`、`1303`，配置入口是 `Caffeine.java:879`。刷新失败不应无条件删除旧值。

## 线程池边界

异步 API 只负责 future 编排，不保证 loader 非阻塞。阻塞 IO 应使用隔离 executor、超时和限并发。

## 边界与踩坑

| 场景 | 原因 | 规避 |
| --- | --- | --- |
| future 长时间不完成 | 后端无超时 | loader 加超时和取消 |
| refresh 失败 | 替换尝试失败 | 记录异常并保留旧值 |
| 阻塞 loader | common pool 堵塞 | 使用独立线程池 |

## 可迁移知识

in-flight future 去重可用于 HTTP 合并、配置刷新、token 获取和 single-flight；必须定义失败、超时和取消。

> **面试锚点**
> - 异步缓存如何防止击穿？
> - refresh 失败时为什么保留旧值？
> - loader 应使用哪个线程池？

## Related

- [并发读写路径](/notes/source/java/base/caffeine/concurrency/)
- [过期与时间轮](/notes/source/java/base/caffeine/expiration/)
