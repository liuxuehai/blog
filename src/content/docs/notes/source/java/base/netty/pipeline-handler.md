---
title: Pipeline 与 Handler 责任链
description: ChannelPipeline 的双向链表、入站向后传播、出站向前传播和 executor 切换。
category: Backend
tags: [Source Reading, Netty, Pipeline, Design Pattern]
order: 23
updatedDate: 2026-08-19
difficulty: advanced
status: stable
lastReviewed: 2026-08-19
draft: false
sidebar:
  order: 23
---

Pipeline 把“网络事件如何经过协议层和业务层”变成一条可动态修改的双向链表。它不是普通的责任链：入站和出站方向相反，且每个 Context 可以绑定不同的 executor。

<!-- more -->

## 先给答案：Pipeline 是“按方向传播的责任链”，不是普通的 Handler 列表

入站事件从 Head 向 Tail 传播，出站操作从 Tail 向 Head 传播；每个节点既保存 Handler，又保存上下游链接和执行器上下文。方向性让“读到数据”和“写出数据”可以在同一条链上使用不同的处理顺序，而异常传播则把失败交给链上专门的处理节点。

双向链表的价值不只是插入删除快，更重要的是能从事件发生点沿正确方向寻找下一个可执行 Handler。引用计数也因此必须沿着传播路径配对：某个 Handler 负责消费、转交还是释放 ByteBuf，决定了后续节点还能不能看到数据。


## 数据结构

```text
inbound:  head ──► ctxA ──► ctxB ──► tail
                    ▲          ▲
outbound: head ◄── ctxA ◄── ctxB ◄── tail
```

`DefaultChannelPipeline` 用 `head` 和 `tail` 两个哨兵节点把用户 Handler 包起来。`pipeline.fireChannelRead` 从 head 方向寻找下一个入站节点；`pipeline.write` 从 tail 方向寻找上一个出站节点，入口可见 `transport/src/main/java/io/netty/channel/DefaultChannelPipeline.java:1023-1047`。

## 入站传播

`AbstractChannelHandlerContext#fireChannelRead` 先调用 `findContextInbound(MASK_CHANNEL_READ)`，如果目标 executor 就是当前 EventLoop，则直接按 Handler 类型分派；否则把传播任务投递到目标 executor，坐标为 `transport/src/main/java/io/netty/channel/AbstractChannelHandlerContext.java:341-367`。

```text
socket read
   │
   ▼
ctx.fireChannelRead(buf)
   │ findContextInbound
   ├─ same executor -> handler.channelRead(next, buf)
   └─ other executor -> executor.execute(task)
```

这里的 `next` 是 Context，不是 Handler。Context 保存链表位置、executor 和 pipeline 归属；Handler 保存用户逻辑。分开两者，才能让同一个 Handler 实例被多个 Channel 复用，同时保持每个 Channel 的链路状态独立。

## 出站传播

出站的 `write` 方向相反。`AbstractChannelHandlerContext#write` 根据 `flush` 选择掩码，找到前一个出站节点；同线程时直接调用 Handler，跨线程时创建 `WriteTask`，坐标为 `transport/.../AbstractChannelHandlerContext.java:780-835`。

`ChannelPipeline#write` 只是把调用交给 `tail`，真正到达 head 后由 `HeadContext.write` 调用 `Unsafe`，因此 Handler 中的 `ctx.write(msg)` 和 `channel.write(msg)` 的传播入口并不相同：前者从当前 Context 继续，后者从 tail 开始。

## 为什么使用双向链表

替代方案是入站、出站各维护一份数组。数组在稳定期遍历更快，但动态增删 Handler 需要搬移元素，而且无法自然表达“从当前 Handler 继续向某一方向传播”。双向链表的代价是节点指针和局部性较差，换来的能力是运行时安装、删除、组合 Handler。

## 异常与引用计数边界

- Handler 抛出的异常由当前 Context 调用 `invokeExceptionCaught`；如果链上没有处理器，最终会到 tail 的默认行为。
- 入站 ByteBuf 传给下一个 Handler 后，当前 Handler 不应再释放，除非明确 `retain` 后保留引用。
- `SimpleChannelInboundHandler` 会在 `channelRead` 返回后自动释放匹配类型的消息，不能把消息异步保存而不 `retain`。
- 一个 Handler 是否 `@Sharable` 只说明实例是否允许跨 Channel 复用，不代表其业务字段天然线程安全。

## 可迁移知识

Pipeline 是“方向化责任链 + 上下文对象”的组合。日志过滤器、编译器 pass、HTTP middleware 和 RPC 拦截器都可以复用这个思想：把节点位置、执行器和生命周期从业务处理器中分离出来。

> 面试锚点：为什么入站从 head 到 tail、出站从 tail 到 head？`ctx.write` 与 `channel.write` 有什么差异？

## Related

- [整体架构](/notes/source/java/base/netty/architecture/)
- [Reactor 线程模型](/notes/source/java/base/netty/reactor-threading/)
- [粘包拆包解码器](/notes/source/java/base/netty/framing-decoder/)
