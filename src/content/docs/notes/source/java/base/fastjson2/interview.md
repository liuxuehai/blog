---
title: 面试专题
description: Fastjson2 JSONReader/Writer、对象适配器、字节码生成与安全边界面试题。
category: Backend
tags: [Source Reading, Fastjson2, Interview]
order: 87
updatedDate: 2026-08-24
difficulty: advanced
status: stable
lastReviewed: 2026-08-24
draft: false
sidebar:
  order: 87
---

Fastjson2 面试题的重点不是“比 Jackson 快多少”，而是能否解释格式层、对象层、字段层和生成器之间的边界，以及性能和安全如何同时成立。

<!-- more -->

## 先给答案：Fastjson2 面试题的重点不是“比 Jackson 快多少”，而是能否解释格式层、对象层、字段层和生…

Fastjson2 面试题的重点不是“比 Jackson 快多少”，而是能否解释格式层、对象层、字段层和生成器之间的边界，以及性能和安全如何同时成立。 正文沿“高频题 -> 高难追问 -> 场景题”展开：先确认入口和状态归属，再跟踪控制流或数据流的推进，最后落到对外可观察的结果。

主要失效边界集中在“序列化性能下降，如何排查、反序列化出现类型转换异常，怎么定位、如何审查一个开启多态的服务”这些场景。它们破坏的是容量、顺序、并发或生命周期前提；排查时应先确认状态是否仍由正确对象持有，再核对推进条件和清理路径。

## 高频题

### JSONReader 和 ObjectReader 为什么分开？

**30 秒版**：JSONReader 处理编码、token 和基础值，ObjectReader 处理目标 Java 类型和对象构造。拆分后同一对象层可以复用 JSON/JSONB、UTF-8/UTF-16 等格式后端。

### ObjectWriter 为什么要缓存？

**30 秒版**：Bean 的字段发现、注解合并、访问器创建和字段顺序构造很昂贵，缓存对象 writer 可以把这些成本从每次序列化移到首次创建。

### ASM 失败后怎么办？

Fastjson2 保留 Lambda/方法句柄和反射回退。代码生成负责高性能路径，回退负责复杂类型和访问边界下的兼容性；不能把 ASM 当成唯一正确实现。

### JSONB 一定比 JSON 好吗？

不是。JSONB 可减少文本解析和重复字段名成本，但可读性、跨语言、版本演进和调试成本不同。内部受控链路和公共 API 的选择标准不一样。

### Fastjson2 与 Fastjson1 的 AutoType 能否直接类比？

不能只按旧版本经验判断。应以当前版本的允许列表、类型过滤器、配置默认值和实际 payload 做安全审计；外部输入不应依赖任意类名实例化。

## 高难追问

### 为什么 provider 缓存不能只按 Class？

`List<User>` 和 `List<Order>` 的元素 reader 不同，Map 的 key/value 类型也不同；泛型、字段特性和类型信息会影响最终 reader/writer，缓存 key 必须保留足够类型上下文。

### 字段 writer 如何减少反射成本？

创建阶段完成字段发现、名称处理、访问器和子 writer 绑定，热路径只需取值并调用 writer。它仍然要支付字符串、过滤器、格式转换和输出分配成本。

### 输入 token 游标为什么是核心正确性问题？

自定义 reader 如果没有消费完整字段值，后续字段会从错误 token 开始；错误可能延迟到对象末尾才暴露。因此 reader 合同不仅是返回值，还包括游标位置和异常状态。

## 场景题

### 序列化性能下降，如何排查？

先固定 JSON/JSONB、UTF-8/UTF-16、对象大小和特性位；再确认 provider 是否命中缓存、是否退回反射、是否启用过滤器/格式化/类型信息，最后区分访问成本和输出分配成本。

### 反序列化出现类型转换异常，怎么定位？

确认传入的 `Type` 是否包含泛型参数，检查字段 reader 的目标类型、别名和格式配置，再确认 payload 的类型标记是否与业务允许列表一致。

### 如何审查一个开启多态的服务？

梳理所有 reader/provider 配置，列出允许基类和子类型，区分内部与外部 payload，验证拒绝未知类型的行为，并对历史兼容开关做回归测试。

> **面试锚点**
> - `JSONReader`、`ObjectReader`、`FieldReader` 各自维护什么状态？
> - Fastjson2 的性能优化哪些属于一次性成本，哪些属于每次调用成本？
> - 为什么类型灵活性越高，安全边界越重要？

## Related

- [整体架构](/notes/source/java/base/fastjson2/architecture/)
- [字节码生成与访问路径](/notes/source/java/base/fastjson2/codegen/)
- [类型元数据与安全边界](/notes/source/java/base/fastjson2/type-and-security/)