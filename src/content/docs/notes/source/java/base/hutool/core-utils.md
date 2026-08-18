---
title: 核心工具与日期字符串
description: Hutool core 中字符串、对象、集合、日期和资源工具的分层与失败策略。
category: Backend
tags: [Source Reading, Hutool, Core]
order: 92
updatedDate: 2026-08-16
difficulty: advanced
status: stable
lastReviewed: 2026-08-16
draft: false
sidebar:
  order: 92
---

`hutool-core` 的源码看似是大量工具类，实际可以按“输入归一化、轻量计算、状态对象”分三类阅读。`StrUtil`、`ObjectUtil`、`CollUtil` 和 `DateUtil` 是高频入口，但它们共享的是边界处理习惯，不是一个庞大的继承体系。

<!-- more -->

## 字符串与对象

`StrUtil` 通常先判断 null、空串和空白，再进入索引、切分、格式化或替换逻辑。`ObjectUtil` 则集中处理 null、安全相等、默认值和类型判断。调用者因此可以把常见防御代码移到工具层，但不能把“非空”误认为“业务有效”。

```text
isEmpty / isBlank -> 快速返回
                 -> 参数校验
                 -> JDK String 操作
                 -> 新字符串或原值
```

字符串模板、分割和替换会产生新对象；在大批量日志或协议处理中，仍应关注分配成本，而不是只看调用代码是否简短。

## 集合与数组

`CollUtil` 和 `ArrayUtil` 更像边界适配层：空集合返回、分批、连接、去重和转换都围绕 JDK 容器完成。重点不是算法创新，而是让 null、数组/集合差异和泛型擦除不再散落在业务代码中。

| 场景 | 需要关注 |
| --- | --- |
| `isEmpty` | null 与 empty 是否按同一语义处理 |
| `split` / `partition` | 是否创建新容器，修改结果是否影响原集合 |
| `join` | 元素为 null 时的文本语义 |
| `distinct` | 是否保持顺序，元素 equality 是否可靠 |

## 日期工具

`DateUtil` 同时面对 `Date`、`Calendar`、`LocalDateTime` 和字符串格式。源码阅读重点是类型桥接和格式选择，而不是记住某个静态方法名。

```text
输入类型 -> 类型归一化 -> 格式识别/显式 formatter
         -> DateTime / Date 转换 -> 输出类型
```

自动识别适合日志和交互输入，固定格式适合接口、账务和持久化。多线程服务中应优先使用不可变的 `java.time` formatter 语义，避免共享可变格式化器。

## 资源与异常

资源工具会把 classpath、文件、URL 和流统一成读取入口，但“读取成功”不等于资源生命周期已结束。涉及流、文件句柄或网络响应时，调用方仍要明确关闭责任；工具类无法替调用方猜测所有权。

> **面试锚点**
> - 为什么工具类普遍采用 null-safe 设计？它可能隐藏什么问题？
> - 日期自动解析与固定格式解析分别适合什么场景？
> - `CollUtil` 的便利性如何避免被误用为线程安全保证？

## Related

- [转换与配置](/notes/source/java/base/hutool/convert-and-setting/)
- [整体架构](/notes/source/java/base/hutool/architecture/)