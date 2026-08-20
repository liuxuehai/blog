---
title: Cluster 路由与重试
description: ClusterConnectionProvider 如何计算 slot、选择节点、处理 MOVED/ASK 并维护拓扑。
category: Backend
tags: [Source Reading, Jedis, Redis Cluster]
order: 56
updatedDate: 2026-08-20
sidebar:
  order: 56
---

Cluster 客户端的难点不是发命令，而是先回答“命令应该发到哪个节点”，并在拓扑变化时快速修正答案。

<!-- more -->

## 先给答案：MOVED 是拓扑更新，ASK 是本次请求的临时指引

客户端先根据 slot 缓存选择节点。节点返回 MOVED，表示 slot 的权威归属已经改变，客户端应刷新或修正拓扑后再发起请求；返回 ASK，表示迁移期间本次请求应先发送 ASKING，再把命令交给目标节点，但不能因此立即把全局映射改掉。

所以集群故障要区分映射过期、迁移中的临时路由、跨 slot 命令和连接断开。统一增加重试可能把一个已经执行但响应丢失的命令再次执行，写操作必须有幂等设计。

```text
key(s)
  └─► CRC16/hash tag ─► slot 0..16383
                         └─► node connection
                              ├─ MOVED: refresh slot map
                              └─ ASK: one-shot redirected command
```

`JedisClusterCRC16` 计算 slot，`JedisClusterHashTag` 提取 `{...}` 中的 hash tag；命令参数中的 key 标记使 provider 可以在发送前完成路由：见 `JedisClusterCRC16.java:8-40`、`JedisClusterHashTag.java:7-34`、`CommandArguments.java:100-180`、`ClusterCommandObjects.java:21-40`。

`ClusterConnectionProvider` 保存节点与 slot 映射，按 slot 取得连接；收到 MOVED 后刷新映射，收到 ASK 时只对当前命令执行临时重定向：见 `ClusterConnectionProvider.java:22-70`、`ClusterConnectionProvider.java:90-145`、`ClusterConnectionProvider.java:146-210`、`JedisCluster.java:30-105`。

## 为什么 ASK 不能直接改全局映射

**替代方案**：遇到 ASK 就把 slot 永久指向目标节点。
**为什么不行**：ASK 常发生在迁移窗口，目标节点只对当前请求负责，迁移未完成前全局映射仍可能应指向源节点。
**证据**：Cluster provider 对 MOVED 和 ASK 分开处理；ASK 需要发送 `ASKING` 后再发原命令。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| 多 key 不同 slot | CROSSSLOT | Redis Cluster 不支持跨 slot 原子命令 | hash tag 或拆命令 |
| 节点重启 | 首次请求失败后恢复 | 本地拓扑过期 | 设置合理 maxAttempts |
| 未标识 key | 发到错误节点 | provider 无法计算 slot | 使用命令对象 key 元数据 |

## 可迁移知识

分布式客户端应把“静态路由缓存”和“服务端重定向”结合：缓存保证常态低延迟，重定向保证拓扑变化时最终收敛。

> **面试锚点**
> - MOVED 与 ASK 有什么区别？
> - Redis Cluster 为什么是 16384 个 slot？
> - hash tag 解决了什么问题？

## Related

- [Jedis 整体架构](/notes/source/java/storage/jedis/architecture/)
- [Redis 集群与复制](/notes/source/redis/redis/)
