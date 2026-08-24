---
title: ObjectReader 与 ObjectWriter
description: Fastjson2 对象读写器、字段访问器和类型级缓存的源码职责。
category: Backend
tags: [Source Reading, Fastjson2, ObjectReader, ObjectWriter]
order: 84
updatedDate: 2026-08-24
difficulty: advanced
status: stable
lastReviewed: 2026-08-24
draft: false
sidebar:
  order: 84
---

`ObjectReader` 和 `ObjectWriter` 是 Fastjson2 的类型级策略对象：前者把 token 组装成 Java 值，后者把 Java 值拆成输出字段。它们把格式细节和对象结构分离开。

<!-- more -->

## 先给答案：ObjectReader 和 ObjectWriter 是 Fastjson2 的类型级策略对象：前者把 …

ObjectReader 和 ObjectWriter 是 Fastjson2 的类型级策略对象：前者把 token 组装成 Java 值，后者把 Java 值拆成输出字段。它们把格式细节和对象结构分离开。 正文沿“类型查找 -> Bean 读写 -> 字段访问器的价值”展开：先确认入口和状态归属，再跟踪控制流或数据流的推进，最后落到对外可观察的结果。

主要失效边界集中在“provider 缓存的是类型策略，不是对象实例；请求数据不能写入共享 reader/writer。、字段名冲突、别名、大小写不敏感和扩展字段会改变匹配路径。、自定义 reader/writer 必须明确支持的 Type、特性和 null 行为，不能只覆盖最简单样例。”这些场景。它们破坏的是容量、顺序、并发或生命周期前提；排查时应先确认状态是否仍由正确对象持有，再核对推进条件和清理路径。

## 类型查找

```text
ObjectReaderProvider#getObjectReader
ObjectWriterProvider#getObjectWriter
                  ↓
          Class / Type key
                  ↓
       cached ObjectReader/ObjectWriter
```

provider 以 `Class`、`Type` 或 `TypeKey` 查找对象处理器。常见类型可以直接命中内建实现，Bean 类型则由 creator 根据构造器、字段、注解和访问方式生成。

## Bean 读写

`ObjectReaderBean` 维护字段名到 `FieldReader` 的匹配关系。读对象时，它消费字段名、查找字段 reader、读取字段值并写入目标对象；不可变对象则可能先收集构造参数，再通过 creator 实例化。

`ObjectWriterAdapter` 维护 `FieldWriter` 数组和输出特性。写对象时，它按稳定顺序处理字段名、过滤器、null 策略和子 writer，避免每次输出都重新扫描反射成员。

## 字段访问器的价值

| 组件 | 主要状态 | 热路径动作 |
| --- | --- | --- |
| `FieldReader` | 名称、类型、setter/field、格式特性 | 读一个字段并写入对象 |
| `FieldWriter` | 名称、getter/field、子 writer、过滤配置 | 取一个字段并写入 JSON |
| `ObjectReader` | 类型级构造和字段映射 | 协调对象解析 |
| `ObjectWriter` | 类型级字段顺序和输出策略 | 协调对象序列化 |

## 替代方案与代价

**替代方案**：每次调用都通过 `Introspector` 或反射重新发现 Bean 属性。

**代价**：元数据构造、方法查找和注解解析会重复发生；字段名匹配也难以针对高频类型优化。缓存对象读写器可以把一次性成本摊到多次调用。

## 边界与踩坑

- provider 缓存的是类型策略，不是对象实例；请求数据不能写入共享 reader/writer。
- 字段名冲突、别名、大小写不敏感和扩展字段会改变匹配路径。
- 自定义 reader/writer 必须明确支持的 `Type`、特性和 null 行为，不能只覆盖最简单样例。

> **面试锚点**
> - `FieldReader` 为什么比每次反射 setter 更适合热路径？
> - 不可变 Bean 的 ObjectReader 如何处理构造参数？
> - provider 缓存的 key 为什么不能只看 raw class？

## Related

- [整体架构](/notes/source/java/base/fastjson2/architecture/)
- [字节码生成与访问路径](/notes/source/java/base/fastjson2/codegen/)