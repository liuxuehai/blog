---
title: 面试专题
description: Jedis 高频面试题、高难追问与源码级回答。
category: Backend
tags: [Source Reading, Jedis, Interview]
order: 59
updatedDate: 2026-08-16
sidebar:
  order: 59
---

Jedis 面试重点是连接状态、协议边界和 Cluster 重定向，而不是背命令 API。

<!-- more -->

```text
Jedis API
  └─► CommandObject
       └─► Connection
            ├─► RESP encode/decode
            ├─► pool borrow/return
            └─► Cluster slot redirect / cache push
```

## 高频题

### Jedis 是否线程安全？
**30 秒版**：旧 `Jedis` 实例持有单连接，不应被多个线程并发共享。生产环境使用连接池或统一客户端的 provider，让每次命令取得独立连接。
**展开**：`Jedis.java:87-95` 明确单连接模型，执行最终落到 `Connection#executeCommand`（`Connection.java:304-331`）。
**加分项**：Pipeline、事务、订阅还会长时间占用连接。
**常见错答**：把“对象可被多个线程访问”误说成“连接读写可并发”。

### Pipeline 和 Transaction 的区别？
**30 秒版**：Pipeline 优化往返，不保证原子性；Transaction 通过 MULTI/EXEC 提供 Redis 事务语义。
**展开**：Pipeline 走 `AbstractPipeline`，事务走 `AbstractTransaction`（`AbstractPipeline.java:5-40`、`AbstractTransaction.java:6-80`）。
**加分项**：二者都要求连接独占。
**常见错答**：说 Pipeline 自动原子。

### MOVED 与 ASK？
**30 秒版**：MOVED 表示 slot 映射已变化，客户端应刷新拓扑；ASK 是迁移窗口的一次性重定向，不应直接覆盖全局映射。
**展开**：见 `ClusterConnectionProvider.java:146-210`。
**加分项**：ASK 前需要发送 ASKING。
**常见错答**：二者都只重试原节点。

### RESP 解析如何支持多种返回值？
**30 秒版**：协议层返回原始结构，命令对象携带 `Builder<T>` 做类型转换。
**展开**：见 `Protocol.java:131-250`、`CommandObject.java:12-68`。
**加分项**：push response 需要独立分派。
**常见错答**：每个 API 自己解析字节。

## 高难追问

### 为什么连接异常后要销毁？
输入流可能已经失步，重新复用会把下一条命令的响应解释错；工厂验证失败后 destroy（`ConnectionFactory.java:162-190`）。

### Cluster 多 key 为什么要求同 slot？
命令需要在同一 Redis 节点执行，hash tag 让多个 key 使用相同 slot（`JedisClusterHashTag.java:7-34`）。

### 客户端缓存为什么依赖连接层？
失效通知是 RESP3 push，由协议读取器接收，不是普通 API 返回值（`CacheConnection.java:115-160`）。

## 场景题

### 线上池耗尽怎么查？
看 active/idle、借用超时、是否存在未 close 的 Jedis、阻塞命令和长事务；重点检查 `JedisPool` 的借还路径与调用方 try-with-resources。

### 集群偶发 CROSSSLOT 怎么查？
记录命令 key、hash tag 和 slot，确认是否存在动态 key 拼接或批处理跨节点；再核对 provider 的重试与拓扑刷新。

## 边界与踩坑

| 场景 | 风险 | 证据 |
| --- | --- | --- |
| 共享单连接 | 响应错配 | `Connection.java:304-373` |
| Pipeline 忘记 sync | 数据未读完 | `MultiNodePipelineBase.java:89-100` |
| 事务连接回池 | 状态污染 | `AbstractTransaction.java:6-80` |

## 可迁移知识

面试回答客户端时，按“命令描述 -> 资源选择 -> 协议 IO -> 异常恢复”展开，比只讲 API 更能说明系统边界。

> **面试锚点**
> - 单连接为什么不安全？
> - Pipeline 为什么不保证原子性？
> - MOVED 和 ASK 如何处理？

## Related

- [Jedis 整体架构](/notes/source/java/storage/jedis/architecture/)
- [Jedis 集群路由](/notes/source/java/storage/jedis/cluster-routing/)
