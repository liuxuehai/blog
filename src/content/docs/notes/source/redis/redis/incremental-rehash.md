---
title: 渐进式 rehash
description: Redis dict 双表迁移如何把扩容停顿拆成许多小步骤。
category: Database
tags: [Source Reading, Redis, Hash Table]
order: 14
updatedDate: 2026-08-19
difficulty: advanced
status: stable
lastReviewed: 2026-08-19
draft: false
sidebar:
  order: 14
---

Redis 的字典扩容不是一次性复制，而是保留 `ht[0]` 和 `ht[1]`，用 `rehashidx` 表示迁移边界，并让访问路径顺便推进工作。

<!-- more -->

## 先给答案：渐进式 rehash 用“每次多做一点”换掉一次性长停顿

哈希表扩容最直接的办法是一次性分配新表并迁移所有桶，但当 key 很多时，这个操作会阻塞命令执行。Redis 保留旧表和新表，在后续访问或周期维护中逐步搬迁；迁移期间查找通常要同时检查两张表，写入则进入新表。

它解决的是停顿峰值，不是让扩容免费：迁移期间内存会暂时增加，读写路径更复杂，维护预算过低会让 rehash 持续很久。判断 rehash 是否健康，不能只看请求延迟，还要看迁移进度、内存余量和后台维护是否有机会持续运行。


## 数据结构

```text
rehashidx
   │
ht[0] ──已迁移──► | 未迁移 buckets |
                         │
                         ▼
                       ht[1]
```

`dict` 在 `src/dict.h:165` 持有两张表，`rehashidx` 在 `src/dict.h:168` 标记状态。扩容入口在 `src/dict.c:243` 附近分配新表并把索引置零；迁移核心 `dictRehash` 位于 `src/dict.c:406`，单步辅助函数为 `src/dict.c:471` 的 `_dictRehashStep`。

## 查找与写入

rehash 期间写入进入新表，查找需要同时检查两张表；`dictFindLinkInternal` 在 `src/dict.c:766` 处理双表定位，`dictAddRaw` 在 `src/dict.c:531` 处理插入。删除、随机采样和迭代器也必须跳过已搬迁区域，相关逻辑见 `src/dict.c:640`、`src/dict.c:1194` 和 `src/dict.c:1301`。

### 为什么不一次性 rehash

**替代方案**：申请新表，遍历所有 bucket 后一次完成迁移。
**为什么不行**：Redis 的主线程无法在毫秒级延迟服务中承受与 key 数量成正比的停顿；渐进迁移把长任务摊到后续请求和 cron。
**证据**：`dictRehash` 每次只处理有限 bucket，`dictRehashMicroseconds` 在 `src/dict.c:449` 进一步以时间预算推进。

## 维护预算

除了普通访问驱动，`serverCron` 会周期性推进字典维护。当前快照还提供 `dictRehashMicroseconds`，把“搬多少”从固定元素数改成微秒预算，更适合 bucket 链长度不均匀的情况。迁移完成后 `ht[0]` 接管 `ht[1]`，状态在 `src/dict.c:384-397` 收束。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| rehash 期间只查旧表 | 随机读不到 key | key 可能已在新表 | 所有读写封装都走 dict API |
| 扩容时阻塞迭代器 | 迁移迟迟不结束 | 迭代逻辑暂停 rehash | 缩短长迭代，避免全库遍历 |
| 大量空 bucket | 单次步数不等于单次成本 | 跳过空槽后链长度差异大 | 使用时间预算和监控 rehash 状态 |

## 可迁移知识

增量迁移的通用不变量是“旧表未迁移区仍然可读，新表承接所有新增写入”。这可迁移到在线索引重建、路由表切换和分片扩容；关键是双读窗口和明确的完成判定。

> **面试锚点**
> - rehash 期间新写入放哪张表？
> - 为什么查询要同时看两张表？
> - 渐进式 rehash 仍可能造成延迟尖刺吗？

## Related

- [对象编码与内存布局](/notes/source/redis/redis/object-encoding/)
- [ae 事件循环与单线程模型](/notes/source/redis/redis/event-loop/)
- Caffeine 缓存机制（待建册）
