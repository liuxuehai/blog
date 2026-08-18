---
title: 零成本抽象与边界
description: Serde 的单态化、内联、零拷贝借用、no_std，以及 Content 缓冲和代码体积代价。
category: Backend
tags: [Source Reading, Serde, Performance, Zero Cost]
order: 55
updatedDate: 2026-08-17
difficulty: advanced
status: stable
lastReviewed: 2026-08-17
draft: false
sidebar:
  order: 55
---

Serde 的“零成本”不是所有场景零分配，而是抽象层本身通常可以被单态化和内联，不强制运行时反射、虚调用或统一中间树。具体格式和属性仍可能产生真实成本。

<!-- more -->

## 可被优化掉的层

```text
Derived Serialize impl
  -> generic Serializer calls
  -> concrete serde_json/bincode serializer
  -> monomorphize + inline
  -> format-specific write loop
```

`Serialize::serialize<S>` 使用泛型 Serializer（`serde_core/src/ser/mod.rs:234-252`），`Deserialize::deserialize<D>` 同样泛型化（`de/mod.rs:554-600`）。复合状态通过关联类型而非 trait object 表达（`ser/mod.rs:355-406`），因此编译器知道完整调用图。

## 零拷贝反序列化

`Visitor::visit_borrowed_str` 和 `visit_borrowed_bytes` 接收 `'de` 生命周期（`de/mod.rs:1543`、`:1602`），目标类型可直接借用输入。成立条件包括：

- 输入 buffer 在结果生命周期内保持有效；
- 格式能给出连续未转义 slice；
- Deserializer 实际调用 borrowed 方法；
- 目标字段不是被 `DeserializeOwned` 强制拥有。

JSON 字符串若包含转义，通常需要解码到新 buffer，因此“字段类型是 `&str`”不自动保证零分配。

## `deserialize_in_place`

`Deserialize::deserialize_in_place` 在 `de/mod.rs:585-600` 提供覆盖已有值的机会。derive 可生成 struct/tuple 的 in-place 路径，入口在 `serde_derive/src/de.rs:333-378`，struct 实现在 `de/struct_.rs:421` 之后。它可以复用容器容量，但异常路径和字段部分更新语义更复杂。

## 真正会付费的地方

| 机制 | 成本来源 | 证据 |
| --- | --- | --- |
| untagged enum | 先缓冲 Content，再逐候选尝试 | `de/enum_untagged.rs:46-47` |
| internally tagged enum | tag/content 拆分与中间表示 | `de/enum_internally.rs:56-57` |
| flatten | FlatMapDeserializer 动态分派字段 | `serde/src/private/de.rs:3184` |
| trait 泛型组合 | 编译时间与代码体积 | 每类型×格式单态化 |
| owned output | 分配 String/Vec/Map | 目标所有权要求 |

### 为什么不应把“零成本”理解成“永远最快”

**替代判断**：看到 derive 和泛型就断言与手写代码完全相同。

**为什么不对**：属性选择、格式实现、错误路径、内联阈值和代码体积都会影响结果；复杂 representation 可能主动引入缓冲。

**证据**：Serde 主路径没有强制中间树，但 `ContentVisitor`（`serde/src/private/de.rs:290`）和 `ContentDeserializer`（`:1041`）明确用于需要缓冲的路径。

## no_std 与 feature

`serde_core` 将基础 trait 与标准库能力拆分，支持 core/alloc 场景。不同 feature 会影响 String/Vec、Rc/Arc 等 impl 可用性。嵌入式格式还应关注递归深度、栈和错误字符串体积，而不仅是 no_std 编译通过。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| 大量类型×格式组合 | 二进制膨胀 | 单态化复制代码 | 收敛格式边界、LTO、测量 size |
| 借用字段遇到转义输入 | 反序列化失败或改用 owned | 无法直接切片 | 使用 Cow 或 String |
| in-place 失败后状态半更新 | 业务状态复杂 | 字段逐步覆盖 | 在临时值成功后 swap，或验证错误语义 |
| untagged 热路径慢 | 多次尝试 | 候选回溯 | 显式 tag |

## 可迁移知识

零成本抽象的判据应是“没有被抽象强制支付的成本”。静态分派可消除协议胶水，但业务所需分配、回溯和校验仍必须测量。

> **面试锚点**
> - Serde 零成本具体指什么？
> - `&'de str` 什么时候能真正零拷贝？
> - 哪些 serde 属性会引入 Content 缓冲？

## Related

- [Serializer 协议](/notes/source/rust/serde/serializer/)
- [Deserializer 与 Visitor](/notes/source/rust/serde/deserializer/)
- [Fastjson2 字节码生成](/notes/source/java/base/fastjson2/codegen/)
