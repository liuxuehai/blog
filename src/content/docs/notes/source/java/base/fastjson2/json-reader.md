---
title: JSONReader 分派
description: Fastjson2 JSONReader 的输入介质、文本与 JSONB 分派和特性位。
category: Backend
tags: [Source Reading, Fastjson2, JSONReader, Parsing]
order: 82
updatedDate: 2026-08-16
difficulty: advanced
status: stable
lastReviewed: 2026-08-16
draft: false
sidebar:
  order: 82
---

`JSONReader` 把“从哪里读”和“读出什么类型”分开：reader 负责 token、编码和基础值，`ObjectReader` 负责目标 Java 类型。

<!-- more -->

## 创建与分派

```text
JSONReader.of(String / byte[] / InputStream)
              ↓
JSONReaderJSON / JSONReaderUTF8 / JSONReaderUTF16
              ↓
readString / readInt32 / startObject / nextIfObjectStart
              ↓
ObjectReader.readObject
```

不同输入介质会选择不同 reader 实现，避免每个字符都经过通用抽象。JSONB 路径则使用二进制类型标记和符号表等优化，读取逻辑与 JSON 文本的字符扫描不同。

## 特性位

解析特性通常以 bit mask 组合，例如字段名智能匹配、未知字段处理、自动类型、时间格式和数组映射。位掩码让一次 reader 调用可以快速判断多个开关，但也让配置来源和优先级更难排查。

应用应区分全局默认特性、reader 局部特性和类型/字段注解，避免在多个层面重复打开高风险行为。

## 对象读取边界

Bean 读取通常先确认 object/array 起始 token，再由 `ObjectReader` 按字段名定位 `FieldReader`。字段值的实际读取会递归回到 provider 查找的子 reader，因此数组、Map、日期和自定义类型可以复用同一格式层。

## 替代方案与代价

**替代方案**：所有类型都先读成 `Map<String,Object>`，再二次转换。

**代价**：会产生中间对象、丢失精确类型信息，并把字段匹配和转换成本支付两次。直接 reader + object reader 组合可以在 token 到字段值之间建立更短路径。

## 边界与踩坑

- 输入介质不同会改变编码、拷贝和分配成本，基准测试必须固定输入形态。
- 宽松字段名匹配、自动类型和未知字段忽略会扩大输入接受面，不能只看解析速度。
- 自定义 reader 必须正确推进 token，否则错误可能在后续字段才暴露。

> **面试锚点**
> - UTF-8 reader 为什么不能简单复用 UTF-16 字符串路径？
> - 特性位解决了什么问题，又带来什么排查成本？
> - reader 如何保证自定义类型读取后游标位置正确？

## Related

- [JSONWriter 分派](/notes/source/java/base/fastjson2/json-writer/)
- [类型元数据与安全边界](/notes/source/java/base/fastjson2/type-and-security/)