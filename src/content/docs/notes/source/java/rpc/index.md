---
title: RPC 与微服务
description: Dubbo、Nacos、Sentinel、Seata 与 XXL-JOB 等 RPC 和分布式治理项目的源码解析索引。
category: Backend
tags:
  - Source Reading
  - Java
  - RPC
order: 3
updatedDate: 2026-08-15
difficulty: advanced
status: learning
lastReviewed: 2026-08-15
draft: false
sidebar:
  order: 3
---

对应源码目录 `E:\source\java\rpc\`，共 5 个仓库，覆盖 RPC 调用、注册发现、流量治理、分布式事务和任务调度。

<!-- more -->

## 分册

| 仓库 | 主题 | 状态 |
| --- | --- | --- |
| [XXL-JOB](/notes/source/java/rpc/xxl-job/) | DB 锁调度、时间轮、执行器路由与回调闭环 | ✅ 7 篇 |
| [Dubbo](/notes/source/java/rpc/dubbo/) | SPI、服务导出与引用、集群容错、协议层 | ✅ 7 篇 |
| [Nacos](/notes/source/java/rpc/nacos/) | 注册、配置、Distro 与 Raft | ✅ 7 篇 |
| [Sentinel](/notes/source/java/rpc/sentinel/) | 滑动窗口、Slot 链、熔断与流控 | ✅ 7 篇 |
| [Seata](/notes/source/java/rpc/seata/) | AT、TCC、Saga、XA 与 TC/TM/RM 通信 | ✅ 7 篇 |

## 阅读顺序

先读 XXL-JOB 建立“共享 DB + HTTP + 后台线程”的分布式系统基线，再读 Dubbo 的 SPI 与协议抽象，最后对照 Nacos、Sentinel、Seata 的治理和一致性实现。

## Related

- [Java 源码解析索引](/notes/source/java/)
- [源码解析总览](/notes/source/)
