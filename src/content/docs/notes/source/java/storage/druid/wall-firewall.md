---
title: Wall 防火墙
description: WallFilter 与 WallProvider 如何基于 SQL AST 执行黑白名单、语句类型和危险操作检查。
category: Backend
tags: [Source Reading, Druid, Security]
order: 36
updatedDate: 2026-08-24
difficulty: advanced
status: stable
lastReviewed: 2026-08-24
draft: false
sidebar:
  order: 36
---

Wall 的核心不是简单禁用某个字符串，而是把 SQL 解析成 AST 后，根据配置和 Visitor 结果判断语句是否违反策略。

<!-- more -->

## 先给答案：Wall 的核心不是简单禁用某个字符串，而是把 SQL 解析成 AST 后，根据配置和 Visitor 结…

Wall 的核心不是简单禁用某个字符串，而是把 SQL 解析成 AST 后，根据配置和 Visitor 结果判断语句是否违反策略。 正文沿“调用路径 -> 检查层次 -> 为什么基于 AST 做安全检查”展开：先确认入口和状态归属，再跟踪控制流或数据流的推进，最后落到对外可观察的结果。

主要失效边界集中在“替代方案：维护一组正则表达式，匹配 drop、union、注释等文本”这些场景。它们破坏的是容量、顺序、并发或生命周期前提；排查时应先确认状态是否仍由正确对象持有，再核对推进条件和清理路径。

## 调用路径

- `WallFilter` 类：`wall/WallFilter.java:44`。
- provider 初始化：`:114-224` 附近。
- JDBC 检查入口 `check`：`:866`。
- `checkInternal`：`:871`。
- Statement 检查逻辑：`:309-674` 附近。
- `WallProvider` 类：`wall/WallProvider.java:43`。
- `WallProvider#check`：`:441`。
- `checkInternal`：`:454`。
- Parser、注释、多语句和 Visitor 检查：`:468-572`。
- 白名单/黑名单：`:625` 附近。
- `WallConfig` deny 集合：`wall/WallConfig.java:97-101`。
- 资源加载：`:301-305`。
- deny 判断：`:637-655`。

## 检查层次

| 层次 | 示例 |
| --- | --- |
| 语法 | SQL 是否能被目标方言解析 |
| 结构 | 是否多语句、是否含危险注释 |
| 语义 | 是否访问禁止表、函数、Schema 或操作 |
| 运行时 | 当前 Statement/Connection 是否允许执行 |

## 为什么基于 AST 做安全检查

**替代方案**：维护一组正则表达式，匹配 `drop`、`union`、注释等文本。
**为什么不行**：大小写、注释、嵌套、字符串常量和方言语法会产生大量绕过路径。
**证据**：`WallProvider.java:468-572` 先解析并遍历 AST，`WallConfig.java:637-655` 再应用 deny 集合。

## 失败语义与配置

安全组件需要区分“解析失败”“策略拒绝”和“数据库执行失败”。配置中的 deny set、白名单、黑名单和资源加载共同决定最终判断，不能只看一个布尔开关。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| 误拦截 | 合法 SQL 被拒 | 方言或策略过严 | 按数据库类型配置并保留审计日志 |
| 只检查首条 | 后续语句执行 | 多语句未完整遍历 | 禁止或逐条检查 statement list |
| 黑名单过窄 | 危险函数绕过 | 只匹配文本 | 使用 AST 语义规则 |
| 运行时绕过 | 某些 API 无检查 | 没走 Druid 代理 | 禁止直接暴露 raw JDBC |

## 可迁移知识

安全校验应该尽量在结构化中间表示上完成。策略配置负责“允许什么”，解析和 Visitor 负责“请求表达了什么”，两者分开才便于审计和测试。

> **面试锚点**
> - WallFilter 与 WallProvider 的职责差异是什么？
> - 为什么 SQL 防火墙不能只用正则？
> - 多语句、注释和 deny set 分别防什么？

## Related

- [AST 与 Visitor](/notes/source/java/storage/druid/sql-ast/)
- [JDBC 代理与过滤器链](/notes/source/java/storage/druid/filter-chain/)
- [Web 统计与管理](/notes/source/java/storage/druid/web-monitoring/)
