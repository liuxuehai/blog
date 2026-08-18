---
title: 整体架构
description: Netty 4.2 的 Channel、EventLoop、Pipeline 和 ByteBuf 分层，以及启动与请求处理主流程。
category: Backend
tags: [Source Reading, Netty, Architecture]
order: 21
updatedDate: 2026-08-15
difficulty: advanced
status: stable
lastReviewed: 2026-08-15
draft: false
sidebar:
  order: 21
---

Netty 的核心不是“把 Selector 包了一层”，而是把线程归属、事件传播、内存所有权和异步结果统一到 Channel 这条对象链上。

<!-- more -->

## 分层

```text
Bootstrap
  └─ Channel
      ├─ EventLoop / IoHandler       I/O 与任务执行
      ├─ Pipeline                    入站向后、出站向前
      │   └─ HandlerContext -> Handler
      ├─ Unsafe                      将抽象操作落到传输实现
      └─ ByteBuf / FileRegion         数据与所有权
```

```text
外部线程: bind/register/write
             │ execute(task)
             ▼
EventLoop  ── runIo() ── fireChannelRead(ByteBuf)
    │                         │
    └─ runAllTasks() ◄────────┘
             │
             ▼
      Pipeline Handler 链
```

## 核心抽象

| 抽象 | 责任 | 源码坐标 |
| --- | --- | --- |
| `Channel` | 连接、地址、配置、异步操作入口 | `transport/.../Channel.java:76` |
| `EventLoop` | 一个 I/O 执行上下文，负责注册和任务 | `transport/.../SingleThreadIoEventLoop.java:192` |
| `ChannelPipeline` | 组织入站/出站事件传播 | `transport/.../DefaultChannelPipeline.java:1030` |
| `Unsafe` | 只供框架内部把抽象操作落地 | `transport/.../AbstractChannel.java:324` |
| `ByteBuf` | reader/writer index、容量、引用计数 | `buffer/.../AbstractByteBuf.java:1` |

## 主流程一：启动与 bind

```text
ServerBootstrap.bind
   │
   ├─ channelFactory.newChannel()
   ├─ init(channel)
   ├─ group.register(channel)
   │      └─ EventLoop.execute(register0)
   └─ EventLoop.execute(channel.bind(localAddress))
```

1. `AbstractBootstrap#initAndRegister` 创建 Channel、调用 `init`，再执行 `config().group().register(channel)`，坐标为 `transport/src/main/java/io/netty/bootstrap/AbstractBootstrap.java:324-340`。
2. `AbstractChannel.AbstractUnsafe#register` 检查 EventLoop 兼容性；调用线程不是 EventLoop 时，把 `register0` 投递到 EventLoop，坐标为 `transport/src/main/java/io/netty/channel/AbstractChannel.java:324-363`。
3. 注册成功后，`register0` 先执行 `pipeline.invokeHandlerAddedIfNeeded()`，再触发 `channelRegistered` 和首次 `channelActive`，坐标为 `AbstractChannel.java:366-390`。
4. `AbstractBootstrap#doBind` 不直接在调用线程 bind，而是把 `channel.bind` 投递到同一个 EventLoop，坐标为 `AbstractBootstrap.java:291-320` 与 `371-386`。

### 为什么注册和 bind 必须绑定同一线程

替代方案是让调用线程直接操作底层 `SelectableChannel`。这会让 Handler 安装、注册状态、bind 和事件通知出现竞态。Netty 的注释明确说明：注册、bind、connect 都绑定到同一线程，因此即使注册任务尚未执行，后续 bind 任务也会排在它之后执行，见 `AbstractBootstrap.java:349-356`。

## 主流程二：请求处理

```text
Selector / epoll ready
        │
        ▼
AbstractNioByteChannel.read
        │ alloc ByteBuf + read
        ▼
pipeline.fireChannelRead(buf)
        │ find next inbound context
        ▼
decoder -> business handler -> tail
        │
        └─ write(response) -> outbound handlers -> head -> Unsafe
```

`AbstractNioByteChannel` 在读异常时仍会先把可读 ByteBuf 传播给 Pipeline，再触发 `readComplete` 和异常，见 `transport/.../AbstractNioByteChannel.java:116-140`。这体现了 Netty 的资源原则：异常路径同样必须处理已经成功读取的数据。

出站从 `DefaultChannelPipeline#write` 的 `tail.write` 开始，向前寻找出站 Handler；`AbstractChannelHandlerContext#write` 根据 executor 是否属于当前线程决定直接调用还是创建 `WriteTask`，见 `transport/.../AbstractChannelHandlerContext.java:780-835`。

## 扩展点全景

| 扩展点 | 接口/基类 | 触发时机 | 典型用途 |
| --- | --- | --- | --- |
| 传输实现 | `AbstractChannel` | 注册、读写、bind | NIO、epoll、kqueue |
| I/O 驱动 | `IoHandler` | EventLoop 初始化与 `runIo` | Selector 或 native poller |
| 入站处理 | `ChannelInboundHandler` | read、active、exception | 解码、鉴权、业务 |
| 出站处理 | `ChannelOutboundHandler` | write、flush、close | 编码、限流、TLS |
| 分配器 | `ByteBufAllocator` | 创建 ByteBuf | 池化、堆外、泄漏检测 |

## 边界与踩坑

- Handler 中的阻塞调用会占住 EventLoop；应使用独立业务线程池，并通过 `ctx.executor()` 或显式 executor 回到正确线程。
- `Channel` 的线程安全不等于 Handler 业务状态安全；跨线程修改业务字段仍需同步。
- bind 失败时 `doBind0` 使用 `CLOSE_ON_FAILURE`，只记录 Future 不处理失败会造成资源泄漏或假启动。

## 可迁移知识

“对象归属线程 + 任务队列串行化”可以用于 WebSocket 会话、Actor、GUI 事件线程和分片状态机。关键不是线程少，而是让同一份可变状态拥有稳定的执行者。

> 面试锚点：Netty 如何保证注册和 bind 的顺序？为什么 Pipeline 能免锁？

## Related

- [Reactor 线程模型](/notes/source/java/base/netty/reactor-threading/)
- [Pipeline 与 Handler 责任链](/notes/source/java/base/netty/pipeline-handler/)
- [粘包拆包解码器](/notes/source/java/base/netty/framing-decoder/)
