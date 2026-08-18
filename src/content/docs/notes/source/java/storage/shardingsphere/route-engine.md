---
title: 路由引擎
description: SQLRouteEngine 的入口/装饰路由、RouteContext、RouteUnit 与单库退化路径。
category: Backend
tags: [Source Reading, ShardingSphere, Routing, Database]
order: 23
updatedDate: 2026-08-16
difficulty: advanced
status: stable
lastReviewed: 2026-08-16
draft: false
sidebar:
  order: 23
---

路由阶段回答“这条 SQL 要访问哪些真实数据源和表”。它不直接拼 SQL，而是先产出结构化的 `RouteContext`，让后续改写阶段可以根据路由单元决定表名、参数和执行分组。

<!-- more -->

## 数据结构

```text
RouteContext
  |- RouteUnit(data source mapper, table mappers)
  |- RouteUnit(...)
  `- routeStageContexts[rule class]

logic table + condition
  -> entrance router: create initial units
  -> decorate router: add/modify mappings
  -> RouteContext
```

## 实现拆解

- 构造函数通过 `OrderedSPILoader` 发现规则对应的 `SQLRouter`，再按 `DATA_NODE` 与 `DATA_SOURCE` 分类：`infra/route/core/src/main/java/org/apache/shardingsphere/infra/route/engine/SQLRouteEngine.java:63`、`:65`、`:66`。
- `route` 创建 `RouteContext`，先处理数据节点路由，再处理无表路由，最后处理数据源路由：`SQLRouteEngine.java:89`、`:97`、`:98`、`:99`。
- 没有产生路由单元且只有一个存储单元时，路由退化为单库默认路径：`SQLRouteEngine.java:100`、`:102`。
- 第一层 `EntranceSQLRouter` 负责创建上下文，后续 `DecorateSQLRouter` 负责修饰现有上下文：`SQLRouteEngine.java:111`、`:113`、`:114`。
- `RouteContext` 以 `LinkedHashSet` 保存路由单元，既避免重复，又保留稳定遍历顺序：`infra/route/core/src/main/java/org/apache/shardingsphere/infra/route/context/RouteContext.java:40`、`:44`。
- `putRouteUnit` 在同一数据源上合并表映射，必要时替换旧单元：`RouteContext.java:152`、`:162`、`:168`。

## 为什么区分入口路由与装饰路由

**替代方案**：所有规则都实现一个 `route` 方法，各自重建完整 `RouteContext`。
**为什么不行**：多个规则可能叠加，例如分片先决定数据节点，读写分离再决定实际数据源；重建上下文会丢失前一规则的映射。
**证据**：`SQLRouteEngine` 明确只在结果为空时调用 `EntranceSQLRouter#createRouteContext`，已有结果时让 `DecorateSQLRouter#decorateRouteContext` 增量修改：`infra/route/core/src/main/java/org/apache/shardingsphere/infra/route/engine/SQLRouteEngine.java:111`、`:115`。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| 无表 SQL | 不会命中表分片规则 | 需要 `TablelessSQLRouter` | 单独检查广播/单播/随机路由 |
| 路由单元为空 | 后续无法生成 JDBC 执行单元 | 规则没有覆盖或 SQL 不可路由 | 配置默认单库或抛出明确异常 |
| 多规则顺序 | 路由结果依赖装载顺序 | SPI order 影响入口和装饰阶段 | 为扩展实现固定 order 并写测试 |
| 逻辑表未映射 | 改写仍使用逻辑表名 | route mapper 没有实际表 | 检查规则元数据和大小写策略 |

## 可迁移知识

“初始化状态 + 增量装饰”的策略适合权限、请求标签、缓存候选集等多规则系统。入口阶段建立最小可用结构，装饰阶段只添加自己负责的维度，可以减少扩展之间的覆盖冲突。

> **面试锚点**
> - `EntranceSQLRouter` 和 `DecorateSQLRouter` 的调用条件是什么？
> - `RouteUnit` 为什么同时保存数据源映射和表映射？
> - 无表 SQL 为什么要走单独的 Tableless 路由？

## Related

- [SQL 改写引擎](/notes/source/java/storage/shardingsphere/rewrite-engine/)
- [执行引擎](/notes/source/java/storage/shardingsphere/execution-engine/)
- [整体架构](/notes/source/java/storage/shardingsphere/architecture/)