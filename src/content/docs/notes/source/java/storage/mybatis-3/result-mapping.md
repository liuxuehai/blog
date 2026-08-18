---
title: 结果集映射
description: DefaultResultSetHandler 的自动映射、构造器注入、嵌套结果对象、集合和延迟加载。
category: Backend
tags: [Source Reading, MyBatis, ResultMap, JDBC]
order: 15
updatedDate: 2026-08-15
difficulty: advanced
status: stable
lastReviewed: 2026-08-15
draft: false
sidebar:
  order: 15
---

结果映射既要把一行列值填进 Java Bean，又要在多行结果中合并同一个父对象、创建子集合，并避免嵌套查询无限递归。

<!-- more -->

## 数据流

```text
ResultSet -> ResultSetWrapper -> DefaultResultSetHandler
                                  |- ResultMap / Discriminator
                                  |- createResultObject
                                  |- applyPropertyMappings
                                  `- nestedResultObjects + CacheKey
```

## 实现拆解

- `DefaultResultSetHandler#handleResultSets` 遍历多个 result set，并按 result maps 处理（`mybatis-3/src/main/java/org/apache/ibatis/executor/resultset/DefaultResultSetHandler.java:211-250`）。
- `handleRowValues` 根据是否有 nested result map 选择简单或复杂路径（`mybatis-3/src/main/java/org/apache/ibatis/executor/resultset/DefaultResultSetHandler.java:329-357`）。
- `getRowValue` 创建结果对象，再处理属性映射和 lazy loader（`mybatis-3/src/main/java/org/apache/ibatis/executor/resultset/DefaultResultSetHandler.java:461-482`）。
- `createResultObject` 根据 constructor mappings、type handler 和默认构造器选择实例化路径（`mybatis-3/src/main/java/org/apache/ibatis/executor/resultset/DefaultResultSetHandler.java:719-820`）。
- `applyPropertyMappings` 先处理显式 `ResultMapping`，再交给自动映射补齐（`mybatis-3/src/main/java/org/apache/ibatis/executor/resultset/DefaultResultSetHandler.java:545-675`）。
- `createAutomaticMappings` 根据列名和前缀推导 property，并缓存自动映射（`mybatis-3/src/main/java/org/apache/ibatis/executor/resultset/DefaultResultSetHandler.java:644-719`）。
- `nestedResultObjects` 按 `CacheKey` 暂存对象，避免一对多 join 每行创建父对象（`mybatis-3/src/main/java/org/apache/ibatis/executor/resultset/DefaultResultSetHandler.java:81-101`）。
- `createRowKey` 将 result map id 与标识列值组合成 row key（`mybatis-3/src/main/java/org/apache/ibatis/executor/resultset/DefaultResultSetHandler.java:1490-1525`）。
- `applyNestedResultMappings` 生成 combined key，复用或创建子对象（`mybatis-3/src/main/java/org/apache/ibatis/executor/resultset/DefaultResultSetHandler.java:1150-1338`）。
- nested select 可创建 `ResultLoader`，在属性访问时再加载（`mybatis-3/src/main/java/org/apache/ibatis/executor/loader/ResultLoader.java:59-91`）。

## 关键取舍

### 为什么嵌套结果需要 `CacheKey`

**替代方案**：按 ResultSet 行直接创建完整对象树。
**为什么不行**：一对多 join 会重复返回父列，直接创建会产生重复父对象和重复子集合。
**证据**：`applyNestedResultMappings` 使用 `combinedKey` 查询 `nestedResultObjects`，并把新对象放回同一 Map（`DefaultResultSetHandler.java:1297-1338`）。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| join 没有稳定 id | 父对象重复 | row key 无法识别同一父对象 | 为 nested result map 配置 `<id>` |
| 下划线与驼峰不一致 | 属性为 null | 自动映射规则未转换 | 开启驼峰或显式 result |
| lazy loading 关闭 | 关联 SQL 立即执行 | nested select 按配置加载 | 统一 lazyLoading/fetchType |
| 一对多结果过大 | 内存和 GC 飙升 | 结果树在内存合并 | 分页、游标或拆分查询 |

## 可迁移知识

“父 key + 子 key + pending object”是把扁平事件流还原为树结构的通用算法，适合 CSV join、消息聚合和批量导入。

> **面试锚点**
> - MyBatis 如何处理一对多 join 的父对象重复？
> - 自动映射和显式 `ResultMap` 的优先级是什么？
> - 嵌套查询为什么可能造成 N+1？

## Related

- [整体架构](/notes/source/java/storage/mybatis-3/architecture/)
- [SqlSession 与 Executor](/notes/source/java/storage/mybatis-3/session-executor/)
- [面试专题](/notes/source/java/storage/mybatis-3/interview/)
