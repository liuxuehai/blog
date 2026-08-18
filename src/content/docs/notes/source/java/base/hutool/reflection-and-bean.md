---
title: 反射与 Bean 操作
description: Hutool ReflectUtil、BeanUtil 和动态调用的元数据缓存、命名重载与访问边界。
category: Backend
tags: [Source Reading, Hutool, Reflection, Bean]
order: 96
updatedDate: 2026-08-16
difficulty: advanced
status: stable
lastReviewed: 2026-08-16
draft: false
sidebar:
  order: 96
---

反射模块是 Hutool “短 API”背后的复杂区域。`ReflectUtil` 负责类、字段、方法和构造器访问，`BeanUtil` 在此之上补充属性描述、Map/Bean 转换和字段拷贝。源码阅读关键是理解查找、访问和转换三个阶段没有完全合并。

<!-- more -->

## 反射调用路径

```text
类名/实例/方法名
      -> 找到 Method/Constructor/Field
      -> 参数类型匹配与可访问性处理
      -> invoke / get / set
      -> 异常包装或结果转换
```

按名称查找不是按名称唯一定位：重载方法需要结合参数数量、原始类型、包装类型、继承关系和可访问性。一个“能调用”的实现如果只取第一个同名方法，面对重载就会产生隐蔽错误。

## Bean 操作路径

```text
BeanUtil.copyProperties
      -> BeanInfo / PropertyDescriptor
      -> 源属性读取
      -> 类型转换、忽略策略、编辑器
      -> 目标属性写入
```

字段直接访问与 getter/setter 访问的语义不同。Bean 工具应明确是否支持私有字段、是否调用 setter、是否复制 null、是否递归复制嵌套对象，以及异常发生时是跳过还是终止。

## 缓存与性能

反射元数据查找可以缓存，但缓存 key 必须包含 Class、方法名、参数类型和必要的访问上下文；只按方法名缓存会破坏重载正确性。JDK 方法句柄、Lambda 或字节码生成可减少调用成本，但首次创建和访问权限检查仍有成本。

## 安全边界

反射工具不应直接暴露为外部输入驱动的任意调用器。类名、方法名和字段名来自请求参数时，要使用白名单、包边界和参数校验；`setAccessible` 或模块开放也不等于授权。

> **面试锚点**
> - 为什么反射方法缓存不能只用方法名做 key？
> - Bean 拷贝中 null 策略和类型转换策略为何要分开？
> - 如何把通用 ReflectUtil 限制在安全的内部扩展点？

## Related

- [转换与配置](/notes/source/java/base/hutool/convert-and-setting/)
- [整体架构](/notes/source/java/base/hutool/architecture/)
- [面试专题](/notes/source/java/base/hutool/interview/)