---
title: 面试专题
description: Druid 连接池、过滤器链、SQL AST、Wall 防火墙和统计监控的源码面试题。
category: Backend
tags: [Source Reading, Druid, Interview]
order: 39
updatedDate: 2026-08-24
difficulty: advanced
status: stable
lastReviewed: 2026-08-24
draft: false
sidebar:
  order: 39
---

这篇把 Druid 的源码阅读压缩成可复述的问题：先说状态和调用链，再说为什么这样设计，最后补边界。

<!-- more -->

## 先给答案：这篇把 Druid 的源码阅读压缩成可复述的问题：先说状态和调用链，再说为什么这样设计，最后补边界

这篇把 Druid 的源码阅读压缩成可复述的问题：先说状态和调用链，再说为什么这样设计，最后补边界。 正文沿“连接池 -> 代理与链 -> Parser 与安全”展开：先确认入口和状态归属，再跟踪控制流或数据流的推进，最后落到对外可观察的结果。

主要失效边界集中在“1. 为什么不用正则解析 SQL”这些场景。它们破坏的是容量、顺序、并发或生命周期前提；排查时应先确认状态是否仍由正确对象持有，再核对推进条件和清理路径。

## 连接池

1. `getConnection` 和 `getConnectionDirect` 的关系是什么？
   - 前者是入口，后者负责实际借出、校验和失败处理：`DruidDataSource.java:1339`、`:1373`。
2. `close()` 为什么能归还连接？
   - `DruidPooledConnection.java:236` 调用 `recycle`，再到 `DruidDataSource.java:1901`。
3. 创建任务为什么独立？
   - `CreateConnectionTask` 在 `DruidDataSource.java:2567`，避免业务线程承担全部建连成本。
4. 缩容看哪里？
   - `shrink` 在 `DruidDataSource.java:3068`。

## 代理与链

1. 为什么要代理 Statement 和 ResultSet？
   - 执行、错误、慢查询和行数都发生在细粒度 JDBC 事件中：`StatementProxyImpl.java:135-231`、`Filter.java:178`。
2. 链如何推进？
   - `FilterChainImpl#nextFilter` 在 `FilterChainImpl.java:469` 通过位置推进，链尾调用 raw JDBC。
3. Filter 顺序为什么重要？
   - Wall 可能拒绝执行，Stat 需要知道是否真正进入数据库；事件方法见 `Filter.java:678-706`。

## Parser 与安全

1. 为什么不用正则解析 SQL？
   - `SQLUtils.java:680-687` 进入方言 Parser 并检查 EOF，AST 能表达嵌套和作用域。
2. AST 如何支持多种功能？
   - `SQLSelectQueryBlock#accept0` 在 `SQLSelectQueryBlock.java:731` 将遍历行为交给 Visitor。
3. Wall 如何拒绝危险 SQL？
   - `WallProvider#check` 在 `WallProvider.java:441`，内部检查在 `:454-572`，配置 deny 集合在 `WallConfig.java:97-101`。

## 统计与运维

1. 为什么 merge SQL？
   - `StatFilter.java:143-153` 降低统计 key 基数，执行聚合在 `:415-508`。
2. 统计如何进入 Web/JMX？
   - 数据源注册、删除和 reset 在 `DruidDataSourceStatManager.java:130-255`，Web 层只负责适配展示。
3. Web 监控的风险是什么？
   - 页面可能暴露 SQL、数据源和管理操作，必须限制网络和权限。

## 综合设计题

### 如果要增加租户 SQL 改写，放在哪里

放在 Filter 链或 AST 改写层，而不是连接池。若要求识别子查询、Union 和别名，应基于 AST 节点；若只做调用耗时和标签，应放在 Filter 的前后置事件。

### 如果要减少生产环境开销

先关闭不需要的 SQL 详细统计和 ResultSet 行数统计，再减少 Wall 规则复杂度，最后评估 Filter 链长度。连接池热路径的改动应通过基准和真实数据库延迟验证。

## 边界与踩坑

| 问题 | 关键判断 |
| --- | --- |
| 连接泄漏 | 看代理是否 close、active 是否下降 |
| 监控失真 | 看异常路径、ResultSet 提前关闭和 SQL merge |
| 安全绕过 | 看是否绕过代理拿 raw JDBC、是否只检查首条语句 |
| 解析错误 | 看 DbType、Parser feature 和 EOF |

## 可迁移知识

Druid 体现了一个通用工程模式：资源池负责状态，代理负责生命周期，链负责横切能力，结构化表示负责语义，统计层负责低基数聚合。回答源码题时沿这五个边界组织，比罗列类名更稳定。

> **面试锚点**
> - Druid 与 HikariCP 的定位差异是什么？
> - Wall、Stat 和连接池分别处在哪一层？
> - 如何设计一个不影响 JDBC 兼容性的自定义 Filter？
> - 如何验证连接池改动没有引入泄漏或创建风暴？

## Related

- [整体架构](/notes/source/java/storage/druid/architecture/)
- [连接池生命周期](/notes/source/java/storage/druid/connection-pool/)
- [Wall 防火墙](/notes/source/java/storage/druid/wall-firewall/)
- [StatFilter 统计](/notes/source/java/storage/druid/stat-filter/)
