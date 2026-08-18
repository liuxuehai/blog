---
title: 整体架构
description: Jackson Databind 从 ObjectMapper 到 JsonParser/JsonGenerator 的读写管线。
category: Backend
tags: [Source Reading, Jackson, Architecture]
order: 71
updatedDate: 2026-08-16
difficulty: advanced
status: stable
lastReviewed: 2026-08-16
draft: false
sidebar:
  order: 71
---

Jackson Databind 不是 JSON parser。它把 streaming API 与 Java 类型模型连接起来，核心职责是选择、构造、缓存并调用 serializer 或 deserializer。

<!-- more -->

## 主链路

```text
ObjectMapper
  ├─ ObjectReader / ObjectWriter
  ├─ DeserializationConfig / SerializationConfig
  ├─ TypeFactory -> JavaType
  ├─ SerializerProvider -> SerializerFactory -> JsonSerializer
  └─ DeserializationContext -> DeserializerFactory -> JsonDeserializer
                         ↓
                 JsonParser / JsonGenerator
```

`ObjectMapper` 持有配置、工厂、类型工厂和缓存入口，但单次读写状态通常由 `DefaultDeserializationContext`、`SerializerProvider` 及 reader/writer 派生对象承载。

## 读路径

`readValue` 创建或复用 parser，再把目标类型交给 `DeserializationContext`。上下文通过 `DeserializerCache` 找到根 deserializer，随后调用 `JsonDeserializer#deserialize` 消费 token。容器和 POJO deserializer 会继续为元素、属性和构造参数查找子 deserializer。

## 写路径

`writeValue` 建立 generator 和序列化上下文，`SerializerProvider` 根据运行时或声明类型寻找 serializer。Bean serializer 通常由 `BeanSerializerFactory` 根据 `BeanDescription` 和属性 writer 组合出来，最后把值写入 generator。

## 为什么拆成这么多层

| 层 | 责任 | 替代方案的代价 |
| --- | --- | --- |
| `ObjectMapper` | 高层入口与共享配置 | 把所有状态塞进 mapper 会放大线程安全和重入风险 |
| `JavaType` | 结构化保存泛型信息 | 只传 `Class` 会丢失 `List<T>`、`Map<K,V>` 的参数 |
| `SerializerProvider` | 查找、缓存、上下文和 null 处理 | 让每个 serializer 自己缓存会造成重复和生命周期混乱 |
| streaming API | 增量 token 读写 | 直接反射对象无法支持流式输入和多格式后端 |

## 边界

- `ObjectMapper` 可共享，但运行中修改全局配置会改变后续调用行为；应用通常应在启动期完成配置。
- serializer 缓存解决的是构造成本，不代表业务对象或输出结果可以跨线程共享。
- 日期、字段名和类型 id 的具体行为还取决于配置和 Module。

> **面试锚点**
> - `ObjectMapper` 为什么不是每次请求都应该 new？
> - `JavaType` 和 `Class<?>` 的职责差异是什么？
> - parser/generator 与 serializer/deserializer 如何分层？

## Related

- [JavaType 与泛型](/notes/source/java/base/jackson-databind/java-type/)
- [序列化器缓存](/notes/source/java/base/jackson-databind/serializer-cache/)