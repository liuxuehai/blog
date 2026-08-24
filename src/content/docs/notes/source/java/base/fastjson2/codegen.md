---
title: 字节码生成与访问路径
description: Fastjson2 ASM、Lambda 和反射回退的对象访问优化。
category: Backend
tags: [Source Reading, Fastjson2, ASM, Performance]
order: 85
updatedDate: 2026-08-22
difficulty: advanced
status: stable
lastReviewed: 2026-08-22
draft: false
sidebar:
  order: 85
---

Fastjson2 的代码生成不是单一的“全部 ASM”。它通常根据类型形状、访问权限、JDK 环境和配置，在 ASM、Lambda/方法句柄与反射之间选择可用路径。

<!-- more -->

## 先给答案：代码生成优化的是稳定类型的热路径，不是所有 JSON 都适合生成代码

框架先根据类型和配置构造对象读写逻辑，满足条件时用 ASM 或 Lambda 生成更直接的字段访问；类型不稳定、结构复杂或生成失败时回退到反射。这个双路径设计把启动成本和运行成本做了交换：首次生成可能变慢，稳态调用减少反射和分派。

评估时必须同时看首次调用、缓存命中、生成失败回退、类加载数量和真实数据分布。为了少一次反射而生成大量短生命周期类，可能反过来增加元空间和启动压力。

## 创建策略

```text
ObjectReaderCreator / ObjectWriterCreator
              ↓
     type + fields + features
              ↓
   ASM  -> Lambda/method handle -> reflection
              ↓
       ObjectReader/ObjectWriter
```

创建阶段分析构造器、字段、getter/setter、注解和类型参数。生成出的访问器被挂到 `FieldReader` / `FieldWriter`，后续读写不再重复做完整的成员发现。

## 为什么需要回退

ASM 适合规则稳定、可直接访问的 Bean，但私有构造器、特殊泛型、模块边界、动态代理和复杂 creator 会增加生成难度。反射回退保留兼容性，避免代码生成失败变成整个类型不可用。

Lambda 和方法句柄则提供另一种访问路径：生成成本和可维护性通常低于手写字节码，但最终性能、访问权限和 JDK 行为需要基准验证，不能只凭理论判断。

## 性能收益来自哪里

- 把反射成员发现、注解合并和字段排序移到创建阶段。
- 将字段访问器固定在对象读写器中，减少每次调用的动态查找。
- 让 UTF-8/JSONB reader/writer 直接执行基础类型读写。
- 对常见类型使用专用 writer/reader，减少通用分派层级。

## 替代方案与代价

**替代方案**：强制所有类型使用 ASM，失败就报错。

**为什么没有采用**：库需要兼容第三方类、不同 JDK 和多种访问权限；全 ASM 会把可用性和模块化边界交给代码生成器承担。分层回退让性能路径和兼容路径共存。

## 边界与踩坑

- 代码生成只解决访问和分派成本，不会自动消除大对象、字符串拷贝或业务转换成本。
- 生成器必须关注类加载器生命周期，长期缓存动态类可能造成类加载器泄漏。
- 任何性能结论都应固定 JDK、输入格式、对象大小和特性位后测量。

> **面试锚点**
> - 为什么 Fastjson2 同时保留 ASM、Lambda 和反射？
> - 生成访问器后，哪些成本仍然存在？
> - 动态字节码缓存为什么可能造成类加载器泄漏？

## Related

- [ObjectReader 与 ObjectWriter](/notes/source/java/base/fastjson2/object-reader-writer/)
- [JSONWriter 分派](/notes/source/java/base/fastjson2/json-writer/)