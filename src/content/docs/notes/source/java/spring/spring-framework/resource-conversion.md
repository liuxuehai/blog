---
title: 资源与类型转换
description: Resource 抽象、classpath 模式解析和 ConversionService 如何统一外部资源与属性绑定。
category: Backend
tags:
  - Source Reading
  - Spring Framework
  - Resource
  - Conversion
order: 17
updatedDate: 2026-08-15
difficulty: advanced
status: stable
lastReviewed: 2026-08-15
draft: false
sidebar:
  order: 17
---

Spring 把“资源在哪里”和“字符串如何变成目标类型”分别抽象出来，使 BeanFactory、环境配置和组件扫描不必绑定文件系统或某一种转换实现。

<!-- more -->

## 两条基础管道

```text
location string
  -> ResourceLoader#getResource
  -> Resource
  -> InputStream / URL / File

property value
  -> ConversionService#convert
  -> TypeDescriptor
  -> target object
```

`ResourceLoader#getResource()` — `spring-core/.../ResourceLoader.java:98`；`PathMatchingResourcePatternResolver` 在 `spring-core/.../PathMatchingResourcePatternResolver.java:216`，单资源入口 `:356`，模式解析入口 `:365`；`GenericConversionService#convert()` 在 `spring-core/.../GenericConversionService.java:163`、`:169`。

## 资源模式解析

`classpath:` 通常解析单个资源，`classpath*:` 需要枚举多个 classloader 资源；Ant 风格通配符则先确定根路径，再遍历匹配路径。Resolver 因此必须处理 jar、文件目录和不同 ClassLoader 的差异。

## 类型转换

`ConversionService` 以 source/target `TypeDescriptor` 查找 Converter、ConverterFactory 或 GenericConverter。集合、数组、Map 等复合转换器会递归调用同一个服务，形成可组合转换图。

## 为什么不直接到处用 `File`

**替代方案**：业务代码统一接收 `File` 和手工 `ClassLoader#getResource`。
**为什么不行**：jar 内资源没有稳定文件路径，测试和部署环境也可能只有 URL/流；类型转换则会被散落在配置绑定代码中。
**证据**：`Resource` 同时提供 URL、File、InputStream 能力，`ResourcePatternResolver` 把多资源枚举作为独立协议。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| jar 内资源调用 `getFile()` | 抛异常 | 资源不一定是文件系统文件 | 使用 `getInputStream()` |
| `classpath*:` 重复资源 | 同名配置被加载多次 | 多个 classloader 都返回匹配 | 明确去重和优先级 |
| 泛型集合转换失败 | 元素类型信息不足 | 擦除后只有原始 Collection | 使用 `TypeDescriptor` 或显式目标类型 |

## 可迁移知识

资源定位和数据转换都适合做成策略注册表：输入保持稳定，后端实现可替换，复合类型通过递归组合获得能力。

> **面试锚点**
> - `classpath:` 和 `classpath*:` 有什么区别？
> - 为什么 Spring 的资源抽象不能只返回 `File`？
> - `ConversionService` 如何支持集合元素递归转换？

## Related

- [整体架构](/notes/source/java/spring/spring-framework/architecture/)
- [refresh() 十二步](/notes/source/java/spring/spring-framework/refresh-lifecycle/)
