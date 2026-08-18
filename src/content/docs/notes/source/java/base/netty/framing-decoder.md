---
title: 粘包拆包解码器
description: ByteToMessageDecoder 的累积器、重入保护、引用计数和 LengthFieldBasedFrameDecoder。
category: Backend
tags: [Source Reading, Netty, Codec, Protocol]
order: 27
updatedDate: 2026-08-15
difficulty: advanced
status: stable
lastReviewed: 2026-08-15
draft: false
sidebar:
  order: 27
---

TCP 只保证字节流，不保证消息边界。Netty 的解码器把“字节可能不完整、一次可能有多帧、输入可能重入”集中处理，业务 Handler 只接收完整消息。

<!-- more -->

## 解码链路

```text
read(ByteBuf input)
       │
       ▼
cumulator.cumulate(old, input)
       │
       ▼
callDecode(cumulation, out)
       │ 0..N frames
       ▼
fireChannelRead(frame)
       │
       └─ no readable bytes -> release cumulation
```

`ByteToMessageDecoder#channelRead` 收到 ByteBuf 后，把输入交给 cumulator，再调用 `callDecode`，最后批量传播输出；坐标为 `codec-base/src/main/java/io/netty/handler/codec/ByteToMessageDecoder.java:285-328`。累积缓冲区耗尽时会释放并置空；若长期有残留，会按 `discardAfterReads` 周期丢弃已读字节，避免 readerIndex 无限前移造成内存保留。

## 半包和多帧

解码器必须满足两个性质：

1. 输入不足时不修改到不可恢复的状态，等待下一次 `channelRead`。
2. 一次输入包含多帧时循环解码，直到剩余字节不足。

如果解码方法把输入传给下游后没有 `retain`，框架在 finally 中释放累积缓冲区时会发现引用计数错误，并抛出带有具体提示的 `IllegalReferenceCountException`，坐标为 `ByteToMessageDecoder.java:303-315`。

## 长度字段协议

```text
┌──── header ────┬──── payload ────┐
│ length field   │ length bytes    │
└────────────────┴─────────────────┘
       ^                 ^
 offset              adjustment
```

`LengthFieldBasedFrameDecoder` 在构造期校验最大帧长度、字段偏移、字段长度和 initialBytesToStrip，坐标为 `codec-base/src/main/java/io/netty/handler/codec/LengthFieldBasedFrameDecoder.java:302-329`。当长度为负数、调整后小于字段尾部或超过 maxFrameLength 时，会跳过或进入 discard 模式并抛出 `CorruptedFrameException`，坐标为 `LengthFieldBasedFrameDecoder.java:339-377`。

## 重入保护

解码过程中下游 Handler 可能同步触发新的 `channelRead`。`ByteToMessageDecoder` 在非 INIT 状态下不递归进入原解码循环，而是把输入放入 `inputMessages` 队列，坐标为 `ByteToMessageDecoder.java:330-340`。这是避免递归栈和破坏 cumulation 状态的关键。

## 为什么不在 TCP 层保证消息边界

TCP 的职责是可靠、有序的字节流；如果传输层强行理解业务消息，会失去协议通用性。Netty 把边界规则放在 Pipeline 中，长度字段、分隔符、固定长度和自定义状态机都能组合。

## 边界与踩坑

- `maxFrameLength` 是安全边界，不能用“相信对端”的方式取消；超长帧会造成内存和 CPU 消耗。
- `initialBytesToStrip`、`lengthAdjustment` 配错会导致看似随机的错位，应该用协议样本和 EmbeddedChannel 测试覆盖。
- Decoder 中不能阻塞，也不能保存未 retain 的 ByteBuf。
- 连接关闭时仍可能有残余字节，`decodeLast` 会处理最后一批输入，相关路径见 `ByteToMessageDecoder.java:406-453`。

## 可迁移知识

“累积输入 -> 尝试推进 -> 输入不足则保留状态”是所有流式解析器的通用状态机：日志、文件、串口、WebSocket 分片和自定义 RPC 都适用。安全实现必须同时限制单帧大小和累积缓冲区增长。

> 面试锚点：TCP 为什么会粘包？ByteToMessageDecoder 如何处理半包、多帧和重入？长度字段解码器如何防止恶意超长帧？

## Related

- [Pipeline 与 Handler 责任链](/notes/source/java/base/netty/pipeline-handler/)
- [ByteBuf 内存池](/notes/source/java/base/netty/bytebuf-pool/)
- [零拷贝与 CompositeByteBuf](/notes/source/java/base/netty/zero-copy/)
