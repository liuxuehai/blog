---
title: 类型元数据与安全边界
description: Fastjson2 Type、泛型、AutoType 与输入信任边界的源码级分析。
category: Backend
tags: [Source Reading, Fastjson2, Type System, Security]
order: 86
updatedDate: 2026-08-16
difficulty: advanced
status: stable
lastReviewed: 2026-08-16
draft: false
sidebar:
  order: 86
---

Fastjson2 的类型处理同时面对 Java 泛型擦除、JSONB 类型信息和多态对象创建。类型元数据越强，反序列化越灵活；输入边界也因此越需要显式收紧。

<!-- more -->

## 类型信息链

```text
Class / Type / TypeReference
              ↓
       TypeUtils / TypeKey
              ↓
      ObjectReaderProvider
              ↓
       concrete ObjectReader
```

普通 `Class` 只能表达 raw type；集合和 Map 的元素参数需要 `Type`、`TypeReference` 或显式 reader。provider 需要使用足够精确的类型 key，否则不同泛型参数可能错误复用同一个对象 reader。

## 多态与 AutoType

多态数据需要知道具体子类型。Fastjson2 通过类型信息、注册映射和相关配置完成子类型选择，但“输入中带类名”不等于“可以实例化任意类”。安全配置应限制允许的类型、来源和基类范围。

生产系统应明确区分可信内部 payload 与外部不可信 JSON/JSONB；不要为了兼容历史数据而无条件打开宽泛的自动类型能力。

## 类型元数据与性能

精确类型可以减少猜测和二次转换，但会增加类型解析、缓存 key 和协议耦合。JSONB 的类型标记也会把 Java 类型语义带入数据格式，跨语言和长期存储场景需要评估兼容性。

## 替代方案与代价

**替代方案**：所有多态对象都由业务字段 `kind` 显式映射到固定类。

**优点**：允许列表清晰，协议更容易跨语言。
**代价**：需要维护映射表，无法自动覆盖任意第三方层次结构。对外部输入，显式映射通常比任意类名解析更容易审计。

## 边界与踩坑

- 反序列化目标类型和 payload 类型信息可能冲突，必须定义优先级和拒绝策略。
- 仅关闭某一个 AutoType 开关不等于完成安全审计，还要检查自定义 reader、Module 和类型过滤器。
- JSONB 适合受控系统内部协议，不应因性能而忽略版本演进和供应链边界。

> **面试锚点**
> - 为什么泛型参数会影响 ObjectReader 缓存 key？
> - AutoType 的风险本质是什么？
> - 外部 JSON 和内部 JSONB 的类型信任边界如何不同？

## Related

- [JSONReader 分派](/notes/source/java/base/fastjson2/json-reader/)
- [ObjectReader 与 ObjectWriter](/notes/source/java/base/fastjson2/object-reader-writer/)