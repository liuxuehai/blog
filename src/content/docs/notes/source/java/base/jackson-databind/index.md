---
title: Jackson Databind
description: Jackson Databind 源码解析：ObjectMapper、JavaType、序列化器缓存、反序列化与 Module 扩展。
category: Backend
tags: [Source Reading, Jackson, Java, Serialization]
order: 7
updatedDate: 2026-08-22
difficulty: advanced
status: stable
lastReviewed: 2026-08-22
draft: false
sidebar:
  order: 7
---

Jackson Databind 是建立在 streaming API 之上的对象映射层：把 Java 类型、属性模型和格式解析器连接起来，完成树模型、序列化和反序列化。

<!-- more -->

## 本册问题地图

Jackson Databind 的核心是把“不完整的运行时类型信息”恢复成可执行的对象映射计划：

1. **为什么需要 JavaType？** `Class<?>` 丢失集合元素和泛型参数，`JavaType` 把 `List<User>`、`Map<String, Order>` 等结构保留下来，供序列化器和反序列化器选择。
2. **属性发现和真正读写如何分工？** 先从字段、方法、构造器和注解建立属性模型，再由读写器消费模型；发现阶段的问题会表现为字段缺失，读写阶段的问题则表现为格式或类型错误。
3. **为什么缓存 serializer/deserializer？** 反射、注解解析和类型构造成本高，缓存把它们从每次数据处理移到首次解析；但动态 Module 和配置变化会影响缓存命中边界。
4. **Module 改变了什么？** 它可以注册自定义类型处理器、命名策略或修改器，把全局映射规则注入 `ObjectMapper`；多个 Module 的顺序可能改变最终行为。
5. **反序列化失败如何定位？** 先确认 token 流，再确认 JavaType，再看属性模型、构造器、转换器和未知字段策略，不能只看最后一行异常。

## 版本范围

本册聚焦 Jackson 2.x 的 `com.fasterxml.jackson.databind`。Jackson 3.x 使用 `tools.jackson.databind`，两代 API 和包名不能混读。

| 项 | 值 |
| --- | --- |
| 仓库 | `FasterXML/jackson-databind` |
| 主要分支 | `2.x` |
| 2.x 包名 | `com.fasterxml.jackson.databind` |
| 上游依赖 | `jackson-core`、`jackson-annotations` |
| 核心入口 | `ObjectMapper` |

## 它解决什么问题

- 用 `JavaType` 保留集合、Map、泛型参数等运行时类型信息。
- 通过 `SerializerProvider` 和 `DeserializerCache` 缓存昂贵的类型处理器构造过程。
- 把字段、Getter、Setter、Creator 和注解合并成统一的 `BeanPropertyDefinition`。
- 让 Module 在不修改核心代码的情况下注册序列化器、反序列化器和 Modifier。

## 读码入口

1. `ObjectMapper#readValue` / `writeValue`：用户 API 如何进入读写管线。
2. `TypeFactory#constructType`：`Class`、`TypeReference` 到 `JavaType` 的转换。
3. `SerializerProvider#findValueSerializer`：序列化器查找、缓存和上下文解析。
4. `DeserializerCache#findValueDeserializer`：反序列化器构造和缓存。
5. `POJOPropertiesCollector`：从 Java 成员和注解收集逻辑属性。
6. `SimpleModule#setupModule`：Module 如何向 `SetupContext` 注册扩展。

## 本册目录

- [整体架构](/notes/source/java/base/jackson-databind/architecture/)
- [JavaType 与泛型](/notes/source/java/base/jackson-databind/java-type/)
- [序列化器缓存](/notes/source/java/base/jackson-databind/serializer-cache/)
- [反序列化管线](/notes/source/java/base/jackson-databind/deserialization/)
- [Bean 属性发现](/notes/source/java/base/jackson-databind/property-discovery/)
- [注解与 Module](/notes/source/java/base/jackson-databind/modules/)
- [面试专题](/notes/source/java/base/jackson-databind/interview/)

## Related

- [Java 基础库索引](/notes/source/java/base/)
- [源码解析总览](/notes/source/)