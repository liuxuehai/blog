---
title: 序列化器缓存
description: SerializerProvider、SerializerCache 与 BeanSerializer 构造和缓存。
category: Backend
tags: [Source Reading, Jackson, Serialization, Cache]
order: 73
updatedDate: 2026-08-24
difficulty: advanced
status: stable
lastReviewed: 2026-08-24
draft: false
sidebar:
  order: 73
---

序列化器的难点不在调用 `serialize`，而在如何根据类型、属性、注解和 Module 构造出正确的 serializer，并让后续调用复用它。

<!-- more -->

## 先给答案：序列化器的难点不在调用 serialize，而在如何根据类型、属性、注解和 Module 构造出正确的 s…

序列化器的难点不在调用 serialize，而在如何根据类型、属性、注解和 Module 构造出正确的 serializer，并让后续调用复用它。 正文沿“查找路径 -> Bean serializer -> 为什么缓存放在 provider/cache 层”展开：先确认入口和状态归属，再跟踪控制流或数据流的推进，最后落到对外可观察的结果。

主要失效边界集中在“serializer 缓存命中不等于输出无状态；自定义 serializer 不应把请求级数据写进长期共享实例。、修改 mapper 的 Module 或配置后，已有缓存可能仍保留旧决策，因此 mapper 应在使用前完成配置。、JsonSerializer 的 null 值路径由 provider 统一处理，不能假设所有业务 serializer 都会收到 null。”这些场景。它们破坏的是容量、顺序、并发或生命周期前提；排查时应先确认状态是否仍由正确对象持有，再核对推进条件和清理路径。

## 查找路径

```text
SerializerProvider#findValueSerializer
  -> _knownSerializers
  -> SerializerCache
  -> _createAndCacheUntypedSerializer
  -> SerializerFactory#createSerializer
```

`SerializerProvider` 先查本地快速缓存，再查共享的 `SerializerCache`；未命中时交给 `SerializerFactory` 创建。新 serializer 可能经过 contextualization，根据属性、格式和注解派生出适用于当前位置的实例。

## Bean serializer

`BeanSerializerFactory` 通过 `BeanDescription` 收集属性，再为每个属性构造 `BeanPropertyWriter`。最终的 `BeanSerializer` 维护属性 writer 列表、过滤器、对象 id 和类型信息处理器。

这使“发现属性”和“写出属性”分离：反射扫描、注解合并和方法访问器构造只需承担一次，热路径主要是遍历 writer 并调用子 serializer。

## 为什么缓存放在 provider/cache 层

| 选择 | 好处 | 风险 |
| --- | --- | --- |
| 按类型缓存 | 命中快，适合常见 POJO | 同一类型在不同属性上下文可能需要 contextual serializer |
| provider 本地缓存 | 读路径短，隔离调用状态 | provider 生命周期必须正确管理 |
| 共享 cache | 避免重复构造 | 配置变化后需避免复用错误实例 |

Jackson 通过“基础 serializer + contextual serializer”的分工平衡复用和上下文差异，而不是把所有配置都编码进全局 key。

## 边界与踩坑

- serializer 缓存命中不等于输出无状态；自定义 serializer 不应把请求级数据写进长期共享实例。
- 修改 mapper 的 Module 或配置后，已有缓存可能仍保留旧决策，因此 mapper 应在使用前完成配置。
- `JsonSerializer` 的 null 值路径由 provider 统一处理，不能假设所有业务 serializer 都会收到 null。

> **面试锚点**
> - `SerializerProvider` 和 `SerializerCache` 分别解决什么问题？
> - 为什么 serializer 还需要 contextualization？
> - Bean serializer 如何把反射成本移出写热路径？

## Related

- [整体架构](/notes/source/java/base/jackson-databind/architecture/)
- [注解与 Module](/notes/source/java/base/jackson-databind/modules/)