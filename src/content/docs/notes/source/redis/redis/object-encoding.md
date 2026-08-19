---
title: 对象编码与内存布局
description: Redis 对象头如何选择 SDS、listpack、quicklist、dict 与跳表。
category: Database
tags: [Source Reading, Redis, Data Structure]
order: 13
updatedDate: 2026-08-19
difficulty: advanced
status: stable
lastReviewed: 2026-08-19
draft: false
sidebar:
  order: 13
---

Redis 把“逻辑类型”和“物理编码”分开：同一个 hash 或 list 可以因规模、元素长度和操作模式选择不同布局。

<!-- more -->

## 先给答案：对象编码是在内存、操作复杂度和升级成本之间做动态选择

Redis 对外暴露的是 list、set、zset 等逻辑类型，内部却可以根据元素数量、大小和操作模式选择更紧凑或更适合随机访问的编码。编码切换的目的不是让所有操作都最快，而是让常见的小对象少占内存，同时在规模变大后仍能保持可接受的复杂度。

这也意味着“同一个命令”可能在不同数据规模下走完全不同的实现。排查性能问题不能只看命令名，还要看对象当前编码、是否发生升级、升级是否在命令执行路径上同步完成，以及编码是否改变了迭代和删除成本。


## 对象分层

```text
key ─► kvobj/robj
        ├─ type: string/list/hash/set/zset
        └─ encoding ─► SDS / listpack / quicklist / dict / skiplist
```

`createObject` 在 `src/object.c:107` 创建对象头；字符串构造从 `src/object.c:151` 的 `createRawStringObject` 开始；列表、集合、hash 和 zset 的初始对象在 `src/object.c:450-505`。编码压缩入口是 `tryObjectEncodingEx`，位于 `src/object.c:939`，解码入口是 `getDecodedObject`，位于 `src/object.c:1021`。

## 为什么要多种编码

**替代方案**：所有类型都使用通用哈希表或链表。
**为什么不行**：小对象会为指针、桶和分配器元数据付出过高成本；大对象若使用连续紧凑结构，又会让局部修改变成 O(n)。
**证据**：`createListListpackObject` 和 `createQuicklistObject` 并存于 `src/object.c:450-459`，说明 Redis 按规模在紧凑布局和可扩展布局间切换。

字符串会尝试整数编码、共享对象和 SDS；`tryObjectEncodingEx` 还接收 `try_trim`，表明编码不只是类型转换，也可能回收多余容量。复杂类型则通过阈值从 listpack 迁移到 dict/skiplist，命令实现负责触发升级。

## 访问路径

数据库 lookup 位于 `src/db.c:298`，返回 `kvobj` 后由命令按类型校验和访问。对象释放集中在 `src/object.c` 的 free 系列函数，避免命令实现重复理解底层布局。持久化加载也会在 `src/rdb.c:2898` 的 `rdbLoadObject` 中按编码恢复。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| listpack 元素过长 | 更新成本突然升高或触发升级 | 紧凑布局需要移动后续字节 | 设置合理阈值，关注大 field/value |
| 整数编码只读共享对象 | 修改时出现错误 | 共享对象不可变 | 写路径先复制或创建新对象 |
| zset 查询范围很大 | CPU 和内存都升高 | skiplist/dict 组合需要多次定位 | 避免超大单 key，拆分访问范围 |

## 可迁移知识

对象头加可替换编码是一种“逻辑 API 稳定、物理表示自适应”的设计。它适合缓存、列式数据和序列化容器，但必须把升级阈值、转换成本和可变性边界写进实现。

> **面试锚点**
> - Redis 为什么要区分 type 和 encoding？
> - 小 hash 从 listpack 迁移到 dict 的收益和代价是什么？
> - `tryObjectEncodingEx` 为什么不能无条件压缩？

## Related

- [渐进式 rehash](/notes/source/redis/redis/incremental-rehash/)
- [RDB 与 AOF 重写](/notes/source/redis/redis/persistence/)
- [ByteBuf 内存池](/notes/source/java/base/netty/bytebuf-pool/)
