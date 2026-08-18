---
title: NIO Endpoint 与线程模型
description: NioEndpoint 的监听、Selector、SocketProcessor 与协议处理线程模型。
category: Backend
tags: [Source Reading, Tomcat, NIO]
order: 33
updatedDate: 2026-08-15
difficulty: advanced
status: stable
lastReviewed: 2026-08-15
draft: false
sidebar: { order: 33 }
---

Tomcat 的 NIO 层把等待就绪事件和执行协议处理分开：Selector 发现事件，SocketProcessor 执行协议处理。

<!-- more -->

```text
Acceptor -> accept -> Selector -> processKey(read/write)
                              -> SocketProcessor -> ProtocolHandler
```

`NioEndpoint#startInternal` 位于 `java/org/apache/tomcat/util/net/NioEndpoint.java:514`；Selector 事件在 `:997` 和 `:1129` 处理，最终 Handler 在 `:2201` 进入协议层。

## 为什么不用一个线程处理全部工作

**替代方案**：每连接一个线程，或 Selector 线程直接执行 Servlet。
**为什么不行**：前者线程数和切换成本不可控，后者慢请求会阻塞新连接和其他连接的事件分发。Endpoint 解耦 readiness 与 processing，代价是任务排队和状态同步。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| Selector 空转 | CPU 高 | key 未正确移除或异常唤醒 | 检查 SelectionKey 生命周期 |
| Worker 饥饿 | 大量超时 | Servlet 阻塞线程池 | 隔离阻塞任务 |
| 写事件持续触发 | CPU 高 | 未写完数据仍注册 OP_WRITE | 仅 pending output 时注册 |
| 半关闭 | 状态异常 | 读写方向独立关闭 | 按 SocketState 清理 |

## 可迁移知识

Reactor 的重点是把就绪检测、连接状态和业务执行分层，适用于代理服务器、消息客户端和数据库网络层。

> **面试锚点**
> - Acceptor、Poller、Worker 分别做什么？
> - 为什么不能在 Selector 线程执行 Servlet？
> - OP_WRITE 为什么不能永久注册？

## Related

- [HTTP 请求处理链](/notes/source/java/base/tomcat/request-pipeline/)
- [Netty Reactor 线程模型](/notes/source/java/base/netty/reactor-threading/)