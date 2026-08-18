---
title: Fastjson2
description: Fastjson2 源码解析：JSONReader/JSONWriter 分派、ObjectReader/ObjectWriter、字节码生成与安全边界。
category: Backend
tags: [Source Reading, Fastjson2, Java, JSON]
order: 8
updatedDate: 2026-08-16
difficulty: advanced
status: stable
lastReviewed: 2026-08-16
draft: false
sidebar:
  order: 8
---

Fastjson2 是 Alibaba 维护的 Java JSON 库。它把 JSON token 读取、对象读写器、字段元数据和代码生成组合起来，在保留灵活扩展的同时缩短常见 POJO 的热路径。

<!-- more -->

## 版本范围

本册聚焦 `alibaba/fastjson2` 的 2.x 主线，重点分析 `core` 模块。Fastjson1 的 `JSONSerializer`、`JavaBeanSerializer` 和 AutoType 语义不能直接套用到 Fastjson2。

| 项 | 值 |
| --- | --- |
| 仓库 | `alibaba/fastjson2` |
| 主线 | `2.x` |
| 核心模块 | `fastjson2` |
| 主要入口 | `JSON`、`JSONReader`、`JSONWriter` |
| 对象层 | `ObjectReader`、`ObjectWriter` |
| 加速路径 | ASM / Lambda / 反射回退 |

## 它解决什么问题

- 用 `JSONReader` / `JSONWriter` 把 UTF-8、UTF-16、字节数组和文本输入统一到格式分派层。
- 用 `ObjectReader` / `ObjectWriter` 将类型级逻辑与单次解析状态分离。
- 用 `FieldReader` / `FieldWriter` 固化字段元数据，把反射发现成本移出热路径。
- 对常见 Bean 生成 ASM 或 Lambda 访问代码，并保留反射回退以兼容复杂类型。

## 读码入口

1. `JSON#parseObject` / `toJSONString`：高层 API 到 reader/writer 的入口。
2. `JSONReader.of*` / `JSONWriter.of*`：按输入介质和特性选择实现。
3. `ObjectReaderProvider#getObjectReader`：类型到对象读写器的查找与缓存。
4. `ObjectWriterProvider#getObjectWriter`：序列化器、字段 writer 和特性配置的查找。
5. `ObjectReaderBean` / `ObjectWriterAdapter`：Bean 级读写主循环。
6. `ObjectReaderCreator` / `ObjectWriterCreator`：反射、Lambda、ASM 创建策略。

## 本册目录

- [整体架构](/notes/source/java/base/fastjson2/architecture/)
- [JSONReader 分派](/notes/source/java/base/fastjson2/json-reader/)
- [JSONWriter 分派](/notes/source/java/base/fastjson2/json-writer/)
- [ObjectReader 与 ObjectWriter](/notes/source/java/base/fastjson2/object-reader-writer/)
- [字节码生成与访问路径](/notes/source/java/base/fastjson2/codegen/)
- [类型元数据与安全边界](/notes/source/java/base/fastjson2/type-and-security/)
- [面试专题](/notes/source/java/base/fastjson2/interview/)

## Related

- [Java 基础库索引](/notes/source/java/base/)
- [Jackson Databind](/notes/source/java/base/jackson-databind/)
- [源码解析总览](/notes/source/)