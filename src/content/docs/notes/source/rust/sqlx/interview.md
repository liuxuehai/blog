---
title: SQLx 面试专题
description: 围绕 SQLx 编译期检查、异步执行、连接池、driver 与类型映射的源码级问答。
category: Backend
tags: [Source Reading, SQLx, Rust, Interview]
order: 76
updatedDate: 2026-08-24
difficulty: advanced
status: stable
lastReviewed: 2026-08-24
draft: false
sidebar:
  order: 76
---

<!-- more -->

## 先给答案：围绕 SQLx 编译期检查、异步执行、连接池、driver 与类型映射的源码级问答

围绕 SQLx 编译期检查、异步执行、连接池、driver 与类型映射的源码级问答。 正文沿“1. SQLx 的 compile-time checked 到底检查什么 -> 2. offline 模式为什么可靠性取决于 CI -> 3. Query、Executor、Connection、Pool 如何分工”展开：先确认入口和状态归属，再跟踪控制流或数据流的推进，最后落到对外可观察的结果。

主要失效边界集中在“SQLx 不需要数据库、query! 防止全部 SQL 注入、Pool size 越大越快”这些场景。它们破坏的是容量、顺序、并发或生命周期前提；排查时应先确认状态是否仍由正确对象持有，再核对推进条件和清理路径。

## 1. SQLx 的 compile-time checked 到底检查什么

query macro 读取 SQL 后通过 driver describe 获得参数类型、列类型和 nullable 信息，再生成 `Encode` / `Decode` / `Type` / `FromRow` 约束。入口在 `sqlx-macros/src/lib.rs:8-9`，主流程在 `sqlx-macros-core/src/query/mod.rs:73`，统一结果是 `Describe<DB>`（`sqlx-core/src/describe.rs:21`）。

## 2. offline 模式为什么可靠性取决于 CI

offline cache 保存 describe 数据而非 SQL 最终 tokens，宏仍按当前代码生成检查。若 schema 变化但 cache 未更新，编译会验证旧事实。因此应把 `cargo sqlx prepare --check` 纳入 CI，并将 cache 与 migration/schema 变更一起评审。

## 3. Query、Executor、Connection、Pool 如何分工

`Query`（`query.rs:18`）保存 SQL/arguments；`Executor`（`executor.rs:53`）描述执行能力；`Connection`（`connection.rs:16`）持有协议状态；`Pool`（`pool/mod.rs:260`）复用连接并限制并发。分离让同一 query 可以在 pool、connection、transaction 上执行。

```text
Query = what
Executor = where/how
Connection = protocol state
Pool = reuse + concurrency boundary
```

## 4. 为什么不用字符串转换

`Type`（`types/mod.rs:211`）保留数据库类型关系，`Encode`（`encode.rs:30`）和 `Decode`（`decode.rs:65`）分别处理两个方向。字符串中间层会损失 NULL、精度、二进制和借用语义。

## 5. Any 的代价是什么

Any 把运行时数据库选择统一到共同接口，但无法表达 driver-specific API，也可能需要在统一 describe 结构上做信息折叠。配置驱动工具适合 Any，业务核心和方言特性适合具体 DB 类型。

## 6. transaction 为什么不是 Pool 的别名

Pool 每次执行可以选择不同连接；transaction 必须绑定同一连接并维护 begin/commit/rollback 状态。`Transaction` 定义在 `transaction.rs:86`，`Pool::begin()` 在 `pool/mod.rs:371`，这两个对象的生命周期和错误语义不同。

## 7. 如何处理动态 SQL

动态 SQL 无法交给 `query!` 做结构检查，应使用 `QueryBuilder` 或运行时 `query()`，但仍绑定参数而不是拼接用户输入。动态 SQL 的风险从“宏编译错误”转为“测试覆盖、白名单和参数化责任”。

## 边界与踩坑

| 误区 | 修正 |
| --- | --- |
| SQLx 不需要数据库 | 运行时仍需数据库；只有 offline 编译 describe 可脱离数据库 |
| query! 防止全部 SQL 注入 | 只保证宏可见 SQL 的参数绑定；动态拼接仍危险 |
| Pool size 越大越快 | 受数据库连接上限、锁竞争和事务时长约束 |
| `Option<T>` 只是 Rust 习惯 | 它表达数据库 NULL 与 Decode 分支 |

> **面试锚点**
> - describe 数据从谁来？
> - offline cache 为什么要做一致性检查？
> - transaction 与 pool 的生命周期差异是什么？
> - 动态 SQL 如何保留参数化安全？

## Related

- [编译期 query 宏](/notes/source/rust/sqlx/query-macro/)
- [Executor、Query 与连接池](/notes/source/rust/sqlx/executor-pool/)
- [Type、Encode、Decode 与 Row 映射](/notes/source/rust/sqlx/type-mapping/)
