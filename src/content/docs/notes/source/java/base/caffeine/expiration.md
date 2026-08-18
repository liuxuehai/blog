---
title: 过期与时间轮
description: 写入过期、访问过期、可变 TTL 和 TimerWheel 的实现取舍。
category: Backend
tags: [Source Reading, Caffeine, Expiration, TimerWheel]
order: 54
updatedDate: 2026-08-16
difficulty: advanced
status: stable
lastReviewed: 2026-08-16
draft: false
sidebar:
  order: 54
---

Caffeine 把过期时间存入节点，在读、写、维护和可选 scheduler 触发时清理；动态 TTL 用时间轮降低调度成本。

<!-- more -->

```text
create/update/read -> variableTime -> fixed queues / TimerWheel
                                      -> recheck -> remove/reschedule
```

固定策略配置在 `Caffeine.java:694`、`759`，动态策略在 `805`；时间计算在 `BoundedLocalCache.java:1436`、`1455`、`1476`；`expireEntries` 在 `858`，`expireVariableEntries` 在 `960`。

### 为什么不用每条目一个定时任务

**替代方案**：每次插入提交一个 `ScheduledFuture`。
**为什么不行**：大量短 TTL 条目带来任务对象、取消成本和队列竞争。
**证据**：`TimerWheel`（`TimerWheel.java:40`）用分层时间桶保存节点并批量推进。

## 刷新与过期

`refreshAfterWrite` 在 `Caffeine.java:879` 配置，是重新加载而不是立即删除；`expireAfterWrite` 则让值失效。刷新判断在 `BoundedLocalCache.java:1293`、`1303`。

## 边界与踩坑

| 场景 | 原因 | 规避 |
| --- | --- | --- |
| 没有 scheduler | 物理删除滞后 | 空间敏感时配置 scheduler |
| `Expiry` 返回 0 | 条目快速失效 | 明确 TTL 语义 |
| refresh 与 expire 同时配置 | 新值未完成就失效 | 给加载留出余量 |

## 可迁移知识

时间轮适合海量定时任务、连接超时、会话过期和重试调度，应权衡精度与管理成本。

> **面试锚点**
> - 过期是主动还是被动？
> - TimerWheel 为什么需要多层？
> - refreshAfterWrite 与 expireAfterWrite 有何区别？

## Related

- [写后队列与维护](/notes/source/java/base/caffeine/write-buffer/)
- [异步加载与刷新](/notes/source/java/base/caffeine/async-loading/)
