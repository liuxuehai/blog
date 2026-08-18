---
title: Serializer 协议
description: Serialize 主动遍历、Serializer 关联类型、复合容器状态与错误模型。
category: Backend
tags: [Source Reading, Serde, Serializer, Traits]
order: 52
updatedDate: 2026-08-17
difficulty: advanced
status: stable
lastReviewed: 2026-08-17
draft: false
sidebar:
  order: 52
---

序列化时 Rust 值已经存在，因此控制权在 `Serialize` 实现：它按自己的语义结构调用格式提供的 Serializer 方法。

<!-- more -->

## 调用方向

```text
MyStruct::serialize(serializer)
  -> serializer.serialize_struct("MyStruct", 2)
  -> state.serialize_field("id", &self.id)
  -> state.serialize_field("name", &self.name)
  -> state.end()
```

`Serialize` trait 位于 `serde_core/src/ser/mod.rs:234-252`，唯一核心方法接收泛型 `S: Serializer`。`Serializer` 在 `:355-406` 定义 `Ok`、`Error` 和七类复合状态关联类型，然后提供所有数据模型入口。

## 为什么复合类型返回状态对象

`serialize_seq` 返回 `Self::SerializeSeq`（`ser/mod.rs:1006`），map 与 struct 分别返回 `SerializeMap`、`SerializeStruct`。这些 trait 定义于 `:1518`、`:1811`、`:1907`，都以 `end(self)` 收口。

状态对象允许格式：

- 先写长度或开括号；
- 在元素之间写分隔符；
- 维护首元素标记；
- 缓存 map key；
- 结束时写尾部或校验长度。

## 关联类型而非 `dyn SerializeSeq`

每种格式可返回自己的具体状态类型，编译器单态化后能内联 `serialize_element` 和 `end`。不需要虚调用，也不强制堆分配。若某种复合形态不可能出现，可使用 `ser::Impossible`（`serde_core/src/ser/impossible.rs`）作为关联类型。

## Error 协议

序列化错误 trait 由宏生成，入口在 `ser/mod.rs:148` 附近，核心是 `custom(Display)`。格式错误可以保留 IO、语法和数据范围信息；数据结构实现不依赖具体错误类型。

### 为什么 `Serialize` 泛型化 Serializer

**替代方案**：`fn serialize(&self, &mut dyn Serializer)`。

**为什么不选**：Serializer 含关联类型和泛型方法，且动态分派会阻止大量内联；对象安全还会限制协议表达。

**证据**：`Serialize::serialize<S>` 和各复合状态均使用静态泛型（`ser/mod.rs:234-252`、`:1518` 之后），使类型+格式组合在编译期专门化。

## `is_human_readable`

Serializer 可通过 `is_human_readable`（`ser/mod.rs:1459-1462`）提示格式偏文本还是紧凑二进制。类型可据此选择字符串或紧凑表示，但这会让同一类型跨格式的 wire shape 不完全一致，应谨慎用于长期协议。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| 错报 seq 长度 | 格式错误或输出非法 | end 时长度不一致 | 不确定时传 None，或严格计数 |
| `collect_str` 滥用 | 临时格式化分配 | 走 Display 文本路径 | 数字/bytes 用专用方法 |
| human-readable 分支变化 schema | 跨格式不兼容 | 表示随格式能力变化 | 外部协议固定明确表示 |
| 自定义 impl 忽略字段属性语义 | 与 derive 不一致 | 手写逻辑漂移 | 用测试 token 固化形状 |

## 可迁移知识

复合操作返回专用状态对象，是“builder 即协议状态机”的常用模式。关联类型让每个实现拥有零分配的状态布局，同时调用方只依赖统一 trait。

> **面试锚点**
> - Serializer 为什么有这么多关联类型？
> - `SerializeSeq::end` 的作用是什么？
> - 静态泛型如何帮助零成本抽象？

## Related

- [Serde 数据模型](/notes/source/rust/serde/data-model/)
- [derive 过程宏](/notes/source/rust/serde/derive/)
- [零成本抽象与边界](/notes/source/rust/serde/zero-cost/)
