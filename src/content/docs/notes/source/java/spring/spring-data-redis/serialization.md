---
title: 序列化器体系
description: RedisSerializer、SerializationPair 以及 String、Java、JSON 类型策略。
category: Backend
tags: [Source Reading, Spring Data Redis, Serialization]
order: 74
updatedDate: 2026-08-16
difficulty: advanced
status: stable
lastReviewed: 2026-08-16
draft: false
sidebar:
  order: 74
---

Redis 只接收字节数组，Spring Data Redis 用 serializer 把类型边界显式化，并为 key、value、hash key、hash value 分配独立策略。

<!-- more -->

## 数据结构

```text
RedisTemplate
  keySerializer       -> key bytes
  valueSerializer     -> value bytes
  hashKeySerializer   -> hash field bytes
  hashValueSerializer -> hash value bytes
  stringSerializer    -> script/channel/string bytes
```

`RedisSerializer` 定义在 `serializer/RedisSerializer.java:31-134`，只要求 `serialize` 和 `deserialize`，并提供 Java、JSON、String、byte[] 工厂方法 `:40-86`。

`DefaultRedisSerializationContext` 在 `serializer/DefaultRedisSerializationContext.java:30-45` 保存五个 `SerializationPair`，builder 的必填检查在 `:142-151`。

## JSON 动态类型

`GenericJackson2JsonRedisSerializer` 在 `serializer/GenericJackson2JsonRedisSerializer.java:60-80` 说明它使用动态类型。`serialize` 在 `:269-281` 处理 null 和 JSON 写入，`deserialize` 在 `:301-316` 根据类型提示解析对象。

动态类型能让 `RedisTemplate<String,Object>` 恢复多态对象，但会把类型信息写入数据格式，且扩大反序列化攻击面，生产上应限制可信数据和类型白名单。

## 关键取舍

**替代方案**：所有值都用 JDK serialization。
**为什么不行**：格式不透明、跨语言困难、类演进和安全审计成本高。
**证据**：项目同时提供 String、JSON、Java 和 byte[] serializer，见 `RedisSerializer.java:40-86`；模板文档还明确默认 Java serializer，见 `RedisTemplate.java:68-84`。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| key 使用 JSON | Redis CLI 中 key 不可读 | key 也被对象编码 | key 通常使用 String serializer |
| 更换 serializer | 老数据无法读取 | Redis 中只保存 bytes | 版本化 key 或双读迁移 |
| 开启动态类型 | 反序列化风险 | 类型提示来自外部数据 | 使用受控类型和可信数据 |

## 可迁移知识

序列化策略应成为显式 schema，而不是隐含在泛型里；缓存、消息和持久化系统都应考虑格式演进、跨语言与安全边界。

> **面试锚点**
> - 为什么 key 和 value 要分开 serializer？
> - JSON 动态类型解决了什么问题，又引入什么风险？
> - `SerializationPair` 比直接持有 serializer 多解决了什么？

## Related

- [RedisTemplate 调用链](/notes/source/java/spring/spring-data-redis/redis-template/)
- [Redis Stream 长轮询](/notes/source/java/spring/spring-data-redis/stream/)