---
title: Serde 整体架构
description: serde_core、serde、serde_derive 的边界，以及数据结构与格式之间的双分派。
category: Backend
tags: [Source Reading, Serde, Rust, Architecture]
order: 50
updatedDate: 2026-08-17
difficulty: advanced
status: stable
lastReviewed: 2026-08-17
draft: false
sidebar:
  order: 50
---

Serde 的关键架构是把 N 种 Rust 类型与 M 种数据格式从 N×M 个直接适配，拆成两组 trait 实现。类型只认识数据模型，格式也只认识数据模型。

<!-- more -->

## 组件地图

```text
serde_core
  Serialize / Serializer
  Deserialize / Deserializer / Visitor / Access
          ^
          |
serde ----+---- private compatibility helpers
  optional re-export of derive macros
          ^
          |
serde_derive
  syn AST -> validated container model -> generated impl
```

`Serialize` 定义在 `serde_core/src/ser/mod.rs:234-252`，`Serializer` 在 `:355-406`；`Deserialize<'de>` 位于 `serde_core/src/de/mod.rs:554-600`，`Deserializer<'de>` 在 `:945-1256`，`Visitor<'de>` 在 `:1317`。derive 入口分别是 `serde_derive/src/ser.rs:13` 与 `serde_derive/src/de.rs:25`。

## 双分派

```text
value.serialize(serializer)
  -> value chooses semantic shape
  -> serializer chooses wire representation

deserializer.deserialize_struct(..., visitor)
  -> type chooses expected semantic shape
  -> format drives visitor with parsed values
```

序列化由数据结构主动遍历自身；反序列化由格式解析输入，再回调目标类型提供的 Visitor。两边方向不同，是因为序列化已有完整值，而反序列化必须边读边构造。

## N + M 而不是 N × M

| 扩展 | 需要实现 |
| --- | --- |
| 新数据结构 | `Serialize` / `Deserialize`，通常 derive |
| 新格式 | `Serializer` / `Deserializer` + Error |
| 新容器适配 | 实现标准 trait 后自动支持所有格式 |

## 核心私有层

复杂 enum tagging、flatten、untagged 尝试等无法总是单遍直达目标。Serde 在 `serde/src/private/de.rs` 提供 `ContentVisitor`（`:290`）、`ContentDeserializer`（`:1041`）和 `FlatMapDeserializer`（`:3184`）供 derive 代码使用。这些是实现细节，不是稳定公共 API。

## 关键取舍

**替代方案**：先把所有值转换成统一动态树（类似 JSON Value），再由每种格式读取或写出。

**为什么不选**：需要分配中间对象、丢失借用机会、二进制格式类型表达受限，并把错误推迟到运行时。

**证据**：`Serialize` 直接调用格式 Serializer，`Deserialize` 直接由 Deserializer 驱动 Visitor；只有 untagged/flatten 等复杂路径才局部使用 `Content`。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| 把 Serde 当 JSON 库 | 找不到 parser/writer | 格式实现属于 serde_json 等 crate | 分清协议层与格式层 |
| 依赖 `serde::__private` | 升级破坏 | 私有 ABI 只服务 derive 同版本 | 只使用公开 trait/API |
| 自定义格式只实现 `deserialize_any` | 非自描述格式失败 | 输入不携带类型标签 | 实现 typed deserialize methods |
| 复杂属性组合 | 额外分配/回溯 | 进入 Content 缓冲路径 | 在热路径选择简单表示 |

## 可迁移知识

当两个开放集合需要互操作时，可定义稳定中间协议，而不是统一中间对象。协议允许双方直接对话，编译器还能内联掉大量适配层。

> **面试锚点**
> - Serde 为什么是 N+M 适配复杂度？
> - 序列化与反序列化的控制方向为何不同？
> - `Content` 为什么只应是局部逃生舱？

## Related

- [Serde 数据模型](/notes/source/rust/serde/data-model/)
- [derive 过程宏](/notes/source/rust/serde/derive/)
- [Jackson JavaType](/notes/source/java/base/jackson-databind/java-type/)
