---
title: 配置与启动
description: HikariConfig 的参数校验、HikariDataSource 的延迟启动与配置封存。
category: Backend
tags: [Source Reading, HikariCP, Configuration]
order: 42
updatedDate: 2026-08-16
difficulty: advanced
status: stable
lastReviewed: 2026-08-16
draft: false
sidebar:
  order: 42
---

HikariCP 把配置阶段和运行阶段分开：配置对象允许组装，池启动前统一校验，启动后封存关键属性，避免运行时改变池容量语义。

<!-- more -->

```text
properties / setters
       |
       v
HikariConfig
  validate()
       |
       v
HikariDataSource
  seal()
       |
       v
HikariPool
```

## 配置入口

- `HikariConfig`：`src/main/java/com/zaxxer/hikari/HikariConfig.java:45`。
- `setConnectionTimeout`：`:189`。
- `setLeakDetectionThreshold`：`:228`。
- `setMaximumPoolSize`：`:256`。
- `setMinimumIdle`：`:273`。
- `setJdbcUrl`：`:519`。
- `validate`：`:1045`。
- `seal`：`:1010`。
- `HikariDataSource#getConnection`：`HikariDataSource.java:92-127`。

## 关键校验

池大小、超时、JDBC URL、数据源和 keepalive 存在约束关系。源码会在启动前拒绝不合法组合，例如 keepalive 小于 30 秒或不小于 maxLifetime 时禁用：`HikariConfig.java:1108-1117`。

## 延迟启动

`HikariDataSource` 支持构造完成后暂不创建池，第一次 `getConnection` 才建立 `HikariPool`。这样应用可以先完成 Bean 组装和属性覆盖，真正访问数据库时才支付初始化成本。

## 为什么要 seal 配置

**替代方案**：池启动后继续允许修改所有配置字段。
**为什么不行**：已有连接、创建任务和容量上限可能已经基于旧配置运行，动态改变会造成状态不一致。
**证据**：`HikariDataSource.java:76-83` 和 `:108-112` 在启动前调用 `validate` 与 `seal`，将配置边界固定下来。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| connectionTimeout 太小 | 高峰期频繁超时 | 等待时间不足以穿过数据库抖动 | 结合 P99 等待时间设置 |
| minimumIdle 大于 maximumPoolSize | 启动或校验失败 | 容量约束冲突 | 先确定 max，再配置 min |
| keepalive 配置过短 | 参数被自动禁用 | 小于 30 秒不符合约束 | 使用数据库/网络设备允许的周期 |
| 启动后改配置 | 修改不生效或抛异常 | 配置已封存 | 通过重建 DataSource 变更 |

## 可迁移知识

配置类不是普通 JavaBean。复杂基础设施应把参数校验、生命周期封存和运行态对象分开，避免“可修改字段”制造虚假的动态能力。

> **面试锚点**
> - HikariCP 为什么延迟启动？
> - `validate` 和 `seal` 的区别是什么？
> - keepalive 与 maxLifetime 有什么约束？

## Related

- [整体架构](/notes/source/java/storage/hikaricp/architecture/)
- [保活、驱逐与故障检测](/notes/source/java/storage/hikaricp/eviction-keepalive/)
- [指标与 JMX](/notes/source/java/storage/hikaricp/metrics-jmx/)
