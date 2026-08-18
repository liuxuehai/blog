---
title: 整体架构
description: Jedis 从命令对象到连接提供者、协议编解码和集群路由的完整调用链。
category: Backend
tags: [Source Reading, Jedis, Architecture]
order: 51
updatedDate: 2026-08-16
sidebar:
  order: 51
---

Jedis 的架构核心不是“每个 Redis 命令一个方法”，而是把 API、命令描述、连接资源和传输协议分层，使单机、池化和 Cluster 复用同一条执行管线。

<!-- more -->

## 分层

```text
Jedis / UnifiedJedis
        │ commandObjects + Builder
        ▼
CommandObject<T> / CommandArguments
        │ executeCommand
        ▼
ConnectionProvider ──► Connection
        │                 │
        │                 ├─ Protocol.sendCommand
        │                 └─ Protocol.process
        ▼
standalone / pool / cluster / cache connection
```

| 层 | 责任 | 源码坐标 |
| --- | --- | --- |
| API | 暴露 Redis 命令和生命周期方法 | `UnifiedJedis.java:48-119` |
| 描述 | 保存参数、key、返回值 builder 和 hook | `CommandObject.java:12-68` |
| 连接 | 管理 Socket、认证、超时、读写 | `Connection.java:33-120` |
| 协议 | 编码 RESP 请求、解析响应和错误 | `Protocol.java:20-170` |
| 资源 | 池化、Cluster provider、客户端缓存 | `ConnectionFactory.java:22-109` |

## 主流程一：单机命令

```text
caller
  └─► UnifiedJedis#get
       └─► CommandObjects#get
            └─► executeCommand(CommandObject)
                 └─► provider.getConnection()
                      └─► Connection#executeCommand
                           ├─► Protocol#sendCommand
                           └─► Protocol#process
```

`UnifiedJedis` 负责把公共方法统一收敛到 `CommandObject`，而不是让每个 API 直接拼字节。`Connection#executeCommand` 在发送前执行 hook，再把参数交给 `Protocol`，因此认证、HIMPORT 准备动作和自定义 key 处理可以插在命令执行前。

关键坐标：`UnifiedJedis.java:6136-6146`、`Connection.java:304-331`、`Connection.java:356-373`、`Protocol.java:72-84`、`Protocol.java:131-170`、`CommandArguments.java:14-69`、`CommandObject.java:18-66`、`BuilderFactory.java:1-120`。

## 主流程二：集群命令

```text
command key
   │ hash slot
   ▼
ClusterConnectionProvider
   ├─► known node connection
   ├─► MOVED/ASK update or retry
   └─► multi-node pipeline aggregation
```

`JedisCluster` 只是统一客户端的 Cluster 入口，真正的连接选择由 `ClusterConnectionProvider` 负责。多节点 Pipeline 维护 node 到 connection 的映射，执行结束统一关闭，避免每条命令都重复建连。

关键坐标：`JedisCluster.java:30-105`、`ClusterConnectionProvider.java:22-70`、`ClusterConnectionProvider.java:120-185`、`ClusterPipeline.java:62-101`、`MultiNodePipelineBase.java:33-100`、`JedisClusterCRC16.java:8-40`、`JedisClusterHashTag.java:7-34`、`ClusterCommandObjects.java:21-40`。

## 扩展点

| 扩展点 | 接口/类 | 触发时机 | 用途 |
| --- | --- | --- | --- |
| 连接构造 | `Connection.Builder` | 创建连接前 | TLS、缓存连接、认证配置 |
| 返回值转换 | `Builder<T>` | 收到 RESP 后 | 把原始对象转成领域类型 |
| 命令 hook | `CommandObject#withPreProcessHook` | 写命令前 | 延迟准备、连接级状态初始化 |
| Provider | `ConnectionProvider` | 取连接时 | 单机、池、Cluster、多 DB |
| 缓存 | `CacheConnection` | 命令前后 | RESP3 client-side caching |

## 关键取舍

### 为什么用 CommandObject 而不是在 API 方法里直接写字节

**替代方案**：每个 `Jedis#get/set` 方法直接调用 `sendCommand`。
**为什么不行**：Cluster 需要 key 路由，返回值需要 builder，部分命令需要 hook；逻辑散落后不同 API 会产生不一致。
**证据**：`CommandObject` 同时持有 `CommandArguments`、`Builder<T>` 和前置 hook，`Connection#executeCommand(CommandObject)` 统一执行它们。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| 多线程共享 `Jedis` | 响应串线或状态污染 | 单个 `Jedis` 持有单连接 | 使用池或 `UnifiedJedis` provider |
| Cluster 多 key | 抛跨 slot 异常 | key 不在同一 hash slot | 使用 hash tag 或拆分命令 |
| 阻塞命令进普通池 | 池耗尽 | 连接长期占用 | 单独池与超时策略 |

## 可迁移知识

把“请求描述”和“执行资源”分离，可以让同一命令模型适配单机、连接池、路由集群和测试 double；这比在每个客户端 API 中复制重试与编解码逻辑更易验证。

> **面试锚点**
> - Jedis 为什么要有 `CommandObject`？
> - `UnifiedJedis` 和旧 `Jedis` 的连接模型差异是什么？
> - Cluster 路由为什么不能只靠客户端方法名判断？

## Related

- [Redisson 整体架构](/notes/source/java/storage/redisson/architecture/)
- [Redis 客户端执行模型](/notes/source/redis/redis/)
