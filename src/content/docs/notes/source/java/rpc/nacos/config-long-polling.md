---
title: 配置长轮询与推送
description: Nacos 配置变更如何通过 MD5 比较、异步 Servlet、事件通知和客户端缓存传播。
category: Backend
tags: [Source Reading, Nacos, Configuration, Long Polling]
order: 33
updatedDate: 2026-08-16
difficulty: advanced
status: stable
lastReviewed: 2026-08-16
draft: false
sidebar: { order: 33 }
---

配置中心的关键不是“提供一个 GET 接口”，而是让大量客户端在没有变更时低成本等待，在发生变更时快速唤醒。Nacos 用 MD5 快照、异步请求和事件通知组合出这条路径。

<!-- more -->

## 请求闭环

```text
ClientWorker cacheMap[groupKey -> CacheData]
  -> listen request + client MD5
  -> LongPollingService#addLongPollingClient
  -> MD5 compare
       ├─ changed -> immediate response
       └─ same    -> AsyncContext + ClientLongPolling
                         ▲
LocalDataChangeEvent ────┘
  -> DataChangeTask -> response -> listener callback
```

## 实现拆解

服务端先调用 `MD5Util.compareMd5`，如果发现变化立即返回；没有变化时使用 `AsyncContext` 挂起请求，并把轮询对象交给 `ConfigExecutor`。超时时间会预留提前返回窗口，避免客户端和服务端同时超时。

配置落盘或内存状态变化后，`NotifyCenter` 发布 `LocalDataChangeEvent`，订阅者提交 `DataChangeTask`，只唤醒匹配 group key 的等待请求。客户端 `ClientWorker` 将内容写入 `CacheData`，再在监听器线程中回调业务。

## 为什么不采用固定间隔轮询

**替代方案**：客户端每隔几秒执行一次普通查询。
**为什么不行**：无变更请求占用大量连接和 CPU，变更传播延迟又被轮询周期直接限制。
**证据**：`addLongPollingClient` 在 MD5 未变化时挂起异步请求；`LocalDataChangeEvent` 触发精准唤醒，形成“无变化少计算、有变化快通知”。

## 源码坐标索引

- `LongPollingService#getSubscribleInfo` — `config/src/main/java/com/alibaba/nacos/config/server/service/LongPollingService.java:74`
- `LongPollingService#mergeSampleResult` — `config/src/main/java/com/alibaba/nacos/config/server/service/LongPollingService.java:111`
- `LongPollingService#addLongPollingClient` — `config/src/main/java/com/alibaba/nacos/config/server/service/LongPollingService.java:177`
- `LongPollingService#checkLimit` — `config/src/main/java/com/alibaba/nacos/config/server/service/LongPollingService.java:221`
- `LongPollingService#isSupportLongPolling` — `config/src/main/java/com/alibaba/nacos/config/server/service/LongPollingService.java:234`
- `NotifyCenter#registerSubscriber` — `config/src/main/java/com/alibaba/nacos/config/server/service/LongPollingService.java:251`
- `ClientWorker#addListeners` — `client/src/main/java/com/alibaba/nacos/client/config/impl/ClientWorker.java:151`
- `ClientWorker#addTenantListeners` — `client/src/main/java/com/alibaba/nacos/client/config/impl/ClientWorker.java:174`
- `ClientWorker$ConfigRpcTransportClient#notifyListenConfig` — `client/src/main/java/com/alibaba/nacos/client/config/impl/ClientWorker.java:926`
- `ConfigExecutor#executeLongPolling` — `config/src/main/java/com/alibaba/nacos/config/server/utils/ConfigExecutor.java:130`
- `MD5Util#compareMd5` — `config/src/main/java/com/alibaba/nacos/config/server/utils/MD5Util.java:52`

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| 代理层超时 | 客户端频繁重连 | 网关 idle timeout 小于轮询窗口 | 统一代理、服务端和客户端超时 |
| 监听器阻塞 | 配置回调堆积 | 业务回调占用通知线程 | 回调中只做轻量更新，重活异步化 |
| 大量 group key | 内存和比较 CPU 上升 | 每个客户端维护缓存与 MD5 | 分组监听、限制单客户端订阅规模 |

## 可迁移知识

长轮询是“拉模型连接保持”和“推模型事件唤醒”的折中。它适合穿越代理、兼容 HTTP 且变更频率中等的控制面；更高实时性可切换到长连接推送，但仍应保留版本校验和重连补偿。

> **面试锚点**
> - 长轮询和普通轮询的区别是什么？
> - Nacos 如何避免配置变更通知丢失？
> - 客户端本地 `CacheData` 为什么不能只存内容？

## Related

- [整体架构](/notes/source/java/rpc/nacos/architecture/)
- [JRaft 与持久化一致性](/notes/source/java/rpc/nacos/raft-persistence/)
- [Spring Cloud Alibaba Nacos 配置加载](/notes/source/java/spring/spring-cloud-alibaba/nacos-config/)
