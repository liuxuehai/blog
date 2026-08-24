---
title: 注解与 Module
description: Jackson 注解解析、SimpleModule 和 SetupContext 扩展机制。
category: Backend
tags: [Source Reading, Jackson, Annotations, Module]
order: 76
updatedDate: 2026-08-24
difficulty: advanced
status: stable
lastReviewed: 2026-08-24
draft: false
sidebar:
  order: 76
---

Jackson 把扩展点分成两类：注解描述单个类型或属性的局部意图，Module 描述可复用的全局注册和处理规则。

<!-- more -->

## 先给答案：Jackson 把扩展点分成两类：注解描述单个类型或属性的局部意图，Module 描述可复用的全局注册和处…

Jackson 把扩展点分成两类：注解描述单个类型或属性的局部意图，Module 描述可复用的全局注册和处理规则。 正文沿“Module 注册链 -> 注解和 Module 的边界 -> 为什么不是全靠注解”展开：先确认入口和状态归属，再跟踪控制流或数据流的推进，最后落到对外可观察的结果。

主要失效边界集中在“单个字段改名、忽略、格式、某个类型的统一读写规则、批量修改 Bean 属性 writer”这些场景。它们破坏的是容量、顺序、并发或生命周期前提；排查时应先确认状态是否仍由正确对象持有，再核对推进条件和清理路径。

## Module 注册链

```text
ObjectMapper#registerModule
  -> Module#setupModule
  -> SetupContext
       ├─ addSerializer / addDeserializer
       ├─ addKeySerializer / addKeyDeserializer
       ├─ addBeanSerializerModifier
       ├─ addBeanDeserializerModifier
       └─ insertAnnotationIntrospector
```

`SimpleModule` 是常用实现，负责保存注册表，真正接入 mapper 时通过 `SetupContext` 把内容交给 serializer/deserializer factory、factory config 或 annotation introspector 链。

## 注解和 Module 的边界

| 需求 | 更合适的机制 |
| --- | --- |
| 单个字段改名、忽略、格式 | `@JsonProperty`、`@JsonIgnore`、`@JsonFormat` |
| 某个类型的统一读写规则 | Module 注册 serializer/deserializer |
| 批量修改 Bean 属性 writer | `BeanSerializerModifier` |
| 扩展注解语义 | `AnnotationIntrospector` |
| 多态类型规则 | `TypeResolverBuilder`、类型注解或安全的 validator |

## 为什么不是全靠注解

注解会把格式协议渗透到领域类，且无法覆盖第三方类。Module 可以集中管理时间、金额、数据库类型和外部 SDK 类型的规则，并按应用边界装配。

反过来，Module 也不是无条件优先：多个 Module 可能注册同一类型，顺序会影响 modifier/introspector 链和最终选择，因此注册顺序必须作为配置的一部分测试。

## 安全边界

多态类型是最需要审查的扩展点。允许列表、类型 validator 和输入边界应明确配置；不要把不受信任的类型名直接交给任意类加载路径。

> **面试锚点**
> - `SimpleModule#setupModule` 如何把注册表接到 mapper？
> - 注解和 Module 同时存在时，谁负责局部覆盖、谁负责全局策略？
> - 为什么 Module 顺序可能改变最终序列化行为？

## Related

- [序列化器缓存](/notes/source/java/base/jackson-databind/serializer-cache/)
- [Bean 属性发现](/notes/source/java/base/jackson-databind/property-discovery/)