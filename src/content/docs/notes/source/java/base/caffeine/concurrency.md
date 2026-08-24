---
title: 并发读写路径
description: ConcurrentHashMap、节点状态、读事件和写后维护如何协同。
category: Backend
tags: [Source Reading, Caffeine, Concurrency, Java]
order: 55
updatedDate: 2026-08-24
difficulty: advanced
status: stable
lastReviewed: 2026-08-24
draft: false
sidebar:
  order: 55
---

Caffeine 让命中读尽量无锁，写入通过原子 map 操作保证唯一性，顺序结构的更新延迟到维护阶段。

<!-- more -->

## 先给答案：Caffeine 让命中读尽量无锁，写入通过原子 map 操作保证唯一性，顺序结构的更新延迟到维护阶段

Caffeine 让命中读尽量无锁，写入通过原子 map 操作保证唯一性，顺序结构的更新延迟到维护阶段。 理解并发读写路径时，要先确认入口与状态归属，再跟踪控制流或数据流的推进顺序，最后落到对外可观察的结果。

主要失效边界集中在“listener 重入 cache、value 可变、开启统计”这些场景。它们破坏的是容量、顺序、并发或生命周期前提；排查时应先确认状态是否仍由正确对象持有，再核对推进条件和清理路径。

主要失效边界集中在“listener 重入 cache、value 可变、开启统计”这些场景。它们破坏的是容量、顺序、并发或生命周期前提；排查时应先确认状态是否仍由正确对象持有，再核对推进条件和清理路径。

```text
key -> ConcurrentHashMap -> Node<K,V> -> access/write time + deque links
                                      -> read/write buffers
```

`BoundedLocalCache` 在 `BoundedLocalCache.java:113`；`get` 在 `2252`，`getIfPresent` 在 `2257`；`drainReadBuffer` 在 `1829`，`drainWriteBuffer` 在 `1903`。

### 为什么不做 volatile LRU

**替代方案**：每次命中 CAS 更新时间并移动链表。
**为什么不行**：热点 key 会形成同一节点写竞争，时间更新也不能解决队列一致性。
**证据**：访问队列由 `drainReadBuffer` 统一修改，命中不直接改链。

## 边界与踩坑

| 场景 | 原因 | 规避 |
| --- | --- | --- |
| listener 重入 cache | 回调在维护链路 | 回调只投递事件 |
| value 可变 | cache 只管理引用 | 使用不可变对象或同步 |
| 开启统计 | 额外计数开销 | 按诊断需求测量 |

## 可迁移知识

把强一致的 key→value 映射和最终整理的访问索引拆开，是高并发索引、对象池和会话管理的常见方案。

> **面试锚点**
> - 读路径是否完全无写？
> - map 和访问队列为什么允许暂时不一致？
> - 如何保证同 key 并发加载不重复？

## Related

- [整体架构](/notes/source/java/base/caffeine/architecture/)
- [异步加载与刷新](/notes/source/java/base/caffeine/async-loading/)
