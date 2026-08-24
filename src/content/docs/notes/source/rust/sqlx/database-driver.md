---
title: SQLx Database 驱动与协议边界
description: Database、Connection、driver-specific crate 与 Any 抽象如何协作。
category: Backend
tags: [Source Reading, SQLx, Rust, Database Driver]
order: 73
updatedDate: 2026-08-24
difficulty: advanced
status: stable
lastReviewed: 2026-08-24
draft: false
sidebar:
  order: 73
---

SQLx 的跨数据库能力不是把所有数据库压扁为最低公分母，而是由 `sqlx-core` 定义协议骨架，再由 PostgreSQL、MySQL、SQLite crate 填充连接、语句、参数、行和错误的事实。

<!-- more -->

## 先给答案：SQLx 的跨数据库能力不是把所有数据库压扁为最低公分母，而是由 sqlx-core 定义协议骨架，再由 …

SQLx 的跨数据库能力不是把所有数据库压扁为最低公分母，而是由 sqlx-core 定义协议骨架，再由 PostgreSQL、MySQL、SQLite crate 填充连接、语句、参数、行和错误的事实。 正文沿“Driver 边界 -> Database 关联类型 -> Any 的取舍”展开：先确认入口和状态归属，再跟踪控制流或数据流的推进，最后落到对外可观察的结果。

主要失效边界集中在“`text sqlx-core Database::Connection / Arguments / Row / QueryResult / TypeInfo ^ +-- sqlx-postgres: wire codec + PgConnection + PgRow +-- sqlx-mysql: wire codec + MySqlConnection + MySqlRow +-- sqlx-sqlite: FFI/SQLite protocol + SqliteConnection + SqliteRow `”这些场景。它们破坏的是容量、顺序、并发或生命周期前提；排查时应先确认状态是否仍由正确对象持有，再核对推进条件和清理路径。

## Driver 边界

```text
sqlx-core
  Database::Connection / Arguments / Row / QueryResult / TypeInfo
       ^
       +-- sqlx-postgres: wire codec + PgConnection + PgRow
       +-- sqlx-mysql:    wire codec + MySqlConnection + MySqlRow
       +-- sqlx-sqlite:   FFI/SQLite protocol + SqliteConnection + SqliteRow
```

坐标：`Database` trait 在 `sqlx-core/src/database.rs:72`；`Connection` 在 `connection.rs:16`；driver 的 Any 接口以 `sqlx-postgres/src/any.rs:23`、`sqlx-mysql/src/any.rs:22`、`sqlx-sqlite/src/any.rs:24` 注册；SQLite describe 在 `sqlx-sqlite/src/lib.rs:164-180`；公共 `Describe` 在 `sqlx-core/src/describe.rs:21`。

## `Database` 关联类型

一个 driver 通过关联类型声明：

| 关联类型 | 表示 |
| --- | --- |
| `Connection` | 连接状态与协议读写 |
| `TransactionManager` | begin/commit/rollback/savepoint |
| `Row` / `Column` | 结果集访问 |
| `TypeInfo` | 数据库类型元信息 |
| `Arguments<'q>` / `Statement` | 参数与准备语句 |
| `QueryResult` | affected rows、last insert id 等 |

这样通用 query 代码只依赖 trait，而 driver 可保留数据库独有能力，例如 PostgreSQL 类型、MySQL server flags 或 SQLite explain 路径。

## Any 的取舍

`Any` 用于运行时选择数据库 driver，适合工具、配置驱动应用和迁移场景；但它只能表达各 driver 的共同能力，不能替代 `PgConnection` 等具体类型的专用 API。Any driver 还必须把各自 `Describe` 转成统一形状，转换并非总是无损。

## 为什么不把协议实现放进 core

**替代方案**：所有数据库协议都在 `sqlx-core` 中通过 feature 编译。

**为什么不行**：core 依赖会变重，数据库-specific 类型和条件编译污染公共抽象；driver 版本和协议演进也会耦合所有用户。

**证据**：workspace 将 `sqlx-postgres`、`sqlx-mysql`、`sqlx-sqlite` 分成独立成员，根 feature 只负责选择性启用它们。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| 用 `Any` 调用 driver 特有 SQL | 编译或运行失败 | Any 只承诺共同语义 | 需要特性时使用具体 DB 类型 |
| 只启用 core | 找不到连接实现 | core 不含 wire protocol | 启用目标数据库 feature |
| 混用不同 DB 的 Type | trait bound 不满足 | `Type<DB>` 与 DB 绑定 | 让领域类型为每个 DB 实现映射 |
| 依赖数据库方言却用 query 泛型 | 迁移困难 | SQL 不是完全可移植 | 在架构层明确方言边界 |

> **面试锚点**
> - `Database` 关联类型解决了什么问题？
> - Any 为什么方便但不等价于具体 driver？
> - 为什么协议实现必须留在独立 crate？

## Related

- [SQLx 整体架构](/notes/source/rust/sqlx/architecture/)
- [Type、Encode、Decode 与 Row 映射](/notes/source/rust/sqlx/type-mapping/)
- [Clap Command 与 Arg 模型](/notes/source/rust/clap/command-model/)
