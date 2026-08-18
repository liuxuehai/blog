---
title: Distro 与 AP 同步
description: Nacos 临时实例如何通过分片、延迟任务、同步、校验和快照加载实现最终收敛。
category: Backend
tags: [Source Reading, Nacos, Distro, AP]
order: 32
updatedDate: 2026-08-16
difficulty: advanced
status: stable
lastReviewed: 2026-08-16
draft: false
sidebar: { order: 32 }
---

Distro 是 Nacos 为临时实例设计的 AP 同步协议。它不复制所有数据到所有节点，而是按责任节点分片，再通过延迟同步和周期校验修复丢失或过期数据。

<!-- more -->

## 数据流

```text
本地实例变化
  -> DistroKey(resource, type)
  -> DistroProtocol#sync
  -> DelayTaskExecuteEngine
  -> 目标节点 RPC
  -> DistroDataProcessor#processData
  -> 本地 ServiceManager / 快照
                 ▲
                 └── verify / query / snapshot 修复
```

## 实现拆解

`DistroProtocol#sync` 遍历除本机外的成员，`syncToTarget` 将目标地址写入 `DistroKey` 并放入延迟任务引擎。延迟不是简单 sleep，而是把同一资源的连续修改合并到可调度任务中，降低心跳风暴。

接收端通过资源类型找到 `DistroDataProcessor`。Naming 的 `DistroClientDataProcessor#processData` 负责应用数据，`processVerifyData` 处理校验请求；数据存储则由 `DistroDataStorage` 提供查询和全量快照。

## 为什么使用责任分片而不是全量广播

**替代方案**：每次实例变化都广播给所有节点。
**为什么不行**：节点数和实例数增长时，写放大接近 `O(nodes * changes)`，心跳会成为集群主要流量。
**证据**：`DistroMapper#responsible` 判断责任归属，`DistroProtocol#syncToTarget` 只对指定目标排队；周期校验再补足异常路径。

## 源码坐标索引

- `DistroProtocol#startDistroTask` — `core/src/main/java/com/alibaba/nacos/core/distributed/distro/DistroProtocol.java:60`
- `DistroProtocol#startLoadTask` — `core/src/main/java/com/alibaba/nacos/core/distributed/distro/DistroProtocol.java:72`
- `DistroProtocol#startVerifyTask` — `core/src/main/java/com/alibaba/nacos/core/distributed/distro/DistroProtocol.java:88`
- `DistroProtocol#sync` — `core/src/main/java/com/alibaba/nacos/core/distributed/distro/DistroProtocol.java:106`
- `DistroProtocol#syncToTarget` — `core/src/main/java/com/alibaba/nacos/core/distributed/distro/DistroProtocol.java:117`
- `DistroProtocol#onReceive` — `core/src/main/java/com/alibaba/nacos/core/distributed/distro/DistroProtocol.java:150`
- `DistroProtocol#onVerify` — `core/src/main/java/com/alibaba/nacos/core/distributed/distro/DistroProtocol.java:170`
- `DistroProtocol#onQuery` — `core/src/main/java/com/alibaba/nacos/core/distributed/distro/DistroProtocol.java:190`
- `DistroProtocol#onSnapshot` — `core/src/main/java/com/alibaba/nacos/core/distributed/distro/DistroProtocol.java:207`
- `DistroMapper#responsible` — `naming/src/main/java/com/alibaba/nacos/naming/core/DistroMapper.java:78`
- `DistroClientDataProcessor#processData` — `naming/src/main/java/com/alibaba/nacos/naming/consistency/ephemeral/distro/v2/DistroClientDataProcessor.java:149`
- `DistroClientDataProcessor#processVerifyData` — `naming/src/main/java/com/alibaba/nacos/naming/consistency/ephemeral/distro/v2/DistroClientDataProcessor.java:249`

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| 节点重启 | 本地临时实例为空 | 临时状态可由客户端重新注册 | 客户端启用重连和重新注册 |
| 同一资源连续更新 | 目标节点延迟看到中间版本 | 延迟任务可能合并更新 | 以最终版本和校验结果为准 |
| 成员变化 | 责任节点发生迁移 | 哈希映射依赖成员列表 | 等待加载完成并观察 Distro 初始化状态 |

## 可迁移知识

责任分片加周期校验适合缓存、租约和可重建状态。核心是接受短暂不一致，用低成本 repair loop 把异常收敛，而不是为所有写入支付同步共识成本。

> **面试锚点**
> - Distro 为什么适合临时实例？
> - 延迟同步任务解决了什么问题？
> - 校验和全量快照分别承担什么职责？

## Related

- [整体架构](/notes/source/java/rpc/nacos/architecture/)
- [注册发现与客户端订阅](/notes/source/java/rpc/nacos/naming-discovery/)
- [JRaft 与持久化一致性](/notes/source/java/rpc/nacos/raft-persistence/)
