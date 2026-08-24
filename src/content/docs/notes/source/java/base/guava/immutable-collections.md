---
title: 不可变集合
description: ImmutableList、ImmutableSet、ImmutableMap 的构造路径、紧凑布局与 hash flooding 回退。
category: Backend
tags: [Source Reading, Guava, Collections, Immutability]
order: 62
updatedDate: 2026-08-24
difficulty: advanced
status: stable
lastReviewed: 2026-08-24
draft: false
sidebar:
  order: 62
---

Guava 的不可变集合不是“加了 final 的 JDK 集合”，而是从构造阶段就切断外部修改，并根据集合类型选择数组、开放寻址表和专用空对象。

<!-- more -->

## 先给答案：Guava 的不可变集合不是“加了 final 的 JDK 集合”，而是从构造阶段就切断外部修改，并根据集…

Guava 的不可变集合不是“加了 final 的 JDK 集合”，而是从构造阶段就切断外部修改，并根据集合类型选择数组、开放寻址表和专用空对象。 正文沿“实现拆解 -> 关键取舍”展开：先确认入口和状态归属，再跟踪控制流或数据流的推进，最后落到对外可观察的结果。

主要失效边界集中在“元素自身可变、ImmutableSet 重复元素、大集合误用 of”这些场景。它们破坏的是容量、顺序、并发或生命周期前提；排查时应先确认状态是否仍由正确对象持有，再核对推进条件和清理路径。

## 实现拆解

`ImmutableCollection` 在 `ImmutableCollection.java:171` 定义共同基类，`toArray` 在 `:195`、`copyIntoArray` 在 `:385`；子类只需提供适合自身布局的复制逻辑。

`ImmutableList#copyOf`（`ImmutableList.java:238`）处理已有不可变集合和普通输入；`RegularImmutableList` 持有对象数组，见 `RegularImmutableList.java:36`、`:41`。Builder 从 `ImmutableList.java:810` 开始，构造结果后不会再暴露可写数组。

`ImmutableMap` 的静态工厂从 `ImmutableMap.java:126` 开始，Builder 在 `:418`，最终进入 `RegularImmutableMap.fromEntryArray`（`:101`）。Regular map 保存 entry 数组和开放寻址表，定义和实例化见 `RegularImmutableMap.java:48`、`:170`。

`ImmutableSet` 的 Builder 在 `ImmutableSet.java:414`，内部实现接口从 `:527` 开始；`RegularSetBuilderImpl`（`:667`）插入开放寻址表，`review`（`:734`）判断是否切换实现。检测到 hash flooding 后创建 `JdkBackedSetBuilderImpl`，见 `:744`、`:886`。

## 关键取舍

### 为什么不直接包一层 `Collections.unmodifiable*`

**替代方案**：先构造可变 JDK 集合，再用只读视图包装。
**为什么不行**：底层集合仍可能被其他引用修改，且包装层保留哈希桶、空槽和扩容冗余；Guava 可以在构造完成后裁剪数组，并让内部结构不再暴露写入口。
**证据**：`ImmutableCollection` 统一拒绝修改，`RegularImmutableList` 直接保存数组；`ImmutableMap` 与 `ImmutableSet` 使用专用内部表。

### 为什么检测 hash flooding 后回退到 JDK 实现

**替代方案**：始终使用 Guava 的开放寻址表。
**为什么不行**：异常 hashCode 可能让探测链过长，`contains` 的最坏情况明显退化。
**证据**：`ImmutableSet.RegularSetBuilderImpl#review` 在 `ImmutableSet.java:734` 调用检测逻辑，随后切换 `JdkBackedSetBuilderImpl`。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| 元素自身可变 | 集合结构不变但 `hashCode` 变化 | 容器不冻结元素对象 | 元素使用值对象或不可变类型 |
| `ImmutableSet` 重复元素 | 结果少于输入数量 | Set 语义会去重 | 需要保留重复次数时使用 `ImmutableList` |
| 大集合误用 `of` | 可读性和构造成本变差 | 可变参数仍需收集输入 | 批量数据使用 `copyOf` 或预估容量 Builder |

## 可迁移知识

不可变对象适合跨线程发布、作为 Map key、作为配置快照。构造器承担昂贵校验，运行期只保留紧凑读结构，是“写时整理，读时无锁”的通用模式。

> **面试锚点**
> - `ImmutableSet` 为什么不是简单数组？
> - Builder 如何避免后续修改污染结果？
> - hash flooding 触发时为什么选择 JDK 回退？

## Related

- [整体架构](/notes/source/java/base/guava/architecture/)
- [Caffeine W-TinyLFU](/notes/source/java/base/caffeine/tiny-lfu/)
