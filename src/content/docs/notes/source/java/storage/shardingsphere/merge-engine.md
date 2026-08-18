---
title: 归并引擎
description: Transparent、Stream、Memory 与 Decorator 结果模型，以及多分片查询如何恢复 JDBC 语义。
category: Backend
tags: [Source Reading, ShardingSphere, Merge, ResultSet]
order: 25
updatedDate: 2026-08-16
difficulty: advanced
status: stable
lastReviewed: 2026-08-16
draft: false
sidebar:
  order: 25
---

物理执行返回的是多个 `QueryResult`，但 JDBC 使用者期待一个 `ResultSet`。归并引擎通过 SPI 选择具体 `ResultMerger`，没有特殊规则时退化为透明结果，并可在最后叠加结果装饰器。

<!-- more -->

## 结果模型

```text
QueryResult[0..n]
      |
      +-- matching ResultMergerEngine -> MergedResult
      |                                  |- StreamMergedResult
      |                                  |- MemoryMergedResult
      |                                  `- DecoratorMergedResult
      `-- no merger -> TransparentMergedResult
                         |
                         v
                 JDBC ResultSet adapter
```

## 实现拆解

- `MergeEngine#merge` 先执行具体归并，找不到实现时使用第一个结果的透明包装：`infra/merge/src/main/java/org/apache/shardingsphere/infra/merge/MergeEngine.java:81`、`:82`。
- `executeMerge` 遍历结果处理引擎，只对 `ResultMergerEngine` 建立 `ResultMerger`：`MergeEngine.java:87`、`:92`。
- 归并实例收到数据库、协议、规则、属性、语句上下文和连接上下文：`MergeEngine.java:93`、`:94`。
- 归并完成后再按顺序应用 `ResultDecorator`：`MergeEngine.java:102`、`:107`。
- `MergedResult` 只暴露 `next`、取值和流读取等稳定操作，隐藏具体归并算法：`infra/merge/src/main/java/org/apache/shardingsphere/infra/merge/result/MergedResult.java:28`、`:31`。
- `StreamMergedResult` 以当前 `QueryResult` 提供流式访问，避免默认复制全部行：`infra/merge/src/main/java/org/apache/shardingsphere/infra/merge/result/impl/stream/StreamMergedResult.java:34`、`:41`、`:46`。

## 为什么要让归并结果实现接口

**替代方案**：把所有分页、排序、聚合、流式读取逻辑硬编码进 JDBC `ResultSet`。
**为什么不行**：JDBC 适配器会同时承担协议兼容、资源关闭和数据库差异，算法难以独立测试；不同 SQL 类型还需要完全不同的消费策略。
**证据**：`MergedResult` 只定义统一结果游标合同，`MergeEngine` 通过 `ResultMergerEngine` 和 `ResultDecorator` SPI 选择实现：`infra/merge/src/main/java/org/apache/shardingsphere/infra/merge/MergeEngine.java:89`、`:102`。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| ORDER BY 跨分片 | 返回顺序不稳定 | 每个物理结果只保证局部顺序 | 使用排序归并并确认比较列 |
| 聚合函数 | count/sum 结果错误 | 不能简单拼接结果集 | 使用对应聚合 ResultMerger |
| 大结果集 | 内存峰值高 | 选择了 Memory 归并 | 优先流式算法，限制分页窗口 |
| 结果为空 | 直接访问当前结果异常 | `QueryResult` 已耗尽或为空 | 正确处理 `next()` 和资源生命周期 |

## 可迁移知识

“稳定最小接口 + 策略实现 + 后置装饰器”适合日志聚合、分页查询、事件流合并和多来源 API 聚合。透明实现作为默认路径，可以降低单源场景的额外成本。

> **面试锚点**
> - `TransparentMergedResult` 什么时候被使用？
> - Stream 与 Memory 归并的内存和延迟取舍是什么？
> - 为什么归并后还要有 `ResultDecorator`？

## Related

- [SQL 改写引擎](/notes/source/java/storage/shardingsphere/rewrite-engine/)
- [执行引擎](/notes/source/java/storage/shardingsphere/execution-engine/)
- [整体架构](/notes/source/java/storage/shardingsphere/architecture/)