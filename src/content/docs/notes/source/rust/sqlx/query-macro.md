---
title: SQLx 编译期 query 宏
description: query! 如何读取 SQL、describe 数据库并生成参数检查和结果映射代码。
category: Backend
tags: [Source Reading, SQLx, Rust, Proc Macro]
order: 71
updatedDate: 2026-08-22
difficulty: advanced
status: stable
lastReviewed: 2026-08-22
draft: false
sidebar:
  order: 71
---

SQLx 宏的关键不是解析 SQL 后自己实现一个数据库类型系统，而是把 SQL 交给对应 driver 的 describe 能力，再把返回的 `Describe<DB>` 转成 Rust 类型约束和 row 解码代码。

<!-- more -->

## 先给答案：query 宏把数据库 schema 检查前移到编译期，但依赖可复现元数据

宏解析 SQL 后向数据库查询列和参数信息，生成带具体类型的 Rust 代码；离线模式则从缓存文件读取同样的元数据。编译期校验能提前发现列名和类型错误，但 schema 变化、数据库版本差异或过期缓存会让“编译通过”失去代表性。

因此 CI 需要固定数据库版本或可靠的离线数据，并把迁移顺序纳入构建流程。运行时仍可能出现权限、锁等待、网络和业务数据错误，编译期检查不是执行成功保证。

## 宏流水线

```text
query!("SELECT id, name FROM users WHERE id = $1")
  -> QueryMacroInput         读取 literal、参数和调用位置
  -> QueryDriver              确定 DB、runtime、offline 配置
  -> describe(query)         参数类型、列类型、nullable
  -> QueryData<DB>            在线结果或 .sqlx 缓存
  -> quote!                  Query + Encode + Decode + Row mapping
```

坐标：proc macro `expand_query()` 在 `sqlx-macros/src/lib.rs:8-24`；输入模型 `QueryMacroInput` 在 `sqlx-macros-core/src/query/input.rs:10`；`QueryDriver` 在 `query/mod.rs:28`；主入口 `expand_input()` 在 `:73`；分支生成 `expand_with()` 在 `:151`；`QueryData<DB>` 在 `query/data.rs:20`；offline 读取在 `query/data.rs:76-177`。

## 在线与 offline

| 模式 | describe 来源 | 优点 | 风险 |
| --- | --- | --- | --- |
| online | 编译时连接 DB | schema 最新，配置简单 | 编译依赖数据库和网络 |
| offline | `.sqlx` JSON cache | 可复现、CI 不需数据库 | cache 过期会掩盖 schema 变化 |

offline cache 序列化 `Describe`，不是缓存最终 Rust tokens；因此仍由当前版本宏重新生成代码。`QueryData::from_describe()` 在 `query/data.rs:29`，动态 offline 反序列化在 `:122`。

## 参数检查与结果检查

```text
query parameter #1 -> Encode<'q, DB> + Type<DB>
result column #0 -> Decode<'r, DB> + Type<DB> + nullable rule
```

宏把参数表达式放入生成的 `.bind()` 或参数容器，编译器据此检查类型；结果列通过 `FromRow` 或 tuple/primitive mapping 解码。数据库 driver 的 `Describe` 是这两种检查的事实来源。

## 为什么使用真实数据库 describe

**替代方案**：宏 crate 自己实现 PostgreSQL/MySQL/SQLite 的完整 SQL parser 和 schema 推导。

**为什么不行**：重复实现协议语法、版本差异和扩展特性，长期必然落后真实服务端。

**证据**：`DatabaseExt` 把 describe、type checking 与 driver config 接到宏层；具体 driver 提供 `describe_blocking` / `describe` 实现，宏层只消费统一 `Describe`。

## 宏边界

`query!` 适合 SQL 字面量或可被宏读取的文件；动态 SQL 应使用 `query()` / `QueryBuilder`，这时参数值仍可绑定，但 SQL 结构无法在编译期验证。`query_file!` 和 migrate 宏还需要把源文件路径纳入 proc-macro tracked path，相关配置在 `sqlx-macros-core/src/lib.rs:19-23`。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| 动态拼接 SQL 传给 `query!` | 宏无法展开 | 编译期看不到稳定 SQL | 用 `QueryBuilder`，自行覆盖测试 |
| 更新 schema 忘记 prepare | CI 类型检查仍通过旧 cache | offline 数据没有刷新 | 将 `cargo sqlx prepare --check` 放入 CI |
| nullable 列映射到非 Option | 编译失败或需显式 override | describe 认为列可空 | 用 `Option<T>` 或列类型 override |
| 编译时连生产库 | 泄漏凭据/不可复现 | macro build 执行 describe | 使用专用 schema 与 offline cache |

> **面试锚点**
> - SQLx 的编译期检查依赖谁提供事实？
> - offline cache 为什么缓存 describe 而不是最终代码？
> - 动态 SQL 为什么不能享受同等级检查？

## Related

- [Type、Encode、Decode 与 Row 映射](/notes/source/rust/sqlx/type-mapping/)
- [Database 驱动与协议边界](/notes/source/rust/sqlx/database-driver/)
- [Serde derive 过程宏](/notes/source/rust/serde/derive/)
