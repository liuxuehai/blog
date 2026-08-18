---
title: SQLx 整体架构
description: SQLx facade、core、宏 crate 与数据库驱动之间的职责边界。
category: Backend
tags: [Source Reading, SQLx, Rust, Architecture]
order: 70
updatedDate: 2026-08-18
difficulty: advanced
status: stable
lastReviewed: 2026-08-18
draft: false
sidebar:
  order: 70
---

SQLx 将“编译期知道 SQL 结构”和“运行时执行异步 IO”拆成两条互相衔接的链：宏 crate 负责生成类型约束，`sqlx-core` 负责跨数据库抽象，具体 driver 负责协议事实。

<!-- more -->

## 分层

```text
用户代码
  ├─ query!/query_as!     -> sqlx-macros -> sqlx-macros-core
  └─ Pool/Executor/Type    -> sqlx-core
                                      |
                         postgres / mysql / sqlite driver
```

坐标：workspace 成员和 feature 入口在 `Cargo.toml:1-35`；顶层 `sqlx` 重导出在 `src/lib.rs:19-45`；`sqlx-core` 公共模块在 `sqlx-core/src/lib.rs`；数据库抽象在 `database.rs:72`；宏 proc-macro 入口在 `sqlx-macros/src/lib.rs:8-72`；宏数据库扩展 trait 在 `sqlx-macros-core/src/database/mod.rs:16`；offline 数据模型在 `query/data.rs:20-24`。

## 两条时间线

```text
编译期                                      运行时
SQL literal -> driver describe -> tokens     Query -> Executor -> Connection
             -> parameter/result checks                   -> wire protocol
             -> generated mapping                         -> Row/Decode
```

| 时间 | 主要错误 | 数据来源 |
| --- | --- | --- |
| 编译期 | SQL 语法、参数类型、列类型与 Rust 字段不匹配 | 在线数据库或 `.sqlx` cache |
| 运行时 | 连接失败、超时、约束冲突、服务端错误 | driver response / `DatabaseError` |

## 为什么不是统一动态 Value

**替代方案**：所有数据库都返回 `Value` 树，应用自行转换。

**为什么不行**：编译期 SQL 检查失去意义，类型错误延迟到运行时，借用和零拷贝机会也会丢失。

**证据**：`Type`、`Encode`、`Decode` 和 `Executor` 都以 `DB: Database` 参数化；query 宏直接生成带数据库类型参数的代码。

## feature 组合

默认 feature 在根 `Cargo.toml:39-57`；数据库、runtime、TLS 与 macros 分开组合。这样只启用 SQLite 或只启用某个 runtime 时，不必为未使用 driver 付出编译和依赖成本。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| 宏编译期数据库不可达 | `query!` 编译失败 | 在线 describe 需要连接 | `cargo sqlx prepare` 生成 offline cache |
| feature 漏开 | trait/driver API 不存在 | facade feature 未传递到子 crate | 从根 feature 反查 driver feature |
| 把 core 当完整数据库库 | 缺协议实现 | core 只提供抽象 | 同时启用目标 driver |
| 把编译期检查当迁移 | schema 不会自动变更 | query describe 只读数据库元数据 | 用 `migrate!` 或 CLI 管理 schema |

> **面试锚点**
> - SQLx 为什么要拆 `sqlx-macros-core` 与 `sqlx-core`？
> - 编译期和运行时分别负责什么错误？
> - feature 分层如何控制编译成本？

## Related

- [编译期 query 宏](/notes/source/rust/sqlx/query-macro/)
- [Database 驱动与协议边界](/notes/source/rust/sqlx/database-driver/)
- [Clap 整体架构](/notes/source/rust/clap/architecture/)
