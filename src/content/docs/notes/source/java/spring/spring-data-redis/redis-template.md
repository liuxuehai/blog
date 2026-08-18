---
title: RedisTemplate 调用链
description: 从操作对象到 RedisCallback 的模板方法链、连接代理与结果转换。
category: Backend
tags: [Source Reading, Spring Data Redis, RedisTemplate]
order: 73
updatedDate: 2026-08-16
difficulty: advanced
status: stable
lastReviewed: 2026-08-16
draft: false
sidebar:
  order: 73
---

`RedisTemplate` 的核心不是命令数量，而是把连接、序列化、异常和资源释放集中到一次模板执行中。

<!-- more -->

## 调用链

```text
opsForHash().put(k,hk,hv)
  -> rawKey/rawHashKey/rawHashValue
  -> execute(callback)
     -> getConnection(factory, txSupport)
     -> callback.doInRedis(connection proxy)
     -> releaseConnection()
```

类声明与线程安全说明在 `core/RedisTemplate.java:68-104`。`execute(RedisCallback)` 在 `:370-384` 委托到完整重载，真正逻辑在 `:397-427`。

## 连接代理

当 `exposeConnection=false` 时，模板在 `:416-417` 把连接包装成 close-suppressing proxy，防止 callback 误关闭由模板管理的连接；代理构造位于 `:545-550`。这是资源所有权隔离，而不是性能优化。

## 操作对象

`opsForValue`、`opsForHash`、`opsForStream` 等方法集中在 `:1059-1128`。它们返回命令域对象，命令域对象只负责把类型化参数转换为模板回调，不直接管理连接。

## 为什么用回调模板

**替代方案**：每个操作对象都自己获取、关闭连接。
**为什么不行**：事务绑定、管道和异常释放会在几十个操作类中重复，且容易出现连接泄漏。
**证据**：所有 callback 都经由 `RedisTemplate#execute`，并在 `finally` 的 `RedisConnectionUtils.releaseConnection` 中释放，见 `RedisTemplate.java:403-427`。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| 未调用初始化 | 使用时报 template not initialized | serializer 和操作对象未准备好 | Bean 初始化后使用 |
| 自己关闭 callback 连接 | 后续命令失败 | 连接所有权属于模板 | 不暴露或不关闭 native connection |
| 类型 serializer 不匹配 | 反序列化异常 | 泛型不等于运行时格式 | key/value 分别配置 serializer |

## 可迁移知识

模板方法适合把资源租借、异常转换和审计统一起来；命令对象适合承载领域语义，但不应越过模板边界管理底层资源。

> **面试锚点**
> - `RedisTemplate#execute` 的 finally 做了什么？
> - 为什么默认不暴露原生连接？
> - `opsForValue` 和 `opsForStream` 如何复用同一连接链？

## Related

- [序列化器体系](/notes/source/java/spring/spring-data-redis/serialization/)
- [连接抽象与工厂](/notes/source/java/spring/spring-data-redis/connection-factory/)