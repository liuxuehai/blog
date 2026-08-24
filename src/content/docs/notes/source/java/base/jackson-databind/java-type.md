---
title: JavaType 与泛型
description: Jackson TypeFactory、JavaType 层次和泛型擦除后的运行时类型恢复。
category: Backend
tags: [Source Reading, Jackson, JavaType, Generics]
order: 72
updatedDate: 2026-08-22
difficulty: advanced
status: stable
lastReviewed: 2026-08-22
draft: false
sidebar:
  order: 72
---

Jackson 不把所有目标类型降级成 `Class<?>`，而是用 `JavaType` 保存“这是一个什么结构，以及结构参数是什么”。这是处理泛型集合和多态类型的基础。

<!-- more -->

## 先给答案：JavaType 是把泛型结构从编译期带到运行时的类型计划

`Class<?>` 只能说明“这是一个 List”或“这是一个 Map”，无法说明元素和键值类型。Jackson 通过 `JavaType` 把原始类、类型参数、容器结构和多态信息组合起来，后续缓存才能按完整类型选择 serializer 或 deserializer。

所以反序列化 `List<User>` 失败时，先检查传入的 TypeReference/JavaType 是否保留了 User，而不是先怀疑 JSON。类型计划错了，属性发现和对象构造拿到的就是错误输入；类型计划正确后，才进入字段、构造器和转换规则排查。

## 类型构造

```text
Class / TypeReference / Type
              ↓
        TypeFactory
              ↓
       JavaType graph
```

常见入口包括 `ObjectMapper#constructType`、`TypeFactory#constructCollectionType` 和 `constructMapType`。`TypeReference<List<User>>` 通过匿名子类保存泛型签名，`TypeFactory` 再把它解析成带 content type 的 `CollectionType`。

## 主要类型

| 类型 | 表达内容 |
| --- | --- |
| `SimpleType` | 普通非容器类型 |
| `CollectionType` | 集合及其元素类型 |
| `MapType` | Map 及 key/value 类型 |
| `ArrayType` | 数组及元素类型 |
| `ReferenceType` | `Optional` 等引用包装 |
| `ResolvedRecursiveType` | 自引用类型解析中的占位与回填 |

`JavaType` 同时带有 raw class、超类型、类型参数、静态类型标志和 handler 信息。序列化器和反序列化器据此选择实现，而不是只靠反射猜测。

## 为什么不能只传 Class

```java
List<User> users = mapper.readValue(json, new TypeReference<List<User>>() {});
```

如果只传 `List.class`，运行时只能知道外层是 List，元素会退化为 `Object` 或由默认规则推断。`JavaType` 则明确保存 `CollectionType(List, User)`，让元素 deserializer 能被正确查找。

## 替代方案与代价

**替代方案**：让调用方传字符串类型名，或每个容器 API 自己维护泛型参数。

**为什么没有采用**：字符串缺少编译期约束，且难以表达递归泛型、通配符和自定义 `Type`；把解析逻辑散落在容器实现中又会重复处理 Java 反射类型系统。

## 边界与踩坑

- `TypeReference` 只保存声明时可见的泛型签名，运行时变量本身的实际参数不会自动恢复。
- `Map` key 的反序列化不是普通 value 反序列化，通常走 `KeyDeserializer`。
- 自定义 Module 或 polymorphic type handler 可能附着在 `JavaType` 上，不能随意用 `rawClass` 重建类型。

> **面试锚点**
> - 为什么 `new TypeReference<List<User>>() {}` 需要匿名子类？
> - `JavaType` 如何避免泛型擦除带来的信息损失？
> - `Map<String, List<User>>` 会形成怎样的类型树？

## Related

- [整体架构](/notes/source/java/base/jackson-databind/architecture/)
- [反序列化管线](/notes/source/java/base/jackson-databind/deserialization/)