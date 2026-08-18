---
title: Serde 数据模型
description: Primitive、option、newtype、sequence、map、struct 与 enum 如何构成格式无关协议。
category: Backend
tags: [Source Reading, Serde, Data Model, Serialization]
order: 51
updatedDate: 2026-08-17
difficulty: advanced
status: stable
lastReviewed: 2026-08-17
draft: false
sidebar:
  order: 51
---

Serde 数据模型是一组语义操作，而不是内存中的统一 Value。它既能表达 JSON 的动态结构，也能表达二进制格式关注的 tuple、newtype 与 enum variant。

<!-- more -->

## 模型分类

```text
scalar
  bool / signed / unsigned / float / char / str / bytes

wrapper
  option / unit / unit_struct / newtype_struct

compound
  seq / tuple / tuple_struct
  map / struct
  enum variants: unit / newtype / tuple / struct
```

Serializer 的标量入口从 `serde_core/src/ser/mod.rs:427` 的 `serialize_bool` 延伸到 `serialize_str`（`:720`）和 `serialize_bytes`（`:755`）。Option 与 unit 位于 `:788-916`；sequence、tuple、map、struct 分别从 `:1006`、`:1062`、`:1188`、`:1220` 开始。

Deserializer 侧对应 typed methods 位于 `serde_core/src/de/mod.rs:959-1188`：`deserialize_bool`、`deserialize_str`、`deserialize_option`、`deserialize_seq`、`deserialize_map`、`deserialize_struct`、`deserialize_enum` 等。

## 为什么区分 tuple、seq、struct、map

表面上它们都可表示为序列或键值对，但区别提供：

- 已知长度和字段名，便于二进制布局；
- 更精确的错误信息；
- enum representation 与 schema 生成；
- 格式可以对 struct 做专门优化。

若把一切压成 list/map，格式会失去静态语义，只能重新猜测。

## 自描述与非自描述格式

自描述格式（如 JSON）可由下一个 token 决定类型，适合 `deserialize_any`（`de/mod.rs:959`）。非自描述二进制格式通常必须由目标类型调用 `deserialize_u32`、`deserialize_tuple` 等方法告诉格式“接下来期待什么”。

### 为什么 `deserialize_any` 不是万能接口

**替代方案**：所有格式只实现一个动态解析入口。

**为什么不行**：无 schema 二进制输入可能只有裸字节，无法知道 `0x01` 是 bool、u8 还是 enum tag。

**证据**：`Deserializer` 明确要求一整组 typed methods（`de/mod.rs:945-1188`），并把 `deserialize_any` 作为格式能力而非唯一协议。

## Enum 的四种表示

Serde derive 支持外部标记、内部标记、相邻标记与无标记。属性模型的 `TagType` 定义在 `serde_derive/src/internals/attr.rs:178-188`。外部标记最流式；内部/相邻/untagged 在部分情况下需要先缓冲 `Content` 再二次反序列化。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| 二进制格式使用 untagged enum | 大量回溯或不支持 | 输入缺少判别信息 | 使用显式 tag |
| bytes 当 seq<u8> | 体积/速度下降 | 格式无法走 bytes 快路径 | 使用 `serialize_bytes`/bytes helper |
| 字段顺序当协议保证 | 跨格式不一致 | map/struct 顺序语义不同 | 明确 schema，不依赖 map 顺序 |
| 新旧版本 enum 变体不兼容 | 反序列化失败 | tag/schema 演进未设计 | unknown variant 策略与版本字段 |

## 可迁移知识

中间协议应保留足够语义，不能为了接口少而把所有结构压平。语义越精确，格式实现越能选择零分配、定长和专用编码路径。

> **面试锚点**
> - Serde 数据模型为什么比 JSON Value 丰富？
> - 自描述格式与非自描述格式有何差别？
> - untagged enum 为什么可能更贵？

## Related

- [Serializer 协议](/notes/source/rust/serde/serializer/)
- [Deserializer 与 Visitor](/notes/source/rust/serde/deserializer/)
- [Fastjson2 JSONReader/Writer](/notes/source/java/base/fastjson2/json-reader/)
