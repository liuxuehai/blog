---
title: 异步加载与刷新
description: future 去重、refreshAfterWrite、异常传播与线程池边界。
category: Backend
tags: [Source Reading, Caffeine, Async, LoadingCache]
order: 56
updatedDate: 2026-08-16
difficulty: advanced
status: stable
lastReviewed: 2026-08-16
draft: false
sidebar:
  order: 56
---

异步缓存把正在加载的 `CompletableFuture` 也建模成缓存值，相同 key 的请求复用一个 future。

<!-- more -->

```text
get -> future exists? -> yes: same future
                     -> no: asyncLoad -> put in-flight -> publish/fail
```

`Caffeine#buildAsync` 在 `Caffeine.java:1160`、`1193`；`LocalAsyncLoadingCache#get` 在 `LocalAsyncLoadingCache.java:113`。

### 为什么不先查再加载再 put

**替代方案**：miss 后直接 loader，完成再写回。
**为什么不行**：并发线程会同时 miss，重复请求后端。
**证据**：future 作为节点值，通过原子竞争选择唯一创建者。

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
