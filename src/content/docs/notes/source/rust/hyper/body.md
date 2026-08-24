---
title: Body 与背压
description: http-body Frame 协议、Incoming 多来源实现、size hint、channel 与消费驱动的背压。
category: Backend
tags: [Source Reading, Hyper, Body, Backpressure]
order: 33
updatedDate: 2026-08-24
difficulty: advanced
status: stable
lastReviewed: 2026-08-24
draft: false
sidebar:
  order: 33
---

HTTP body 不是必然存在的一块 `Vec<u8>`，而是异步产生的 frame 序列。Hyper 使用 `http_body::Body` 统一 HTTP/1、HTTP/2、channel 和空 body。

<!-- more -->

## 先给答案：HTTP body 不是必然存在的一块 Vec<u8，而是异步产生的 frame 序列

HTTP body 不是必然存在的一块 Vec<u8，而是异步产生的 frame 序列。Hyper 使用 httpbody::Body 统一 HTTP/1、HTTP/2、channel 和空 body。 正文沿“Frame 模型 -> Incoming::pollframe -> 发送侧 channel”展开：先确认入口和状态归属，再跟踪控制流或数据流的推进，最后落到对外可观察的结果。

主要失效边界集中在“collect 超大 body、自定义 sizehint 错误、忽略 trailer”这些场景。它们破坏的是容量、顺序、并发或生命周期前提；排查时应先确认状态是否仍由正确对象持有，再核对推进条件和清理路径。

## Frame 模型

```text
Body::poll_frame
  -> Pending
  -> Some(Ok(Frame::data(Bytes)))
  -> Some(Ok(Frame::trailers(HeaderMap)))
  -> Some(Err(error))
  -> None (end stream)
```

Hyper 在 `src/body/mod.rs:68` 重导出 `http_body::Body`，接收侧类型 `Incoming` 定义于 `src/body/incoming.rs:52-58`。其内部 `Kind` 包含空、channel、HTTP/2 等来源（`incoming.rs:56-87`），`Body for Incoming` 实现在 `incoming.rs:186-282`。

## `Incoming::poll_frame`

- channel 分支从 data receiver 取 Bytes，并在结束后读取 trailer；
- h2 分支从 `RecvStream` 取 data，释放 flow-control capacity，再读取 trailer；
- empty 分支立即结束。

具体分派见 `incoming.rs:190-275`。`is_end_stream` 与 `size_hint` 位于 `incoming.rs:278-322`，用于优化但不能替代真实 EOF。

## 发送侧 channel

内部 `Sender` 在 `incoming.rs:334` 附近，`poll_ready` 位于 `:359-374`，异步 `ready` 在 `:378-384`。Sender 必须等待接收侧产生需求，注释在 `incoming.rs:118-124` 明确说明 wanter 参与唤醒，避免无界推送。

### 为什么 Body 是 pull-based

**替代方案**：生产者主动把所有 chunk push 到无界 channel。

**为什么不行**：当 socket 或对端变慢时，内存会无限增长，HTTP/2 flow control 也无法自然传回业务生产者。

**证据**：`Body::poll_frame` 由协议层按写入能力拉取，内部 Sender 的 `poll_ready` 又等待消费者需求（`incoming.rs:359-384`），形成端到端背压。

## 长度语义

`SizeHint` 只声明 lower/upper bound；协议编码仍要依据 method、status、Content-Length、Transfer-Encoding 和版本决定 framing。错误的精确长度可能让 HTTP/1 接收方把后续响应字节误当 body，因此自定义 Body 必须保证 hint 与实际一致。

## 丢弃 Body 的含义

drop response body 并不保证底层连接可复用。HTTP/1 若尚未读到边界，常需要关闭连接；HTTP/2 可以 reset 单个 stream，但也要维护连接级流控。高层 client 应明确 drain、cancel 或 close 策略。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| collect 超大 body | 内存暴涨 | 流式数据被聚合 | 设置上限或逐 frame 处理 |
| 自定义 size_hint 错误 | 截断/协议错位 | framing 与真实字节数不符 | 不确定时只给 lower bound |
| 忽略 trailer | 校验信息丢失 | trailer 是独立 Frame | 消费到 stream 结束 |
| 生产者不等 ready | 缓冲堆积或错误 | 破坏背压协议 | poll/send 前等待 capacity |

## 可迁移知识

流式接口应把“数据、尾部元数据、错误、结束”建模为显式事件，并由消费者拉取。这样背压可以沿网络、协议、框架一直传到业务生产者。

> **面试锚点**
> - Body 为什么是 frame stream 而不是 AsyncRead？
> - `size_hint` 能否决定消息边界？
> - 不消费 body 会怎样？

## Related

- [HTTP/1 状态机](/notes/source/rust/hyper/http1-state-machine/)
- [HTTP/2 与 h2](/notes/source/rust/hyper/http2/)
- [Axum Extractor 类型级管线](/notes/source/rust/axum/extractors/)
