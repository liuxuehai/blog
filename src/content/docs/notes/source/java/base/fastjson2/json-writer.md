---
title: JSONWriter 分派
description: Fastjson2 JSONWriter 的编码后端、格式特性和对象写出路径。
category: Backend
tags: [Source Reading, Fastjson2, JSONWriter, Serialization]
order: 83
updatedDate: 2026-08-16
difficulty: advanced
status: stable
lastReviewed: 2026-08-16
draft: false
sidebar:
  order: 83
---

`JSONWriter` 是输出格式和编码策略的抽象，`ObjectWriter` 才知道 Java 对象如何展开。Fastjson2 通过这两个层次同时支持 JSON、JSONB、UTF-8 和 UTF-16 输出。

<!-- more -->

## 写出路径

```text
JSON.toJSONString(value)
          ↓
JSONWriter.ofUTF8 / ofUTF16 / JSONB
          ↓
ObjectWriterProvider.getObjectWriter(type)
          ↓
ObjectWriter.write
          ↓
FieldWriter.write
          ↓
JSONWriter.writeName / writeString / writeInt
```

`ObjectWriterAdapter` 常见的 Bean 写出路径会遍历字段 writer；字段 writer 负责名称、值提取、格式特性和子 writer 调用。writer 本身只处理输出动作，不应重新分析 Bean 结构。

## 直接写出与通用路径

高频类型通常有专用 writer，基础数字、字符串、集合和时间类型可以跳过 Bean 反射路径。未知类型则通过 provider 创建对象 writer，再按字段元数据写出。

这种分派把“已知类型的低成本路径”和“通用类型的兼容路径”并存，避免为了极少数复杂类型牺牲常见 POJO 的吞吐。

## JSONB 与 JSON

JSONB 可以使用类型标记、长度和符号引用减少文本解析和重复字段名成本，但它不是天然更适合所有场景：跨语言可读性、调试、协议演进和存储兼容性仍需单独评估。

## 边界与踩坑

- 序列化特性可能在 writer、object writer、field writer 和注解多个层级合并。
- 循环引用、过滤器、视图和类型信息会使简单字段遍历退化到更复杂路径。
- 输出 writer 的复用边界取决于实现；不要把带请求状态的自定义 writer 放进全局 provider。

> **面试锚点**
> - `JSONWriter` 和 `ObjectWriter` 分别知道什么？
> - 为什么字段 writer 可以显著减少反射成本？
> - JSONB 的性能收益与协议代价是什么？

## Related

- [JSONReader 分派](/notes/source/java/base/fastjson2/json-reader/)
- [字节码生成与访问路径](/notes/source/java/base/fastjson2/codegen/)