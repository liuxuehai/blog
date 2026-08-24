---
title: Serde
description: Serde 源码解析总览：数据模型、Serializer/Deserializer、Visitor、derive 宏与零成本抽象。
category: Backend
tags: [Source Reading, Serde, Rust, Serialization]
order: 5
updatedDate: 2026-08-22
difficulty: advanced
status: stable
lastReviewed: 2026-08-22
draft: false
sidebar:
  order: 5
---

Serde 不是一种数据格式，而是 Rust 类型与数据格式之间的双向协议层。数据结构实现 `Serialize` / `Deserialize`，格式实现 `Serializer` / `Deserializer`，derive 宏在编译期生成胶水代码，从而避免运行时反射和统一中间对象。

<!-- more -->

## 本册问题地图

Serde 的主线是“数据模型如何通过 trait 被不同格式复用”：

1. **为什么用 Serializer/Deserializer trait？** 数据结构只描述如何访问自身，JSON、MessagePack 等格式负责具体编码，二者因此可以正交组合。
2. **derive 宏生成了什么？** 它把结构体字段、枚举变体和属性配置展开为 trait 实现，把运行时反射换成编译期代码。
3. **数据模型为何不是 JSON 专属？** 序列化器接收结构化调用，反序列化器提供类型访问接口；格式可以选择是否支持 map、tuple、borrowed data 等能力。
4. **零成本从哪里来？** 泛型和宏让常见路径静态分派，避免统一 Any/反射层；代价是编译时间和生成代码复杂度上升。
5. **错误位置如何传播？** 格式层应把 token 位置和类型期望传回数据模型，调用方才能区分语法错误、字段缺失和类型不匹配。

## 版本快照

| 项 | 值 |
| --- | --- |
| 仓库 | `serde-rs/serde` |
| 本地路径 | `E:\source\rust\serde` |
| 分支 | `master` |
| Commit | `747814f7`（2026-07-25） |
| serde / serde_derive | `1.0.229`，最近 tag `v1.0.229` |
| serde MSRV | `1.56` |
| serde_derive MSRV | `1.71` |

> 本册源码坐标均基于该 commit。核心 trait 位于 `serde_core`，公开 `serde` crate 叠加 derive 重导出与私有兼容实现；过程宏位于 `serde_derive`。

## 双向调用链

```text
serialize:
Rust value -> Serialize::serialize -> Serializer methods -> format bytes/tree

deserialize:
format input -> Deserializer method -> Visitor/Access -> Rust value

derive:
Rust AST -> serde_derive -> generated impl -> same traits
```

## 本册目录

- [整体架构](/notes/source/rust/serde/architecture/)：crate 边界、类型侧与格式侧的双分派
- [Serde 数据模型](/notes/source/rust/serde/data-model/)：primitive、sequence、map、struct 与 enum 的最小公分母
- [Serializer 协议](/notes/source/rust/serde/serializer/)：Serialize、复合容器状态与格式实现
- [Deserializer 与 Visitor](/notes/source/rust/serde/deserializer/)：Visitor、Access、Seed、借用与错误路径
- [derive 过程宏](/notes/source/rust/serde/derive/)：syn AST、属性校验、泛型 bound 与代码生成
- [零成本抽象与边界](/notes/source/rust/serde/zero-cost/)：单态化、零拷贝、Content 缓冲与代码体积
- [面试专题](/notes/source/rust/serde/interview/)：源码级序列化设计与排障题

## Related

- [Rust 源码解析](/notes/source/rust/)
- [Axum Extractor 类型级管线](/notes/source/rust/axum/extractors/)
- [Jackson Databind 整体架构](/notes/source/java/base/jackson-databind/architecture/)
