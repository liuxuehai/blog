---
title: Web 统计与管理
description: Druid Web 监控、资源服务、请求统计和 JMX 管理对象的边界。
category: Backend
tags: [Source Reading, Druid, Monitoring]
order: 38
updatedDate: 2026-08-24
difficulty: advanced
status: stable
lastReviewed: 2026-08-24
draft: false
sidebar:
  order: 38
---

Druid 的 Web 层是统计对象的展示和管理适配器。它不应重新实现连接池状态，而是读取 StatManager、DataSourceStat 和 WebStatFilter 已经收集的结果。

<!-- more -->

## 先给答案：Druid 的 Web 层是统计对象的展示和管理适配器

Druid 的 Web 层是统计对象的展示和管理适配器。它不应重新实现连接池状态，而是读取 StatManager、DataSourceStat 和 WebStatFilter 已经收集的结果。 正文沿“组件边界 -> 数据流 -> 为什么把 Web 层放在 support 模块”展开：先确认入口和状态归属，再跟踪控制流或数据流的推进，最后落到对外可观察的结果。

主要失效边界集中在“StatViewServlet、ResourceServlet、WebStatFilter”这些场景。它们破坏的是容量、顺序、并发或生命周期前提；排查时应先确认状态是否仍由正确对象持有，再核对推进条件和清理路径。

## 组件边界

- `StatViewServlet`：负责统计页面、查询和管理入口，位于 `core/src/main/java/com/alibaba/druid/support/http/StatViewServlet.java`。
- `ResourceServlet`：负责静态资源读取，位于 `core/src/main/java/com/alibaba/druid/support/http/ResourceServlet.java`。
- `WebStatFilter`：负责 Web 请求与 JDBC 统计关联，位于 `core/src/main/java/com/alibaba/druid/support/http/WebStatFilter.java`。
- Jakarta 版本位于 `support/jakarta/`，用于不同 Servlet API 生态。
- `DruidDataSourceStatManager#addDataSource`：`stat/DruidDataSourceStatManager.java:130`。
- `removeDataSource`：`:175`。
- `reset`：`:214`。
- MBean 数据构造：`:255` 附近。

## 数据流

Servlet 读取全局或数据源级统计；WebStatFilter 记录 URI、请求耗时和 JDBC 关联；JMX 通过 composite data 暴露结构化属性。三者共享统计模型，但不应共享 HTTP 会话状态。

## 为什么把 Web 层放在 support 模块

**替代方案**：把 HTML、Servlet 和管理接口直接写进连接池核心。
**为什么不行**：核心池会被 Servlet API、静态资源和认证逻辑污染，无法在非 Web 环境复用。
**证据**：Web 类集中在 `support/http`，而统计注册与 reset 位于 `DruidDataSourceStatManager.java:130-255`，两者通过统计模型连接。

## 安全边界

监控页面能展示 SQL、数据源和连接状态，属于敏感管理面。部署时应限制网络可达性、配置访问控制，并谨慎开放 reset、kill 或属性修改能力。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| 监控暴露公网 | 数据源和 SQL 泄漏 | Servlet 默认可访问 | 仅内网暴露并接入认证 |
| reset 误用 | 诊断趋势丢失 | reset 是破坏性管理动作 | 做权限区分和审计 |
| Servlet API 冲突 | 部署启动失败 | javax/Jakarta 版本不匹配 | 选择对应 `support` 实现 |
| 统计不一致 | 页面和 JMX 数值不同 | 读取快照时机不同 | 明确采样时间和聚合范围 |

## 可迁移知识

监控 UI、管理 API 和核心状态应通过只读/命令接口分层连接。把展示层隔离出来，可以让同一份指标同时服务 HTTP、JMX 和 Prometheus 适配器。

> **面试锚点**
> - StatViewServlet 为什么不应该直接操作池内队列？
> - javax 与 Jakarta 实现为什么要分开？
> - 监控页面的安全风险有哪些？

## Related

- [StatFilter 统计](/notes/source/java/storage/druid/stat-filter/)
- [整体架构](/notes/source/java/storage/druid/architecture/)
- [Spring Boot 源码解析](/notes/source/java/spring/spring-boot/)
