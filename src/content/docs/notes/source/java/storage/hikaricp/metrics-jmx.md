---
title: 指标与 JMX
description: HikariCP 如何记录连接等待、使用、创建、超时和池状态，并通过指标工厂与 MXBean 暴露。
category: Backend
tags: [Source Reading, HikariCP, Observability]
order: 47
updatedDate: 2026-08-24
difficulty: advanced
status: stable
lastReviewed: 2026-08-24
draft: false
sidebar:
  order: 47
---

HikariCP 将指标采集抽象成 `MetricsTracker`，把池内事件转为等待、使用、创建和超时等低基数指标；MXBean 则提供当前池状态与管理操作。

<!-- more -->

## 先给答案：HikariCP 将指标采集抽象成 MetricsTracker，把池内事件转为等待、使用、创建和超时等低…

HikariCP 将指标采集抽象成 MetricsTracker，把池内事件转为等待、使用、创建和超时等低基数指标；MXBean 则提供当前池状态与管理操作。 正文沿“指标挂载点 -> 指标语义 -> 为什么使用 tracker 工厂”展开：先确认入口和状态归属，再跟踪控制流或数据流的推进，最后落到对外可观察的结果。

主要失效边界集中在“MXBean 适合暴露池大小、等待线程、软驱逐和暂停等运维语义，但不应成为业务请求的控制面”这些场景。它们破坏的是容量、顺序、并发或生命周期前提；排查时应先确认状态是否仍由正确对象持有，再核对推进条件和清理路径。

## 指标挂载点

- `HikariPool#setMetricRegistry`：`src/main/java/com/zaxxer/hikari/pool/HikariPool.java:281-300`。
- 借出等待统计：`:171`。
- 连接使用统计：`:436`。
- `PoolBase` tracker 接口：`pool/PoolBase.java:722-733`。
- tracker 实现：`:751-785`。
- `PoolStats`：`metrics/PoolStats.java:28-46`。
- Dropwizard 指标注册：`metrics/dropwizard/Dropwizard5MetricsTracker.java:48-88`。
- `HikariPoolMXBean`：`HikariPoolMXBean.java:72-75`。
- DataSource 暴露 MXBean：`HikariDataSource.java:306`。

## 指标语义

| 指标 | 含义 | 主要来源 |
| --- | --- | --- |
| Wait | 获取连接的等待时间 | `recordBorrowStats` |
| Usage | 连接被业务持有的时间 | `recordConnectionUsage` |
| Connect | 物理连接创建耗时 | `PoolBase` 创建路径 |
| Timeout | 等待连接超时次数 | `HikariPool#getConnection` 异常路径 |
| Active/Idle | 当前租借和空闲数量 | `PoolStats` |

## 为什么使用 tracker 工厂

**替代方案**：在 `HikariPool` 里直接写死 Micrometer、Dropwizard 和 Prometheus API。
**为什么不行**：核心模块会绑定多个可选依赖，用户无法替换观测后端，且热路径被第三方 API 污染。
**证据**：`MetricsTrackerFactory` 和 `MetricsTracker` 位于独立接口，`HikariPool.java:281-300` 只负责选择并安装 tracker。

## JMX 边界

MXBean 适合暴露池大小、等待线程、软驱逐和暂停等运维语义，但不应成为业务请求的控制面。管理操作必须考虑并发和权限，尤其是批量驱逐连接。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| 指标维度爆炸 | 监控系统成本上升 | poolName 或标签不稳定 | 固定池名和低基数标签 |
| 只看 active | 误判池健康 | 等待线程和超时未观察 | 同时看 Wait、Pending、Timeout |
| JMX 暴露公网 | 可远程驱逐连接 | 管理面无隔离 | 限制 JMX 网络与权限 |

## 可迁移知识

可观测性接口应描述事件和状态，而不是绑定某一家指标产品。核心组件只负责产生语义事件，适配器负责转换成具体后端指标。

> **面试锚点**
> - Wait、Usage、Connect 三类指标分别说明什么？
> - 为什么指标通过 tracker 抽象？
> - 只看 active 连接数为什么不足以判断连接池健康？

## Related

- [整体架构](/notes/source/java/storage/hikaricp/architecture/)
- [保活、驱逐与故障检测](/notes/source/java/storage/hikaricp/eviction-keepalive/)
- [StatFilter 统计](/notes/source/java/storage/druid/stat-filter/)
