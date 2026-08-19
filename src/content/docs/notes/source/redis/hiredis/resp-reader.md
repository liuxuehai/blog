---
title: RESP Reader 状态机
description: redisReader 如何用增量缓冲、栈和 reply 工厂处理半包与嵌套 RESP。
category: Database
tags:
  - Source Reading
  - hiredis
  - RESP
  - Parser
order: 43
updatedDate: 2026-08-19
difficulty: advanced
status: stable
lastReviewed: 2026-08-19
draft: false
sidebar:
  order: 43
---

hiredis 的 reader 不是“一次 read 对应一个 reply”的解析器。网络分片可以截断在任意字节，单次 read 也可能包含多个 reply，因此 `redisReader` 必须保存未完成状态，并在下一次 feed 后继续解析。

<!-- more -->

## 先给答案：RESP reader 是一个可暂停、可恢复、可嵌套的解析状态机

网络读取可能在任意字节处结束，reader 不能假定一次 read 包含完整 reply。它必须记录当前类型、剩余长度、已读内容和嵌套容器，下一批字节到达后从上次状态继续；解析完成后，再把 reply 交给同步或异步上层。

多 reply 和 push reply 进一步说明：协议解析和请求匹配是两件事。reader 只负责识别“收到了什么”，异步 context 再根据命令队列决定“交给哪个 callback”。如果把这两层混在一起，服务端主动推送就可能被误认为普通命令响应。


## 状态机

```text
bytes arrive
    |
    v
redisReaderFeed
    |
    v
parse RESP type/length
    | complete? ---------------- no ----------------+
    |                                               |
   yes                                              v
reply object <--------- redisReaderGetReply <- keep buffer/stack
```

## 核心入口

`redisReaderCreateWithFunctions` 在 `read.c:736` 创建 reader 和 reply object functions；释放逻辑在 `:769`。数据追加由 `redisReaderFeed`（`:789`）完成，调用者取 reply 由 `redisReaderGetReply`（`:820`）完成。

```text
socket bytes
  -> c->reader->buf
  -> 当前 offset
  -> 当前 aggregate stack
  -> createString/createArray/createInteger...
```

## 为什么需要函数表

**替代方案**：reader 直接写死 `redisReply` 的 malloc/free。
**为什么不行**：模块、测试或自定义内存策略可能需要不同的 reply 对象；协议解析和对象表示不应强耦合。
**证据**：`redisReaderCreateWithFunctions` 接受 `redisReplyObjectFunctions *fn`，默认 reader 在 `hiredis.c:707` 通过 `defaultFunctions` 创建。

## 半包与多 reply

reader 只在完整对象可构造时返回 reply；遇到不完整 bulk string 或数组时保留缓冲和聚合栈。相反，如果一个 buffer 含有多个完整 reply，`redisReaderGetReply` 可以逐个取出，不必重新读取 socket。

## Push reply 与带内 reply

`hiredis.c:1042` 的 `redisHandledPushReply` 处理 push 类型 reply；`redisGetReplyFromReader` 在 `:1052` 把 reader 产物区分为普通响应和主动推送。订阅、客户端 tracking 等场景中，不能假定“第一个 reply 一定对应当前命令”。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| 半个 bulk string | reader 暂时无 reply | 长度声明的数据尚未到齐 | 保留 reader，不要丢弃 buffer |
| 嵌套数组过深 | 内存或栈压力 | 聚合对象需要递归层级 | 使用协议限制和输入上限 |
| malformed RESP | context 进入错误态 | reader 检测到协议错误 | 记录错误并关闭连接 |
| push 与普通 reply 混排 | 回调/请求错配 | 协议允许主动消息 | 先分流 push，再取 in-band reply |

## 可迁移知识

增量 parser 的关键不是“每次多读一点”，而是保存三个东西：输入缓冲、消费位置、未完成的组合对象。这个结构可迁移到 HTTP chunk、WebSocket frame 和自定义二进制协议。

> **面试锚点**
> - hiredis 如何处理半包？
> - 为什么 reader 要支持多个 reply 留在同一缓冲区？
> - push reply 为什么会破坏简单的 request/reply 假设？

## Related

- [同步命令链](/notes/source/redis/hiredis/sync-command/)
- [异步 API 与回调队列](/notes/source/redis/hiredis/async-api/)
- [Redis RESP 输入路径](/notes/source/redis/redis/event-loop/)
