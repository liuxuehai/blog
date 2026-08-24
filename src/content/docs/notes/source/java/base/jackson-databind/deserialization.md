---
title: 反序列化管线
description: DeserializationContext、DeserializerCache、BeanDeserializer 与构造流程。
category: Backend
tags: [Source Reading, Jackson, Deserialization]
order: 74
updatedDate: 2026-08-24
difficulty: advanced
status: stable
lastReviewed: 2026-08-24
draft: false
sidebar:
  order: 74
---

反序列化不是“按字段顺序调用 setter”。它必须先确定目标类型，再选择 creator、属性和子 deserializer，并处理 token 顺序、缺失值、未知字段和上下文配置。

<!-- more -->

## 先给答案：反序列化不是“按字段顺序调用 setter”

反序列化不是“按字段顺序调用 setter”。它必须先确定目标类型，再选择 creator、属性和子 deserializer，并处理 token 顺序、缺失值、未知字段和上下文配置。 正文沿“主流程 -> POJO 构造 -> 上下文解析”展开：先确认入口和状态归属，再跟踪控制流或数据流的推进，最后落到对外可观察的结果。

主要失效边界集中在“缺失字段、显式 null 和默认值是三种不同状态。、未知字段处理由配置和 @JsonAnySetter 等机制共同决定，不应在业务层简单吞掉异常。、多态反序列化必须校验类型 id 来源和允许的子类型，不能把客户端输入直接当作任意类名。”这些场景。它们破坏的是容量、顺序、并发或生命周期前提；排查时应先确认状态是否仍由正确对象持有，再核对推进条件和清理路径。

## 主流程

```text
ObjectMapper#readValue
  -> DeserializationContext
  -> DeserializerCache
  -> DeserializerFactory
  -> BeanDeserializer / CollectionDeserializer / MapDeserializer
  -> JsonParser tokens
```

`DeserializerCache` 负责缓存已构造的 deserializer；`DeserializerFactory` 根据 `JavaType` 选择基础类型、容器、枚举、树模型或 POJO 路径。POJO 反序列化器通常由 `BeanDeserializerFactory` 组装。

## POJO 构造

`BeanDeserializer` 持有属性映射、any-setter、忽略字段规则、对象 id 和 creator 信息。遇到字段 token 后，它按名称查找 `SettableBeanProperty`，再调用属性 deserializer；构造器参数则先进入 `PropertyValueBuffer`，creator 完成后再补应用待处理属性。

这解释了为什么 Jackson 可以支持无参 setter、带参构造器、工厂方法和混合模式，而不要求所有 JavaBean 形状一致。

## 上下文解析

容器元素、Bean 属性和根对象都可能影响 deserializer：属性注解、格式配置、视图、类型 id 和 null value provider 都可能在 contextualization 阶段确定。`ContextualDeserializer` 让同一个基础 deserializer 能派生出多个位置相关实例。

## 替代方案与代价

**替代方案**：每个字段都通过反射直接转换成目标类。

**代价**：无法统一处理 creator、泛型嵌套、类型 id、未知字段策略和自定义 Module；每次都反射还会重复支付元数据分析成本。

## 边界与踩坑

- 缺失字段、显式 null 和默认值是三种不同状态。
- 未知字段处理由配置和 `@JsonAnySetter` 等机制共同决定，不应在业务层简单吞掉异常。
- 多态反序列化必须校验类型 id 来源和允许的子类型，不能把客户端输入直接当作任意类名。

> **面试锚点**
> - `BeanDeserializer` 如何支持构造器参数和 setter 混用？
> - 为什么 deserializer 需要 contextualization？
> - 未知字段和缺失字段分别在哪里处理？

## Related

- [JavaType 与泛型](/notes/source/java/base/jackson-databind/java-type/)
- [Bean 属性发现](/notes/source/java/base/jackson-databind/property-discovery/)