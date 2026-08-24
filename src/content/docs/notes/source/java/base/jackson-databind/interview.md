---
title: 面试专题
description: Jackson Databind 类型系统、缓存、属性发现、Module 与安全边界面试题。
category: Backend
tags: [Source Reading, Jackson, Interview]
order: 77
updatedDate: 2026-08-24
difficulty: advanced
status: stable
lastReviewed: 2026-08-24
draft: false
sidebar:
  order: 77
---

Jackson 面试题的区分度不在 API 记忆，而在能否说清“类型信息在哪里保存、元数据在哪里构造、缓存在哪里复用、上下文在哪里覆盖”。

<!-- more -->

## 先给答案：Jackson 面试题的区分度不在 API 记忆，而在能否说清“类型信息在哪里保存、元数据在哪里构造、缓存…

Jackson 面试题的区分度不在 API 记忆，而在能否说清“类型信息在哪里保存、元数据在哪里构造、缓存在哪里复用、上下文在哪里覆盖”。 正文沿“高频题 -> 高难追问 -> 场景题”展开：先确认入口和状态归属，再跟踪控制流或数据流的推进，最后落到对外可观察的结果。

主要失效边界集中在“线上反序列化延迟突然升高，怎么排查、自定义 serializer 没有生效怎么办、多态反序列化如何做安全审查”这些场景。它们破坏的是容量、顺序、并发或生命周期前提；排查时应先确认状态是否仍由正确对象持有，再核对推进条件和清理路径。

## 高频题

### 为什么需要 JavaType？

**30 秒版**：`Class<?>` 无法表达 `List<User>` 的元素类型，`JavaType` 保存容器结构和参数类型，供 serializer/deserializer 选择。

**加分项**：`TypeFactory` 统一解析 `Class`、`TypeReference` 和反射 `Type`，避免每种容器各自维护泛型逻辑。

### ObjectMapper 为什么应该复用？

**30 秒版**：mapper 持有配置、工厂和 serializer/deserializer 缓存；重复创建会重复构造元数据并增加配置漂移。

**边界**：复用的前提是完成启动期配置，运行时不要随意改变共享 mapper 的行为。

### Jackson 如何把字段和 getter 合并成一个属性？

`POJOPropertiesCollector` 收集成员，`POJOPropertyBuilder` 合并候选，之后通过 `BeanPropertyDefinition` 交给 serializer/deserializer 工厂。注解、命名策略和 visibility checker 共同决定最终结果。

### serializer 缓存为什么还需要 contextualization？

基础类型可以共享，但属性格式、视图、注解、类型处理器和 null provider 可能随位置变化。Jackson 先复用基础 serializer，再按属性上下文派生实例。

### Module 和注解怎么选？

单个领域类的局部协议优先用注解；第三方类、全局类型规则和批量属性变更优先用 Module。两者混用时要测试优先级和注册顺序。

## 高难追问

### 反序列化为什么比序列化复杂？

序列化从已有对象读取属性；反序列化还要处理 creator 选择、字段顺序、缺失/null、未知字段、类型 id 和可变/不可变对象构造，因此需要 `PropertyValueBuffer`、`SettableBeanProperty` 和上下文状态。

### 类型擦除后 Jackson 怎么恢复泛型？

它不能从普通 `List.class` 恢复实际元素类型；调用方必须通过 `TypeReference`、显式 `JavaType` 或带参数的 `Type` 提供信息。

### 只读属性和只写属性如何出现？

属性发现可以把 getter、setter、field 和 creator 参数组合成不同方向的逻辑属性。序列化和反序列化工厂分别选择可读和可写成员，不要求每个属性同时具备 getter/setter。

## 场景题

### 线上反序列化延迟突然升高，怎么排查？

先看目标类型是否变化导致缓存命中下降，再看是否大量动态 Module、匿名类型、异常 creator 或多态类型解析；随后区分 parser/token 成本、Bean 元数据构造成本和业务 setter/creator 成本。

### 自定义 serializer 没有生效怎么办？

确认 Module 已注册到实际使用的 mapper，类型是否匹配声明/运行时类型，是否被更具体的属性 serializer 或 contextual serializer 覆盖，并检查 Module 注册顺序。

### 多态反序列化如何做安全审查？

限制允许的基类型和子类型，使用 validator 或显式映射，不接受任意客户端类名；同时检查历史 payload、错误处理和跨服务信任边界。

> **面试锚点**
> - `TypeFactory`、`SerializerProvider`、`DeserializerCache`、`POJOPropertiesCollector` 各自维护什么状态？
> - 为什么 Jackson 把反射成本集中到元数据阶段？
> - 为什么一个共享 mapper 仍然可能产生上下文相关 serializer？

## Related

- [整体架构](/notes/source/java/base/jackson-databind/architecture/)
- [JavaType 与泛型](/notes/source/java/base/jackson-databind/java-type/)
- [注解与 Module](/notes/source/java/base/jackson-databind/modules/)