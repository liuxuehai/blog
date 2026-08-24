---
title: derive 过程宏
description: serde_derive 从 syn AST 到 Container 模型、属性校验、泛型 bound 和 Serialize/Deserialize impl 生成。
category: Backend
tags: [Source Reading, Serde, Proc Macro, Code Generation]
order: 54
updatedDate: 2026-08-24
difficulty: advanced
status: stable
lastReviewed: 2026-08-24
draft: false
sidebar:
  order: 54
---

`#[derive(Serialize, Deserialize)]` 不是运行时反射开关，而是编译期代码生成器。宏读取 Rust AST 和 `#[serde(...)]` 属性，校验组合，再生成普通 trait impl。

<!-- more -->

## 先给答案：[derive(Serialize, Deserialize)] 不是运行时反射开关，而是编译期代码生成器

[derive(Serialize, Deserialize)] 不是运行时反射开关，而是编译期代码生成器。宏读取 Rust AST 和 [serde(...)] 属性，校验组合，再生成普通 trait impl。 正文沿“展开管线 -> 属性解析与校验 -> 泛型 bound 推导”展开：先确认入口和状态归属，再跟踪控制流或数据流的推进，最后落到对外可观察的结果。

主要失效边界集中在“盲目加 bound、rename/alias 演进混乱、flatten + denyunknownfields”这些场景。它们破坏的是容量、顺序、并发或生命周期前提；排查时应先确认状态是否仍由正确对象持有，再核对推进条件和清理路径。

## 展开管线

```text
TokenStream
  -> syn::DeriveInput
  -> internals::ast::Container
  -> parse attributes + validate
  -> infer generic bounds
  -> generate impl fragments
  -> TokenStream
```

Serialize 展开入口是 `serde_derive/src/ser.rs:13-49`，Deserialize 入口是 `serde_derive/src/de.rs:25-77`。两者都先调用 `Container::from_ast`；内部容器模型定义在 `serde_derive/src/internals/ast.rs:10-31`，转换入口位于同文件 `:66` 附近。

## 属性解析与校验

容器属性模型位于 `internals/attr.rs`：`Container` 在 `:155`，enum 标记策略 `TagType` 在 `:178`，`from_ast` 在 `:237`。字段与 variant 也各有属性解析入口（`attr.rs:748`、`:1015`）。

解析后 `internals/check.rs:8-24` 执行语义校验，包括：

- flatten 是否用于允许的结构（`:100`）；
- internal tag 是否与字段冲突（`:300`）；
- adjacent tag/content 是否冲突（`:352`）；
- transparent 是否恰有一个有效字段（`:370`）；
- from/try_from 等属性是否冲突（`:470`）。

## 泛型 bound 推导

`serde_derive/src/bound.rs` 遍历字段类型，按真正参与序列化/反序列化的类型参数添加 `T: Serialize` 或 `T: Deserialize<'de>`。跳过字段、自定义 serialize_with、显式 bound 会改变推导。目标是既不漏约束，也不无脑要求所有泛型参数实现 trait。

## 生成 Serialize

`serialize_body` 位于 `ser.rs:171`，按 struct/enum style 分派；字段最终调用 Serializer 的 struct/tuple/map 状态接口。Deserialize 的 `deserialize_body` 在 `de.rs:306`，会生成 Visitor、字段标识 enum 与 seq/map 两条读取路径。

复杂 enum 分别由 `de/enum_externally.rs`、`enum_internally.rs`、`enum_adjacently.rs`、`enum_untagged.rs` 生成。untagged 路径在 `enum_untagged.rs:46-47` 先读 `Content`，再依次尝试候选。

### 为什么 derive 不生成格式专用代码

**替代方案**：derive 直接生成 JSON/TOML/二进制写法。

**为什么不选**：类型会耦合格式，新增格式需要重新设计宏，N×M 问题回归。

**证据**：生成代码只调用 `_serde::Serialize`、`Serializer`、`Visitor` 与 Access trait，不引用具体格式 crate。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| 盲目加 `bound` | 泛型可用性下降 | 覆盖了自动精确推导 | 仅在自动推导不足时设置 |
| rename/alias 演进混乱 | 新旧数据不兼容 | 写出名与读取别名未设计 | 明确单向兼容策略 |
| flatten + deny_unknown_fields | 行为受限/不兼容 | 字段归属需动态分派 | 避免组合或自定义 impl |
| untagged 变体相似 | 错配到前一候选 | 按声明顺序尝试 | 显式 tag 或先放最具体变体 |

## 可迁移知识

过程宏的工程化不只是 quote 代码：需要稳定中间模型、属性语义校验、精确泛型约束和可测试的多种展开路径。宏应生成对公共协议的普通代码，而非嵌入私有运行时魔法。

> **面试锚点**
> - derive 是运行时反射吗？
> - Serde 如何推导泛型 bound？
> - untagged enum 为什么需要 Content？

## Related

- [Serde 整体架构](/notes/source/rust/serde/architecture/)
- [Serializer 协议](/notes/source/rust/serde/serializer/)
- [Deserializer 与 Visitor](/notes/source/rust/serde/deserializer/)
