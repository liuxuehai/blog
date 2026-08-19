---
title: 零拷贝与 CompositeByteBuf
description: Netty 的 FileRegion、CompositeByteBuf、写出聚合和零拷贝边界。
category: Backend
tags: [Source Reading, Netty, Zero Copy, ByteBuf]
order: 25
updatedDate: 2026-08-19
difficulty: advanced
status: stable
lastReviewed: 2026-08-19
draft: false
sidebar:
  order: 25
---

Netty 里的“零拷贝”不是一种单一技术：`FileRegion` 依赖操作系统的 `transferTo`，`CompositeByteBuf` 避免把多个 ByteBuf 合并成一块连续内存，切片和 duplicate 则避免复制底层字节。

<!-- more -->

## 先给答案：零拷贝不是“完全不复制”，而是减少不必要的数据搬运和用户态往返

文件发送、多个 ByteBuf 聚合和写缓冲优化，省掉的 copy 次数并不相同：FileRegion 可能让文件内容直接进入内核发送路径；CompositeByteBuf 让多个逻辑片段共享视图；聚合写则减少 syscall 或 flush 次数。

所以零拷贝的收益取决于数据来源、传输协议和下游 Handler 是否需要修改内容。如果业务必须逐字节解压、加密或重排，数据仍要进入用户态；如果组合对象跨线程传递，还要同时管理每个组成 buffer 的引用计数。正确问题不是“有没有 zero-copy”，而是“这条路径上哪一次复制最贵，能否安全省掉”。


## 三种路径

```text
文件 -> FileChannel.transferTo -> SocketChannel     (内核侧搬运)
buf1 ┐
buf2 ├-> CompositeByteBuf -> gather write           (逻辑拼接)
buf3 ┘
buf.slice / duplicate -> 共享底层 memory           (视图)
```

## FileRegion

`DefaultFileRegion#transferTo` 校验 position 和引用计数后，调用 `FileChannel.transferTo`，坐标为 `transport/src/main/java/io/netty/channel/DefaultFileRegion.java:114-140`。它不把文件内容先读入 JVM ByteBuf，因此适合静态文件、日志段和大对象发送。

但 `transferTo` 的返回值可能为 0，Netty 会进一步校验文件是否被截断；Linux、文件系统和大于 2GB 的边界都可能影响系统调用，`FileRegion` 的类注释列出了这些兼容性问题。

## CompositeByteBuf

`CompositeByteBuf#addComponent` 把组件包装进 Component，更新偏移并可选地推进 writerIndex，坐标为 `buffer/src/main/java/io/netty/buffer/CompositeByteBuf.java:263-310`。它维护的是“多个组件的逻辑地址空间”，不是把数据复制到一个新数组。

```text
component 0: [HTTP headers]
component 1: [body part A]
component 2: [body part B]
logical index: 0 ------------------------------ N
```

当组件数超过配置阈值时，Composite 可能 consolidate，重新产生连续内存。也就是说，零拷贝是策略而非绝对保证。

## 写出聚合

`ChannelOutboundBuffer#addMessage` 把待写消息挂入链表并累计 pending bytes；`addFlush` 把 unflushed 区间整体标记为 flushed，坐标为 `transport/src/main/java/io/netty/channel/ChannelOutboundBuffer.java:110-169`。底层传输可以把多个 ByteBuf 转成多个 NIO Buffer，使用 gathering write，避免每条消息都单独系统调用。

## 为什么不总是 copy

替代方案是每次把碎片拷贝成一块连续 ByteBuf。copy 的局部性好、读取简单，但会增加内存带宽和延迟；Composite 的代价是组件索引查找、组件数量增长和释放责任复杂。短消息、组件数少时组合更划算；组件很多或反复随机访问时 consolidate 可能更好。

## 边界与踩坑

- `FileRegion` 仍是引用计数对象，写失败和 Channel 关闭时必须释放。
- `CompositeByteBuf` 转移组件所有权，调用方不能在转移后再次无条件 release。
- `slice` 与 `duplicate` 共享底层内存，原始缓冲区释放后视图不可继续使用。
- 零拷贝减少的是复制，不等于减少所有系统调用、校验、TLS 加密或协议解析成本；TLS 通常会迫使数据经过用户态处理。

## 可迁移知识

“逻辑拼接延迟物理合并”适合日志分段、批量写、文件分片和消息聚合。必须建立组件数上限和退化策略，否则零拷贝结构会因元数据膨胀反而变慢。

> 面试锚点：FileRegion 和 CompositeByteBuf 的零拷贝分别发生在哪里？为什么 Composite 最终仍可能 copy？

## Related

- [ByteBuf 内存池](/notes/source/java/base/netty/bytebuf-pool/)
- [粘包拆包解码器](/notes/source/java/base/netty/framing-decoder/)
- [Pipeline 与 Handler 责任链](/notes/source/java/base/netty/pipeline-handler/)
