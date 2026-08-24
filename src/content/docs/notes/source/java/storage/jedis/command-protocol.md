---
title: 命令与 RESP 协议
description: CommandArguments、CommandObject 和 Protocol 如何把 Java 调用编码成 RESP 并恢复成类型化结果。
category: Backend
tags: [Source Reading, Jedis, Redis, Protocol]
order: 52
updatedDate: 2026-08-24
lastReviewed: 2026-08-24
sidebar:
  order: 52
---

Jedis 把协议细节压到 `Protocol`，把业务参数放进 `CommandArguments`，再用 `Builder<T>` 把原始响应恢复为 API 类型。

<!-- more -->

## 先给答案：Jedis 把协议细节压到 Protocol，把业务参数放进 CommandArguments，再用 Bu…

Jedis 把协议细节压到 Protocol，把业务参数放进 CommandArguments，再用 Builder<T 把原始响应恢复为 API 类型。 正文沿“设计概览 -> 实现拆解 -> 为什么用 Builder 而不是让 API 自己强转”展开：先确认入口和状态归属，再跟踪控制流或数据流的推进，最后落到对外可观察的结果。

主要失效边界集中在“bulk string 为 null、二进制 key 当文本处理、未标记 blocking”这些场景。它们破坏的是容量、顺序、并发或生命周期前提；排查时应先确认状态是否仍由正确对象持有，再核对推进条件和清理路径。

## 设计概览

```text
Java args
  └─► CommandArguments
       └─► CommandObject<T>
            ├─► Protocol.sendCommand
            └─► Protocol.process ─► Builder<T>
```

## 实现拆解

`CommandArguments` 保存命令和参数，并允许标记 key、blocking、hash-slot key 等语义。它的价值是让路由和协议层不必重新解析 API 方法参数：见 `CommandArguments.java:14-69`、`CommandArguments.java:100-180`、`CommandArguments.java:220-277`。

`CommandObject<T>` 是不可变执行描述。它组合参数、返回值 builder 和前置 hook；`withPreProcessHook` 返回新对象，避免修改已经共享的命令对象：见 `CommandObject.java:12-68`、`CommandObject.java:70-104`。

`Protocol#sendCommand` 按 RESP 数组写入命令长度、bulk string 长度和 CRLF；`Protocol#process` 依据首字节区分简单字符串、整数、bulk string、数组和错误：见 `Protocol.java:72-84`、`Protocol.java:88-128`、`Protocol.java:131-170`、`Protocol.java:171-250`。

返回值转换集中在 `BuilderFactory`，这样 `GET`、集合命令和模块命令可以复用同一套 raw response 解析：见 `Builder.java:3-40`、`BuilderFactory.java:13-70`、`BuilderFactory.java:160-240`。

## 为什么用 Builder 而不是让 API 自己强转

**替代方案**：API 方法从 `Protocol.process` 取得 `Object` 后各自强转。
**为什么不行**：同一响应可能需要 bytes、String、Map、Set 或模块对象，不同方法各自转换会放大类型错误和重复代码。
**证据**：`CommandObject<T>` 在发送前已经携带 `Builder<T>`，`Connection#executeCommand` 只负责执行和调用 builder。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| bulk string 为 null | 返回 null 而非空字符串 | RESP null 有独立编码 | 依据命令语义处理 null |
| 二进制 key 当文本处理 | key 损坏 | 默认编码不等于任意字节 | 使用 binary API |
| 未标记 blocking | 集群/连接管理误判 | 命令元数据不完整 | 使用正确的 `CommandArguments` 标记 |

## 可迁移知识

协议客户端可以用“不可变请求描述 + 可插拔响应 builder”隔离传输格式和业务类型；这也适用于 HTTP、RPC 和消息协议。

> **面试锚点**
> - RESP 数组和 bulk string 如何编码？
> - 为什么 `CommandObject` 要不可变？
> - builder 放在哪一层最合适？

## Related

- [Jedis 整体架构](/notes/source/java/storage/jedis/architecture/)
- [Redis 协议与客户端](/notes/source/redis/redis/)
