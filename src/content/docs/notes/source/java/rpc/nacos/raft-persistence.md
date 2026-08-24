---
title: JRaft 与持久化一致性
description: Nacos CP 数据如何通过 JRaft 多组、异步提交、读写超时和协议元数据完成一致性管理。
category: Backend
tags: [Source Reading, Nacos, JRaft, CP]
order: 34
updatedDate: 2026-08-24
difficulty: advanced
status: stable
lastReviewed: 2026-08-24
draft: false
sidebar: { order: 34 }
---

Nacos 的 CP 路径不是把所有数据塞进一个 Raft 日志，而是由协议抽象、多个 Raft Group 和领域请求处理器组合完成。这样既保留顺序提交，又能按资源隔离故障域。

<!-- more -->

## 先给答案：Nacos 的 CP 路径不是把所有数据塞进一个 Raft 日志，而是由协议抽象、多个 Raft Grou…

Nacos 的 CP 路径不是把所有数据塞进一个 Raft 日志，而是由协议抽象、多个 Raft Group 和领域请求处理器组合完成。这样既保留顺序提交，又能按资源隔离故障域。 正文沿“写入链路 -> 实现拆解 -> 为什么使用多个 Raft Group”展开：先确认入口和状态归属，再跟踪控制流或数据流的推进，最后落到对外可观察的结果。

主要失效边界集中在“非 Leader 写入、Future 超时、Group 配置错误”这些场景。它们破坏的是容量、顺序、并发或生命周期前提；排查时应先确认状态是否仍由正确对象持有，再核对推进条件和清理路径。

## 写入链路

```text
WriteRequest(group, payload)
  -> JRaftProtocol#writeAsync
  -> JRaftServer#commit
  -> selected Raft Group leader
  -> replicated log / state machine
  -> CompletableFuture<Response>
  -> timeout boundary
```

## 实现拆解

`JRaftProtocol#init` 只允许初始化一次，启动 `JRaftServer` 并订阅 `RaftEvent`。事件中的 leader、term、成员和错误信息会写入 `ProtocolMetaData`，再注入本机 `Member`，供集群诊断和治理使用。

同步读 `getData` 设置 5 秒等待，写 `write` 设置 10 秒等待，底层异步接口则保留给调用方组合。`addRequestProcessors` 让一个服务器承载多个 Raft Group，每组由对应处理器消费领域请求。

## 为什么使用多个 Raft Group

**替代方案**：整个 Nacos 只有一个全局 Raft Group。
**为什么不行**：不同领域的写入会争用同一日志和 leader，配置、命名持久实例及插件状态互相放大延迟。
**证据**：`addRequestProcessors` 委托 `createMultiRaftGroup`，请求携带 group，`writeAsync` 通过 `request.getGroup()` 选择提交目标。

## 源码坐标索引

- `JRaftProtocol#init` — `core/src/main/java/com/alibaba/nacos/core/distributed/raft/JRaftProtocol.java:116`
- `JRaftProtocol#addRequestProcessors` — `core/src/main/java/com/alibaba/nacos/core/distributed/raft/JRaftProtocol.java:164`
- `JRaftProtocol#getData` — `core/src/main/java/com/alibaba/nacos/core/distributed/raft/JRaftProtocol.java:170`
- `JRaftProtocol#aGetData` — `core/src/main/java/com/alibaba/nacos/core/distributed/raft/JRaftProtocol.java:176`
- `JRaftProtocol#write` — `core/src/main/java/com/alibaba/nacos/core/distributed/raft/JRaftProtocol.java:181`
- `JRaftProtocol#writeAsync` — `core/src/main/java/com/alibaba/nacos/core/distributed/raft/JRaftProtocol.java:188`
- `JRaftProtocol#memberChange` — `core/src/main/java/com/alibaba/nacos/core/distributed/raft/JRaftProtocol.java:193`
- `JRaftProtocol#shutdown` — `core/src/main/java/com/alibaba/nacos/core/distributed/raft/JRaftProtocol.java:204`
- `JRaftProtocol#isLeader` — `core/src/main/java/com/alibaba/nacos/core/distributed/raft/JRaftProtocol.java:223`
- `JRaftProtocol#isReady` — `core/src/main/java/com/alibaba/nacos/core/distributed/raft/JRaftProtocol.java:233`
- `JRaftServer#init` — `core/src/main/java/com/alibaba/nacos/core/distributed/raft/JRaftServer.java:155`
- `JRaftServer#start` — `core/src/main/java/com/alibaba/nacos/core/distributed/raft/JRaftServer.java:196`

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| 非 Leader 写入 | 请求转发或失败 | Raft 只有 Leader 接受提交 | 对外暴露 leader-aware 重试 |
| Future 超时 | 客户端看到失败但日志可能随后提交 | 应用超时不等于共识回滚 | 使用请求幂等键和结果查询 |
| Group 配置错误 | 某一类数据不可用 | 处理器与 group 映射不一致 | 启动时检查协议元数据和 group 状态 |

## 可迁移知识

多 Raft Group 是把一致性域做成可分片资源。设计时应先定义故障隔离和顺序边界，再决定 group 划分，而不是只按模块目录机械切分。

> **面试锚点**
> - Nacos 的 CP 写入如何选择 Raft Group？
> - 应用层超时后为什么不能认为写入一定失败？
> - Raft 元数据为什么还要同步到 Member？

## Related

- [整体架构](/notes/source/java/rpc/nacos/architecture/)
- [Distro 与 AP 同步](/notes/source/java/rpc/nacos/distro-ap/)
- [配置长轮询与推送](/notes/source/java/rpc/nacos/config-long-polling/)
