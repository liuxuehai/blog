---
title: Bean 属性发现
description: POJOPropertiesCollector、BeanPropertyDefinition 与字段方法合并规则。
category: Backend
tags: [Source Reading, Jackson, Reflection, Java Beans]
order: 75
updatedDate: 2026-08-24
difficulty: advanced
status: stable
lastReviewed: 2026-08-24
draft: false
sidebar:
  order: 75
---

Jackson 的属性不是简单等于字段，也不是简单等于 getter。它先收集可见成员，再根据命名、可见性、注解和优先级合并成逻辑属性。

<!-- more -->

## 先给答案：Jackson 的属性不是简单等于字段，也不是简单等于 getter

Jackson 的属性不是简单等于字段，也不是简单等于 getter。它先收集可见成员，再根据命名、可见性、注解和优先级合并成逻辑属性。 正文沿“收集模型 -> 合并规则要解决什么 -> 注解与可见性”展开：先确认入口和状态归属，再跟踪控制流或数据流的推进，最后落到对外可观察的结果。

主要失效边界集中在“同名字段和方法可能合并，也可能因显式注解、命名策略或可见性形成冲突。、@JsonAutoDetect 修改的是发现边界，不是把任意私有成员自动变成安全 API。、Lombok、Kotlin、record 和字节码生成工具可能改变 Jackson 实际看到的成员形状，应结合对应 Module 验证。”这些场景。它们破坏的是容量、顺序、并发或生命周期前提；排查时应先确认状态是否仍由正确对象持有，再核对推进条件和清理路径。

## 收集模型

```text
fields / getters / setters / ctor params
                    ↓
          POJOPropertiesCollector
                    ↓
       POJOPropertyBuilder / definitions
                    ↓
      serializer writers / deserializer properties
```

`POJOPropertiesCollector` 负责扫描和合并，`POJOPropertyBuilder` 保存一个逻辑属性的多个成员候选。`BeanPropertyDefinition` 则向后续工厂提供稳定抽象。

## 合并规则要解决什么

一个名为 `name` 的逻辑属性可能同时拥有 private field、public getter、setter 和构造参数。Jackson 需要回答：

- 哪个成员提供序列化值？
- 哪个成员接收反序列化值？
- 哪个注解覆盖命名、忽略和格式？
- 只读、只写和 creator property 如何表达？

如果没有统一的逻辑属性层，serializer 和 deserializer 会分别实现一套不一致的 JavaBean 规则。

## 注解与可见性

字段、方法和构造参数上的注解会参与合并，但它们并不等价。`@JsonProperty` 可以提升成员为显式属性，`@JsonIgnore` 可以剔除候选，命名策略会改变逻辑名称，visibility checker 则决定默认可见范围。

## 替代方案与代价

**替代方案**：只支持 public getter/setter，或要求所有 DTO 实现接口。

**为什么没有采用**：会排除不可变对象、record-like 构造模式和第三方类型；收集器把兼容性复杂度集中在元数据阶段，换取运行期统一模型。

## 边界与踩坑

- 同名字段和方法可能合并，也可能因显式注解、命名策略或可见性形成冲突。
- `@JsonAutoDetect` 修改的是发现边界，不是把任意私有成员自动变成安全 API。
- Lombok、Kotlin、record 和字节码生成工具可能改变 Jackson 实际看到的成员形状，应结合对应 Module 验证。

> **面试锚点**
> - 一个属性同时有 field/getter/setter 时 Jackson 如何合并？
> - `BeanPropertyDefinition` 为什么比直接暴露反射成员更稳定？
> - 命名策略在属性发现的哪个阶段生效？

## Related

- [反序列化管线](/notes/source/java/base/jackson-databind/deserialization/)
- [注解与 Module](/notes/source/java/base/jackson-databind/modules/)