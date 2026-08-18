---
title: Netty 通信与会话持久化
description: Seata Netty 请求响应、Future、处理器分发与 GlobalSession/BranchSession 编码。
category: Backend
tags: [Source Reading, Seata, Netty, Session]
order: 55
updatedDate: 2026-08-16
difficulty: advanced
status: stable
lastReviewed: 2026-08-16
draft: false
sidebar: { order: 55 }
---

Seata 的 RPC 层把同步事务请求转换成带 message id 的 Netty 消息，客户端用 `futures` 等待响应，服务端按 request code 找处理器。会话层则把全局事务和分支事务编码成可存储对象，支持数据库、文件、Redis 或 Raft 等 store。

## 请求响应图

```text
sendSyncRequest
  -> build RpcMessage(id)
  -> futures[id] = MessageFuture
  -> Netty channel.write
  -> server processMessage -> processor executor
  -> response(id)
  -> future.complete -> caller returns
```

连接断开时客户端会清理该 channel 关联的 pending future，避免调用线程无限等待；批量发送则把多个消息合并为 `MergeMessage`，但同步语义仍需为每个子消息保留映射。

## 会话模型

`GlobalSession` 保存 XID、状态、超时、事务名和分支集合；`BranchSession` 保存 branch id、branch type、resource id、lock key、client id 和 branch status。二者都实现 `SessionStorable`，通过 encode/decode 适配持久化层，并在 size check 中限制单条会话过大。

## 为什么这么设计

**替代方案一：** 每次 RPC 使用阻塞连接。**问题：** 连接创建、线程和故障清理成本高。**选择：** 长连接 + message id + future 多路复用。

**替代方案二：** 只在 TC 内存保存 session。**问题：** TC 重启会丢失未完成事务，无法继续补偿。**选择：** session 抽象和编码协议把状态交给可替换 store。

**替代方案三：** 全局 session 内嵌全部分支对象。**问题：** 分支数量大时读写和序列化膨胀。**选择：** 支持 lazy load branch，并对序列化大小进行硬限制。

## 源码坐标索引

- `AbstractNettyRemoting#sendSync` — `core/src/main/java/org/apache/seata/core/rpc/netty/AbstractNettyRemoting.java:185`
- `AbstractNettyRemoting#processMessage` — `core/src/main/java/org/apache/seata/core/rpc/netty/AbstractNettyRemoting.java:301`
- `AbstractNettyRemotingClient#sendSyncRequest` — `core/src/main/java/org/apache/seata/core/rpc/netty/AbstractNettyRemotingClient.java:161`
- `AbstractNettyRemotingClient#sendAsyncRequest` — `core/src/main/java/org/apache/seata/core/rpc/netty/AbstractNettyRemotingClient.java:230`
- `AbstractNettyRemotingClient#registerProcessor` — `core/src/main/java/org/apache/seata/core/rpc/netty/AbstractNettyRemotingClient.java:262`
- `AbstractNettyRemotingClient#cleanupResourcesForChannel` — `core/src/main/java/org/apache/seata/core/rpc/netty/AbstractNettyRemotingClient.java:454`
- `AbstractNettyRemotingServer#sendSyncRequest` — `core/src/main/java/org/apache/seata/core/rpc/netty/AbstractNettyRemotingServer.java:71`
- `AbstractNettyRemotingServer#registerProcessor` — `core/src/main/java/org/apache/seata/core/rpc/netty/AbstractNettyRemotingServer.java:119`
- `AbstractNettyRemotingServer#processMessage` — `core/src/main/java/org/apache/seata/core/rpc/netty/AbstractNettyRemotingServer.java:285`
- `GlobalSession#encode` — `server/src/main/java/org/apache/seata/server/session/GlobalSession.java:631`
- `GlobalSession#decode` — `server/src/main/java/org/apache/seata/server/session/GlobalSession.java:774`
- `BranchSession#encode` — `server/src/main/java/org/apache/seata/server/session/BranchSession.java:327`
- `BranchSession#decode` — `server/src/main/java/org/apache/seata/server/session/BranchSession.java:500`

## 边界与踩坑

- RPC timeout 只说明当前调用没有收到响应，不代表 TC 没有执行请求；事务接口必须允许后续 status/report 查询。
- 批量发送会增加调度复杂度，message id 与子消息映射不能丢。
- session size 限制会把超大的 applicationData/lockKey 变成事务错误，应用侧不应把大对象塞进元数据。

## 可迁移知识

可靠 RPC 的核心是“请求生命周期可观测”：请求 id、future、超时、断连清理和幂等/查询协议必须一起设计。持久化对象则应有稳定编码边界，避免存储实现反向污染业务模型。

> **面试锚点**：Netty 同步请求如何避免串包？连接断开如何处理 pending future？为什么 session 要 encode/decode 和 size check？

## Related

- [整体架构](/notes/source/java/rpc/seata/architecture/)
- [事务生命周期](/notes/source/java/rpc/seata/transaction-lifecycle/)
- [失败恢复与状态机](/notes/source/java/rpc/seata/recovery/)
