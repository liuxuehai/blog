---
title: 整体架构
description: Fastjson2 从 JSON 高层 API 到 reader、writer 和对象适配器的整体调用链。
category: Backend
tags: [Source Reading, Fastjson2, Architecture]
order: 81
updatedDate: 2026-08-16
difficulty: advanced
status: stable
lastReviewed: 2026-08-16
draft: false
sidebar:
  order: 81
---

Fastjson2 的核心分层是“格式 reader/writer + 类型级 object reader/writer + 字段访问器”。格式层只负责 token 和基础值，类型层负责把 token 组装成 Java 对象。

<!-- more -->

## 主链路

```text
JSON.parseObject / toJSONString
          ↓
JSONReader / JSONWriter
          ↓
ObjectReaderProvider / ObjectWriterProvider
          ↓
ObjectReaderBean / ObjectWriterAdapter
          ↓
FieldReader / FieldWriter
          ↓
Java object fields
```

`JSONReader` 和 `JSONWriter` 面向输入输出介质；`ObjectReader` 和 `ObjectWriter` 面向 Java 类型。前者可以替换 UTF-8、UTF-16、字节数组或 JSONB 后端，后者可以替换 Bean、集合、Map 和自定义类型实现。

## 读写状态放在哪里

单次解析位置、当前 token、特性位和错误上下文放在 reader/writer 实例中；类型元数据和对象读写器由 provider 管理并复用。这样共享的是“如何处理类型”的知识，不是某次请求的游标状态。

## 为什么不是一个万能 Serializer

| 分层 | 责任 | 如果合并的代价 |
| --- | --- | --- |
| reader/writer | 格式 token、编码和基础值 | 每个类型都重复处理 UTF-8、数字和字符串 |
| object reader/writer | 类型语义、容器和 Bean | 格式实现会被 Java 类型逻辑污染 |
| field reader/writer | 字段名、类型、访问器和特性 | 反射、注解和字段分派无法集中缓存 |
| provider | 类型查找、缓存和创建 | 每次调用重复构造元数据 |

## 边界

- JSON 文本和 JSONB 不是同一套 token 成本模型；不要用文本路径的基准推断 JSONB。
- ASM/Lambda 只是访问路径优化，复杂构造器、私有成员或特殊注解仍可能回退到反射。
- 全局 provider 缓存不应承载请求级状态；自定义 reader/writer 需要明确线程安全边界。

> **面试锚点**
> - `JSONReader` 和 `ObjectReader` 为什么要拆开？
> - Fastjson2 如何把字段反射成本移出热路径？
> - JSONB 是格式替换还是对象层替换？

## Related

- [JSONReader 分派](/notes/source/java/base/fastjson2/json-reader/)
- [ObjectReader 与 ObjectWriter](/notes/source/java/base/fastjson2/object-reader-writer/)