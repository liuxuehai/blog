---
title: 协议与编解码
description: DubboProtocol、Exchange、HeaderExchangeHandler 和 DubboCodec 如何完成请求响应与延迟解码。
category: Backend
tags: [Source Reading, Dubbo, Protocol, Codec]
order: 25
updatedDate: 2026-08-24
difficulty: advanced
status: stable
lastReviewed: 2026-08-24
draft: false
sidebar: { order: 25 }
---

Dubbo 协议层把 RPC 语义放在 Exchange 之上，把字节格式放在 Codec 之下。这样协议实现可以复用请求响应、Future、超时和连接管理，而编码器只处理线格式和对象转换。

<!-- more -->

## 先给答案：Dubbo 协议层把 RPC 语义放在 Exchange 之上，把字节格式放在 Codec 之下

Dubbo 协议层把 RPC 语义放在 Exchange 之上，把字节格式放在 Codec 之下。这样协议实现可以复用请求响应、Future、超时和连接管理，而编码器只处理线格式和对象转换。 正文沿“协议栈 -> 服务端与客户端 -> 请求响应分派”展开：先确认入口和状态归属，再跟踪控制流或数据流的推进，最后落到对外可观察的结果。

主要失效边界集中在“半包/粘包、大消息反序列化、延迟连接首次慢”这些场景。它们破坏的是容量、顺序、并发或生命周期前提；排查时应先确认状态是否仍由正确对象持有，再核对推进条件和清理路径。

## 协议栈

```text
Invoker
  -> Protocol
  -> ExchangeClient.request / ExchangeServer
  -> HeaderExchangeHandler
  -> Transport Channel
  -> Codec2.encode/decode
  -> bytes
```

## 服务端与客户端

`DubboProtocol#export` 在 `dubbo-rpc/dubbo-rpc-dubbo/src/main/java/org/apache/dubbo/rpc/protocol/dubbo/DubboProtocol.java:346` 保存导出器并准备服务端；`openServer` 中 `Exchangers.bind` 位于 `DubboProtocol.java:426`。客户端引用入口 `refer` 在 `:445`，协议绑定引用在 `:451`，连接创建在 `:590` 或 `:591`，分别支持延迟连接和立即连接。

`Exchangers.bind` 位于 `dubbo-remoting/dubbo-remoting-api/src/main/java/org/apache/dubbo/remoting/exchange/Exchangers.java:53`，最终交给扩展的 `Exchanger#bind`；`connect` 在 `:93` 走同一抽象。这是 Exchange 与底层 Transport 的适配边界。

## 请求响应分派

`DubboProtocol` 在 `DubboProtocol.java:115` 创建 `requestHandler`，`reply` 在 `:118` 根据消息找到 Exporter 并调用服务 Invoker。`HeaderExchangeHandler#received` 位于 `dubbo-remoting/dubbo-remoting-api/src/main/java/org/apache/dubbo/remoting/exchange/support/header/HeaderExchangeHandler.java:196`，请求数据在 `:207` 分派给业务处理器，响应在 `:65` 交给 `DefaultFuture` 完成等待中的调用。

## 编解码与延迟解码

`DubboCodec` 在 `dubbo-rpc/dubbo-rpc-dubbo/src/main/java/org/apache/dubbo/rpc/protocol/dubbo/DubboCodec.java` 负责请求/响应头和主体。请求和结果对象在 `DubboCodec.java:129`、`:200` 触发 `DecodeableRpcResult#decode` 与 `DecodeableRpcInvocation#decode`，把较重的反序列化延后到明确需要的阶段。

## 关键取舍

### 为什么分离 Exchange 与 Codec

**替代方案**：每个协议实现自己处理 Future、响应关联、连接和字节编解码。**为什么不行**：协议数量增长后会复制大量请求响应状态机，且难以保证超时与异常语义一致。**证据**：`Exchangers` 只负责选择 Exchange 扩展，`DubboCodec` 只负责消息格式，`HeaderExchangeHandler` 独立完成响应关联。

## 源码坐标索引

- `DubboProtocol#export` — `dubbo-rpc/dubbo-rpc-dubbo/src/main/java/org/apache/dubbo/rpc/protocol/dubbo/DubboProtocol.java:346`
- `DubboProtocol#refer` — `dubbo-rpc/dubbo-rpc-dubbo/src/main/java/org/apache/dubbo/rpc/protocol/dubbo/DubboProtocol.java:445`
- `DubboProtocol#protocolBindingRefer` — `dubbo-rpc/dubbo-rpc-dubbo/src/main/java/org/apache/dubbo/rpc/protocol/dubbo/DubboProtocol.java:451`
- `DubboProtocol#requestHandler` — `dubbo-rpc/dubbo-rpc-dubbo/src/main/java/org/apache/dubbo/rpc/protocol/dubbo/DubboProtocol.java:115`
- `Exchangers#bind` — `dubbo-remoting/dubbo-remoting-api/src/main/java/org/apache/dubbo/remoting/exchange/Exchangers.java:53`
- `Exchangers#connect` — `dubbo-remoting/dubbo-remoting-api/src/main/java/org/apache/dubbo/remoting/exchange/Exchangers.java:93`
- `HeaderExchangeHandler#received` — `dubbo-remoting/dubbo-remoting-api/src/main/java/org/apache/dubbo/remoting/exchange/support/header/HeaderExchangeHandler.java:196`
- `DubboCodec#decode` -> `DecodeableRpcResult#decode()` — `dubbo-rpc/dubbo-rpc-dubbo/src/main/java/org/apache/dubbo/rpc/protocol/dubbo/DubboCodec.java:129`
- `DubboCodec#decode` -> `DecodeableRpcInvocation#decode()` — `dubbo-rpc/dubbo-rpc-dubbo/src/main/java/org/apache/dubbo/rpc/protocol/dubbo/DubboCodec.java:200`
- `DecodeableRpcResult#decode` — `dubbo-rpc/dubbo-rpc-dubbo/src/main/java/org/apache/dubbo/rpc/protocol/dubbo/DecodeableRpcResult.java:127`
- `DecodeableRpcInvocation#decode` — `dubbo-rpc/dubbo-rpc-dubbo/src/main/java/org/apache/dubbo/rpc/protocol/dubbo/DecodeableRpcInvocation.java:103`

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| 半包/粘包 | 解码得到不完整对象 | TCP 没有消息边界 | 使用长度字段和累计缓冲，不能按一次 read 解一条消息 |
| 大消息反序列化 | CPU、内存突增 | 主线程同步解码 | 限制 payload、选择合适序列化、观察解码线程 |
| 延迟连接首次慢 | 第一次调用超时 | `LazyConnectExchangeClient` 把连接推迟到请求时 | 关键链路预热或设置合理超时 |

## 可迁移知识

网络系统可把“业务语义、请求响应、传输、线格式”分成四层。每层只拥有自己的状态，协议升级和传输替换的影响面会显著降低。

> **面试锚点**
> - Exchange 和 Protocol 的职责区别是什么？
> - Dubbo 请求如何从字节变成服务方法调用？
> - 为什么需要延迟解码和延迟连接？

## Related

- [服务导出与引用](/notes/source/java/rpc/dubbo/service-export-reference/)
- [Netty Pipeline](/notes/source/java/base/netty/pipeline-handler/)
- [Spring Cloud Gateway 过滤器链](/notes/source/java/spring/spring-cloud-gateway/gateway-filter-chain/)
