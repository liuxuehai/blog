---
title: StatFilter 统计
description: StatFilter 如何记录 SQL 参数、耗时、慢查询、错误和 ResultSet 行数。
category: Backend
tags: [Source Reading, Druid, Observability]
order: 37
updatedDate: 2026-08-16
difficulty: advanced
status: stable
lastReviewed: 2026-08-16
draft: false
sidebar:
  order: 37
---

StatFilter 把 JDBC 生命周期转换成可聚合的指标：连接建立、SQL 执行、错误、慢查询、结果集遍历和资源关闭都在过滤器事件中完成。

<!-- more -->

```text
before execute
  -> startNano + normalized SQL
  -> raw JDBC execution
  -> elapsed + error classification
  -> SQLStat aggregate
  -> ResultSet rows / close
```

## 关键坐标

- `StatFilter` 类：`filter/stat/StatFilter.java:47`。
- `mergeSql`：`:143-153`，把字面量归一为可聚合 SQL。
- `connection_connect`：`:232`。
- execute 前后统计：`:415-508`。
- 慢 SQL 判断：`:502`。
- execute error：`:538`。
- ResultSet 统计：`:618` 附近。
- `DruidDataSourceStatManager#addDataSource`：`stat/DruidDataSourceStatManager.java:130`。
- `removeDataSource`：`:175`。
- `reset`：`:214`。
- MBean composite data：`:255` 附近。

## 统计对象

归一化 SQL 是聚合 key，执行次数、总耗时、最大耗时、错误次数和并发信息是聚合 value。ResultSet 的 `next` 事件可以补充返回行数，但必须考虑调用者提前关闭和异常退出。

## 为什么先 merge SQL 再聚合

**替代方案**：直接把原始 SQL 字符串作为 Map key。
**为什么不行**：不同参数会产生海量 key，统计失去趋势，且敏感值可能进入监控系统。
**证据**：`StatFilter#mergeSql` 位于 `StatFilter.java:143-153`，执行统计在 `:415-508` 使用归一化结果。

## 慢 SQL 与错误

耗时统计必须以同一个开始时间和结束时间为边界；慢 SQL 判断应在执行返回后完成。异常路径不能跳过计数，否则成功率和平均耗时都会失真。ResultSet 行数则是另一条生命周期，不能用 execute 返回时间替代。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| SQL 爆炸 | 统计内存增长 | merge 规则不足 | 限制 SQL key 数量并脱敏 |
| 慢 SQL 误判 | 阈值统计不准 | 纳秒/毫秒边界混用 | 统一时钟单位 |
| 异常漏计 | 错误率偏低 | 只在成功回调记录 | finally/异常路径都更新 |
| 行数不准 | ResultSet 提前关闭 | 未完整遍历 | 标注遍历状态和关闭原因 |

## 可迁移知识

可观测性组件应把采集点放在生命周期边界，并将原始事件转换为低基数聚合对象。统计系统最重要的不是字段多，而是 key 可控、异常不丢、时间边界一致。

> **面试锚点**
> - 为什么统计前要 merge SQL？
> - 慢 SQL 应在哪个时间点判断？
> - ResultSet 行数为什么不能由 execute 返回值推导？

## Related

- [JDBC 代理与过滤器链](/notes/source/java/storage/druid/filter-chain/)
- [Web 统计与管理](/notes/source/java/storage/druid/web-monitoring/)
- [整体架构](/notes/source/java/storage/druid/architecture/)
