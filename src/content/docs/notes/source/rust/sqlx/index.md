---
title: SQLx
description: SQLx 源码解析总览：编译期 SQL 检查、异步执行器、连接池、数据库驱动、类型映射与迁移。
category: Backend
tags: [Source Reading, SQLx, Rust, Database]
order: 7
updatedDate: 2026-08-18
difficulty: advanced
status: stable
lastReviewed: 2026-08-18
draft: false
sidebar:
  order: 7
---

SQLx 的核心取舍是“不引入数据库 DSL”，而是在编译期把真实 SQL 交给数据库驱动 describe，生成参数和结果类型检查代码；运行时则保留轻量的异步连接、执行器、连接池与类型编码层。

<!-- more -->

## 版本快照

| 项 | 值 |
| --- | --- |
| 仓库 | `launchbadge/sqlx` |
| 本地路径 | `E:\source\rust\sqlx` |
| 分支 | `main` |
| Commit | `1d674f51`（2026-07-03） |
| workspace version | `0.9.0` |
| MSRV | Rust `1.94.0` |

## Workspace 地图

```text
sqlx                    facade / feature 组合 / 重导出
├─ sqlx-core             Database、Connection、Executor、Pool、Query、Type
├─ sqlx-macros            proc_macro 入口
├─ sqlx-macros-core       SQL 解析、describe、代码生成、offline 数据
├─ sqlx-postgres          PostgreSQL 协议、类型与 query describe
├─ sqlx-mysql             MySQL 协议、类型与 query describe
├─ sqlx-sqlite            SQLite 连接、类型与 explain describe
└─ sqlx-cli / sqlx-test    migrate、prepare 与测试支持
```

关键坐标：facade 重导出在 `src/lib.rs:19-45`；`Database` trait 在 `sqlx-core/src/database.rs:72`；`Connection` 在 `connection.rs:16`；`Executor` 在 `executor.rs:53`；`Pool` 在 `pool/mod.rs:260`；query 宏入口在 `sqlx-macros/src/lib.rs:8-9`；宏主流程在 `sqlx-macros-core/src/query/mod.rs:73`。

## 主调用链

```text
query!("SELECT ...")
  -> proc macro 读取 SQL 字面量
  -> DB driver describe / .sqlx offline cache
  -> 生成 Query + Encode/Decode + Row mapping code
  -> runtime Executor::execute/fetch
  -> driver protocol encode/decode
```

## 本册目录

- [整体架构](/notes/source/rust/sqlx/architecture/)
- [编译期 query 宏](/notes/source/rust/sqlx/query-macro/)
- [Executor、Query 与连接池](/notes/source/rust/sqlx/executor-pool/)
- [Database 驱动与协议边界](/notes/source/rust/sqlx/database-driver/)
- [Type、Encode、Decode 与 Row 映射](/notes/source/rust/sqlx/type-mapping/)
- [Transaction 与 Migration](/notes/source/rust/sqlx/transaction-migration/)
- [面试专题](/notes/source/rust/sqlx/interview/)

## Related

- [Rust 源码解析](/notes/source/rust/)
- [Tokio Runtime](/notes/source/rust/tokio/runtime/)
- [Serde 数据模型](/notes/source/rust/serde/data-model/)
