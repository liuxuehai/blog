---
title: Netty
description: Netty 4.2 源码解析总览：EventLoop、Pipeline、ByteBuf、零拷贝、时间轮与拆包。
category: Backend
tags:
  - Source Reading
  - Netty
  - NIO
order: 2
updatedDate: 2026-08-19
difficulty: advanced
status: stable
lastReviewed: 2026-08-19
draft: false
sidebar:
  order: 2
---

Netty 是一个面向高并发网络应用的异步事件驱动框架。它把 Java NIO 的 Selector、连接生命周期、内存管理、协议编解码和写出背压组织成一套可组合的 Channel 抽象，解决的是“网络 I/O 细节不应侵入业务代码”的问题。

<!-- more -->

## 本册问题地图

Netty 不只是“基于 NIO 的网络库”，它把网络编程中最容易失控的几件事拆成可组合的机制：线程归属、事件传播、字节存储、协议边界和定时任务。本册沿着一条连接的生命周期阅读：

1. **连接由谁接收，又由谁长期负责？** Boss/Worker EventLoop 如何划分 accept、register 和 read/write。
2. **事件怎样穿过业务处理链？** Pipeline 如何区分入站、出站和异常传播。
3. **字节数据怎样从网络缓冲变成完整消息？** ByteBuf 的容量、引用计数和拆包状态如何配合。
4. **为什么同一份数据有时可以不复制？** FileRegion、CompositeByteBuf 和聚合写分别省掉了哪一次 copy。
5. **连接空闲后谁负责发现和处理？** 时间轮如何把定时检查变成低开销任务。

读完整册后，应当能回答“一个 TCP 字节从网卡进入，到 Handler 处理，再到响应写出，中间经过了哪些线程、缓冲区和状态机”。


## 版本快照

| 项 | 值 |
| --- | --- |
| 仓库 | `netty/netty` |
| 本地路径 | `E:\source\java\base\netty` |
| 分支 | `4.2` |
| Commit | `70040aacae241e9ba371e758f5b86e470bd77ad1`（2026-08-13） |
| 最近 tag | `netty-4.2.17.Final` |
| 构建 | Maven，多模块，Java 8+ API 兼容目标 |

> 本册所有源码坐标均基于上述 commit；4.2 已出现 `AdaptivePoolingAllocator`，不能把 4.1 的内存池结构直接当作完整事实。

## 它解决什么问题

| 原生 NIO 痛点 | Netty 的解法 |
| --- | --- |
| Selector、注册和唤醒代码重复 | `EventLoop` 统一封装 I/O 与任务队列 |
| 一个连接的状态散落在回调中 | `Channel` + `ChannelPipeline` 管理生命周期和事件传播 |
| 粘包、半包、协议状态难维护 | `ByteToMessageDecoder` 累积字节并把帧转换成消息 |
| 频繁创建堆外缓冲区导致 GC 和系统调用 | `ByteBufAllocator` 提供池化、引用计数和线程本地复用 |
| 写快慢不可见 | `ChannelOutboundBuffer` 记录 pending bytes 并触发 writability 事件 |

## 模块地图

| 模块 | 职责 | 关键类型 |
| --- | --- | --- |
| `common` | 并发工具、时间轮、引用计数基础设施 | `HashedWheelTimer`、`FastThreadLocal` |
| `transport` | Channel、Pipeline、EventLoop、Bootstrap | `AbstractChannel`、`DefaultChannelPipeline` |
| `buffer` | ByteBuf、引用计数、池化分配 | `PooledByteBufAllocator`、`AdaptivePoolingAllocator` |
| `codec-base` | 通用编解码与拆包 | `ByteToMessageDecoder`、`LengthFieldBasedFrameDecoder` |
| `handler` | 超时、流量、TLS 等可插拔 Handler | `IdleStateHandler` |

## 读码入口顺序

1. `AbstractBootstrap#initAndRegister`：看 Channel 创建、初始化、注册的边界。
2. `AbstractChannel.AbstractUnsafe#register`：看所有操作如何回到 EventLoop 线程。
3. `SingleThreadIoEventLoop#run`：看 I/O 与普通任务如何交替执行。
4. `AbstractChannelHandlerContext#fireChannelRead` / `write`：看 Pipeline 的双向责任链。
5. `AbstractNioByteChannel`：看 Socket 读事件如何产生 ByteBuf。
6. `ByteToMessageDecoder#channelRead`：看累积、解码、释放和重入保护。
7. `PooledByteBufAllocator` 与 `AdaptivePoolingAllocator`：看两代池化路径。

## 本册目录

- [整体架构](/notes/source/java/base/netty/architecture/)：分层、启动与请求两条主流程
- [Reactor 线程模型](/notes/source/java/base/netty/reactor-threading/)：EventLoop、线程归属与任务公平性
- [Pipeline 与 Handler 责任链](/notes/source/java/base/netty/pipeline-handler/)：入站/出站双向传播
- [ByteBuf 内存池](/notes/source/java/base/netty/bytebuf-pool/)：Arena/Chunk/ThreadCache 与 4.2 自适应池
- [零拷贝与 CompositeByteBuf](/notes/source/java/base/netty/zero-copy/)：FileRegion、组件拼接与写出聚合
- [时间轮与 IdleStateHandler](/notes/source/java/base/netty/timer-idle/)：定时任务和空闲检测
- [粘包拆包解码器](/notes/source/java/base/netty/framing-decoder/)：累积器、长度字段与引用计数
- [面试专题](/notes/source/java/base/netty/interview/)：高频题、高难追问和场景排查

## 横向对照

| 对象 | 对照点 |
| --- | --- |
| Redis `ae` | 都是事件循环；Redis 更偏单线程命令执行，Netty 是多 EventLoop + Pipeline |
| Tomcat NIO Endpoint | 都封装 Java NIO；Netty 把协议处理进一步拆成 Handler 链 |
| Disruptor | 都强调预分配、批处理和减少共享协调；Netty 的共享对象是 Channel/ByteBuf |

## Related

- [整体架构](/notes/source/java/base/netty/architecture/)
- [Disruptor](/notes/source/java/base/disruptor/)
- [Java 网络与基础库](/notes/source/java/base/)
