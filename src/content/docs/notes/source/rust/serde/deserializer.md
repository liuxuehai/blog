---
title: Deserializer 与 Visitor
description: 反序列化控制反转、Visitor、SeqAccess/MapAccess、Seed、生命周期与零拷贝借用。
category: Backend
tags: [Source Reading, Serde, Deserializer, Visitor]
order: 53
updatedDate: 2026-08-17
difficulty: advanced
status: stable
lastReviewed: 2026-08-17
draft: false
sidebar:
  order: 53
---

反序列化不能由目标类型直接读取任意格式字节。目标类型先声明期待的语义形状，格式 Deserializer 解析输入，再通过 Visitor 和 Access 接口逐步交付值。

<!-- more -->

## 控制反转

```text
T::deserialize(deserializer)
  -> deserializer.deserialize_struct(..., Visitor)
  -> format parses map/seq
  -> Visitor::visit_map(MapAccess)
  -> next_key_seed / next_value_seed
  -> construct T
```

`Deserialize<'de>` 定义在 `serde_core/src/de/mod.rs:554-600`，`Deserializer<'de>` 在 `:945-1256`，`Visitor<'de>` 在 `:1317` 之后。序列、映射、枚举访问协议分别是 `SeqAccess`（`:1749`）、`MapAccess`（`:1837`）、`EnumAccess`（`:2035`）与 `VariantAccess`（`:2088`）。

## Visitor 的三种字符串入口

| 方法 | 输入所有权 | 坐标 |
| --- | --- | --- |
| `visit_str` | 临时借用，不能存进结果 | `de/mod.rs:1526` |
| `visit_borrowed_str` | 生命周期为 `'de`，可零拷贝保存 | `de/mod.rs:1543` |
| `visit_string` | 拥有 `String` | `de/mod.rs:1568` |

bytes 也有对应的临时借用、`'de` 借用和 owned 入口（`de/mod.rs:1586-1619`）。是否能零拷贝取决于格式输入是否稳定存在、是否有转义、Deserializer 是否选择 borrowed visitor 方法。

## Seed：带上下文构造

`DeserializeSeed<'de>` 定义在 `de/mod.rs:803-819`，把“如何反序列化”做成带状态对象。`SeqAccess::next_element_seed`（`:1759`）与 `MapAccess::next_key_seed` / `next_value_seed`（`:1847-1867`）因此能支持 arena、已有容器、schema context 和 in-place 更新。

`Deserialize::deserialize_in_place` 位于 `de/mod.rs:585-600`；私有 `InPlaceSeed` 在 `serde_core/src/private/seed.rs:6-18` 把可变位置接进 Seed 协议。

### 为什么需要 Visitor 而不是直接返回动态 Value

**替代方案**：Deserializer 先构造统一树，再由 T 从树转换。

**为什么不选**：增加分配和遍历，无法直接借用输入，也让大序列不能边读边构造。

**证据**：Deserializer 直接驱动 `Visitor`，复合结构通过 Access 懒取下一项；目标值可在单遍解析中形成。

## `DeserializeOwned`

`DeserializeOwned` 是 `for<'de> Deserialize<'de>`（`de/mod.rs:632-634`），表示结果不能借用任何特定输入生命周期。读取临时 buffer、网络 body 或需要返回独立所有权时使用它；希望零拷贝借用时不要过早要求 Owned。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| `&str` 反序列化失败 | 格式只能提供临时/owned 字符串 | 转义或 buffer 生命周期不足 | 用 Cow/String 或支持 borrowed input |
| `deserialize_any` 用于二进制 | 无法判断类型 | 非自描述格式缺少 tag | 调 typed method |
| MapAccess 未消费 value | 后续状态错位 | key/value 协议成对 | 每个 key 必须处理/忽略 value |
| untagged 错误信息模糊 | 多候选回溯 | Content 多次尝试 | 使用显式 tag 或自定义错误上下文 |

## 可迁移知识

Visitor + Access 是流式 parser 与目标构造器之间的控制反转协议。它允许单遍、借用和上下文注入，比“先解析通用 AST”更适合高性能数据通道。

> **面试锚点**
> - Visitor 为什么由格式驱动？
> - `'de` 与 `DeserializeOwned` 有什么区别？
> - DeserializeSeed 解决什么问题？

## Related

- [Serde 数据模型](/notes/source/rust/serde/data-model/)
- [零成本抽象与边界](/notes/source/rust/serde/zero-cost/)
- [Axum Extractor 类型级管线](/notes/source/rust/axum/extractors/)
