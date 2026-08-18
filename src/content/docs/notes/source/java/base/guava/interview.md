---
title: 面试专题
description: Guava 不可变集合、LocalCache、EventBus 与 RateLimiter 的源码级面试题。
category: Backend
tags: [Source Reading, Guava, Interview]
order: 69
updatedDate: 2026-08-16
difficulty: advanced
status: stable
lastReviewed: 2026-08-16
draft: false
sidebar:
  order: 69
---

Guava 面试题的区分度在于：能否说出数据结构、状态边界和失效场景，而不只是复述 API 名称。

<!-- more -->

## 高频题

### ImmutableSet 为什么需要 hash table？

**30 秒版**：数组保证迭代紧凑，hash table 保证 `contains` 的常数级查找。Builder 阶段先用开放寻址去重，构造后保存不可变数组和必要的查找表。

**展开**：入口在 `ImmutableSet.java:174`、Builder 在 `:414`，普通实现是 `RegularSetBuilderImpl`（`:667`）。如果检测到碰撞链风险，`review` 会切换到 JDK-backed 实现（`:734`、`:886`）。

**加分项**：这是用构造期成本换运行期读性能，并保留异常 hash 分布的安全回退。

**常见错答**：说 ImmutableSet 只保存数组，会忽略 `contains` 的查找结构。

### Guava Cache 如何避免同一个 key 被重复加载？

**30 秒版**：miss 时先放入加载占位，只有一个线程执行 loader，其他线程等待同一个结果。

**展开**：`LocalCache` 位于 `LocalCache.java:110`，Segment 是 `:1864`，加载和刷新相关逻辑在 `:2385` 附近。占位把“查不到值”和“正在加载”区分开。

**加分项**：它合并的是同 key 的重复工作，不等于解决远端一致性，也不等于自动提供超时。

**常见错答**：把 Cache miss 说成每个线程都会独立调用 loader。

### RateLimiter 和 Semaphore 有什么区别？

**30 秒版**：RateLimiter 控制一段时间内允许进入多少请求，Semaphore 控制同时占用多少资源。

**展开**：`acquire` 通过 `reserve` 计算等待时间（`RateLimiter.java:291-317`）；Semaphore 围绕 permit 的借还建立并发上限。RateLimiter 的状态是时间债务，不是执行中任务数。

**加分项**：两者可以组合：先限速，再用信号量隔离慢任务。

**常见错答**：认为拿到 permit 就代表任务执行完毕。

### EventBus 的主要问题是什么？

**30 秒版**：它降低了显式依赖，却提高了运行时隐式依赖、反射配置和调试成本；默认还缺少背压、批处理和可靠失败传播。

**展开**：`EventBus#register` / `post` 位于 `EventBus.java:235`、`:259`，订阅者扫描由 `SubscriberRegistry` 完成，分派由 `Dispatcher` 完成。嵌套发布通过线程本地队列缓解重入。

**加分项**：当前源码注释已经建议新代码考虑依赖注入或响应式流，这是维护者对边界的明确说明。

**常见错答**：把 EventBus 当成跨进程消息队列。

## 高难追问

### 为什么 Guava Cache 的容量是 best effort？

`LocalCache` 按 segment 分配最大权重（`LocalCache.java:279-314`），每段独立加锁和淘汰（`:2649-2669`）。因此全局容量会受 key 分布、并发时序和各段边界影响。精确全局策略需要更复杂的共享队列和同步成本。

### EventBus 如何处理订阅者异常？

订阅者调用异常进入 `SubscriberExceptionHandler`，默认记录日志，不由 `post` 直接抛回。它保护总线继续分派，但不适合需要事务式失败传播的业务。

### SmoothWarmingUp 为什么能预热？

它把 stored permits 映射到随存量变化的等待成本函数；存量越多表示系统越久未使用，取出这些许可时成本越高。核心抽象在 `SmoothRateLimiter.java:245`，共同扣减逻辑在 `:357-367`。

### 不可变集合真的完全线程安全么？

集合结构发布后不可修改，因此读操作可以安全共享；但元素对象仍可能可变，且 `hashCode` / `equals` 变化会破坏 Set/Map 的逻辑约束。线程安全边界是容器结构，不是递归冻结对象图。

## 场景题

### 本地缓存命中率高但延迟抖动，怎么排查？

先区分命中路径和维护路径：检查 loader、刷新、过期清理、removal listener 是否在请求线程执行；再看 segment 锁竞争和单 key 热点。若需要更低读竞争，对照 Caffeine 的 read buffer 与异步加载模型。

### EventBus 线上丢事件怎么办？

确认事件是否在订阅者生命周期切换期间发布、是否被识别为 `DeadEvent`、是否因反射裁剪而未注册。需要可靠投递、重试或背压时，应迁移到显式接口、响应式流或消息系统。

## 反向问面试官

- 缓存是进程内一致性，还是需要跨实例一致性？
- 限流目标是入口速率、并发数，还是全局配额？
- 事件处理是否需要失败重试、顺序和背压？

> **面试锚点**
> - 说清 `RegularImmutable*`、`LocalCache.Segment`、`Dispatcher`、`SmoothRateLimiter` 各自维护的状态。
> - 能解释 Guava Cache 与 Caffeine 的读路径取舍。
> - 能指出 EventBus 和 RateLimiter 不适合解决的问题。

## Related

- [不可变集合](/notes/source/java/base/guava/immutable-collections/)
- [Cache 与 Caffeine 对照](/notes/source/java/base/guava/cache-vs-caffeine/)
- [RateLimiter](/notes/source/java/base/guava/rate-limiter/)
