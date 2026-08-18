---
title: Kratos Config 与 Log
description: Kratos 配置加载合并、动态 watch、slog handler 和上下文属性。
category: Backend
tags: [Source Reading, Kratos, Go, Config, Logging]
order: 36
updatedDate: 2026-08-16
difficulty: advanced
status: stable
lastReviewed: 2026-08-16
draft: false
sidebar:
  order: 36
---

Kratos 的 config 和 log 都采用“核心接口 + 可替换适配器”的方式。配置把 source、reader、value 和 observer 分开；日志基于标准库 slog，通过 decorator 注入 context 属性和过滤器。

<!-- more -->

## Config 数据流

```text
Source.Load -> Reader.Merge -> Reader.Resolve -> Value cache
     |                                      |
 Source.Watch -> watcher.Next -> Merge -> Observer(key, value)
```

`config.Config` 接口和内部状态位于 `config/config.go:25-40`。Load 首先加载所有 source，再创建 watcher 并启动后台 watch：`:92-117`。watch 线程合并并 resolve 新值，再比较 cached value，变化后触发 observer：`:58-89`。

文件 source 只负责读取文件或目录：`config/file/file.go:18-79`；fsnotify watcher 负责 rename、重新读取和关闭：`config/file/watcher.go:24-70`。

## Log 组装

`log.NewHandler` 默认 stderr、文本格式、Info 级别和 `AttrsFromContext` extractor：`log/builder.go:79-95`。handler 可以切换 JSON、级别、source、替换属性和 filter：`:47-76`。`ContextWithAttrs` 把 attrs 存入 context，context handler 在 Handle 时追加到 record：`log/context.go:10-26`、`:66-81`。

## 设计取舍

**替代方案**：配置变更时直接替换全局配置对象，日志直接使用全局字段。
**问题**：请求中的旧引用不稳定，测试和动态更新难以控制。
**设计**：Value 提供可观察的缓存单元，slog handler 通过 context 在单次调用范围内传播结构化属性。

## 边界与踩坑

| 场景 | 风险 | 处理 |
| --- | --- | --- |
| watcher 短暂失败 | 配置线程退出 | 非 canceled 错误重试并记录日志 |
| 配置类型变化 | observer 不触发 | 比较类型后再更新 Value |
| 文件 rename | watcher 丢失 | 重新 Add 新路径 |
| handler 不带 context | 请求字段缺失 | 使用 `NewLogger`/`NewHandler` 的 extractor |

## 可迁移知识

动态配置系统必须区分“原始 source 变化”和“解析后的业务值变化”，只有后者才应该通知业务观察者。

> **面试锚点**
> - Kratos 配置 watch 为什么还要经过 Merge 和 Resolve？
> - `Value` cache 与 observer 如何避免每次读取都重新解析？
> - slog context handler 为什么需要 Clone record？

## Related

- [整体架构](/notes/source/go/kratos/architecture/)
- [Spring Boot 配置绑定](/notes/source/java/spring/spring-boot/configuration-binding/)
- [go-zero 缓存一致性](/notes/source/go/go-zero/cache/)
