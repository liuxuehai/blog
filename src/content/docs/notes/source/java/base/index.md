---
title: 网络与基础库
description: netty、tomcat、zookeeper、caffeine、disruptor 等 9 个 Java 基础库的源码解析索引。
category: Backend
tags:
  - Source Reading
  - Java
order: 5
updatedDate: 2026-08-16
difficulty: advanced
status: learning
lastReviewed: 2026-08-16
draft: false
sidebar:
  order: 5
---

对应源码目录 `E:\source\java\base\`，共 9 个仓库。这一组是「底座」——上层的 Spring、中间件、RPC 框架大多建立在它们之上。

<!-- more -->

## 分册

| 仓库 | 主题 | 状态 |
| --- | --- | --- |
| [disruptor](/notes/source/java/base/disruptor/) | 无锁环形队列、伪共享、内存屏障、多生产者协调 | ✅ 7 篇 |
| [netty](/notes/source/java/base/netty/) | Reactor 线程模型、Pipeline、ByteBuf 内存池、零拷贝、时间轮、拆包 | ✅ 9 篇 |
| [tomcat](/notes/source/java/base/tomcat/) | Connector/Container 生命周期、类加载器隔离、NIO Endpoint、请求处理链 | ✅ 9 篇 |
| [zookeeper](/notes/source/java/base/zookeeper/) | ZAB 协议、会话管理、Watcher 一次性通知 | ✅ 7 篇 |
| [caffeine](/notes/source/java/base/caffeine/) | W-TinyLFU、Count-Min Sketch、驱逐时间轮、异步加载 | ✅ 8 篇 |
| [guava](/notes/source/java/base/guava/) | 不可变集合、Cache、EventBus、RateLimiter | ✅ 6 篇 |
| [jackson-databind](/notes/source/java/base/jackson-databind/) | 反射与泛型擦除的工业级处理、序列化器缓存 | ✅ 8 篇 |
| [fastjson2](/notes/source/java/base/fastjson2/) | 字节码生成加速、JSONReader/Writer 分派 | ✅ 8 篇 |
| [hutool](/notes/source/java/base/hutool/) | API 设计手感、模块划分与命名策略 | ✅ 8 篇 |
## 为什么从 disruptor 开始

它是这一组里代码量最小的（主源码 71 个文件），但覆盖的并发知识点密度最高：缓存行与伪共享、显式内存屏障、CAS 与 FAA 的取舍、无锁数据结构、批量摊薄同步成本。这些概念在后面读 netty 的内存池、caffeine 的驱逐算法、zookeeper 的会话桶时会反复出现。

## Related

- [Java 源码解析索引](/notes/source/java/)
- [源码解析总览](/notes/source/)
