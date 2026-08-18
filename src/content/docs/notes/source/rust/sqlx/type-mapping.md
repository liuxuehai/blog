---
title: SQLx Type、Encode、Decode 与 Row 映射
description: SQLx 如何通过 Type、Encode、Decode 和 FromRow 连接数据库类型与 Rust 类型。
category: Backend
tags: [Source Reading, SQLx, Rust, Type System]
order: 74
updatedDate: 2026-08-18
difficulty: advanced
status: stable
lastReviewed: 2026-08-18
draft: false
sidebar:
  order: 74
---

SQLx 的类型系统分为“数据库类型信息”和“Rust 值如何编码/解码”两层：`Type<DB>` 说明兼容关系，`Encode` 写入参数，`Decode` 从 row 读取，最终由 `FromRow` 组装业务结构体。

<!-- more -->

## 类型链

```text
Rust T
├─ Type<DB>       声明兼容的 DB type info
├─ Encode<'q, DB> Rust -> wire arguments
└─ Decode<'r, DB> row bytes -> Rust T
                    |
                 FromRow -> struct / tuple / scalar
```

坐标：`Type<DB>` 在 `sqlx-core/src/types/mod.rs:211`；`Encode` 在 `encode.rs:30`；`Decode` 在 `decode.rs:65`；`TypeInfo` 在 `type_info.rs:4`；`Describe<DB>` 在 `describe.rs:21`；`QueryAs` 在 `query_as.rs:20`，构造入口在 `:341`。

## 参数与结果是两条方向

| 方向 | trait | 典型失败 |
| --- | --- | --- |
| Rust -> DB | `Type` + `Encode` | 参数类型与占位符不兼容 |
| DB -> Rust | `Type` + `Decode` | 列类型、nullable 与目标字段不兼容 |
| Row -> struct | `FromRow` | 列名/顺序/字段类型不匹配 |

`Type` 是“可兼容”而不是“一定相同”，例如某些数据库类型可映射到多个 Rust 类型；最终的 query macro 会结合 describe 结果和 nullable 信息生成更具体的 bound。

## 借用与生命周期

`Encode<'q, DB>` 的 `'q` 允许参数借用外部字符串、字节数组，而不必强制 clone；`Decode<'r, DB>` 的 `'r` 表达返回值可能借用 row buffer。把查询结果保存到 row 生命周期之外时，需要选择拥有所有权的 Rust 类型。

## derive 的价值

`#[derive(Type)]` 为自定义 newtype/enum 生成数据库类型映射；`#[derive(FromRow)]` 生成按列读取和转换代码。宏入口在 `sqlx-macros/src/lib.rs:26-64`，derive 实现分别位于 `sqlx-macros-core/src/derives/type.rs:13` 与 `derives/row.rs:13`。

## 为什么不把转换写成 `From<String>`

**替代方案**：所有数据库值先转成字符串，再调用 Rust `FromStr`。

**为什么不行**：二进制、数值精度、时间、数组、JSON、借用和 NULL 语义都会损失；驱动也无法利用协议层的原生表示。

**证据**：`Decode<'r, DB>` 直接接受 driver row 上下文，`TypeInfo` 保留数据库类型信息，NULL 由 `Option<T>` 等类型表达。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| `String` 接 nullable 列 | 类型检查失败 | NULL 不是空字符串 | 使用 `Option<String>` |
| 借用 row 数据到异步任务外 | 生命周期错误 | `Decode` 借用 row buffer | 转成 owned 类型 |
| 自定义 type 只实现 Encode | 能写不能读 | 双向映射未闭合 | 同时实现 Type/Encode/Decode |
| 依赖列顺序却改 SQL | FromRow 运行/编译失败 | tuple 映射按顺序 | 使用显式 struct/列名并测试 |

> **面试锚点**
> - `Type`、`Encode`、`Decode` 的职责区别？
> - 为什么 Decode 需要 row lifetime？
> - NULL 为什么必须进入类型系统？

## Related

- [编译期 query 宏](/notes/source/rust/sqlx/query-macro/)
- [Database 驱动与协议边界](/notes/source/rust/sqlx/database-driver/)
- [Serde Deserializer 与 Visitor](/notes/source/rust/serde/deserializer/)
