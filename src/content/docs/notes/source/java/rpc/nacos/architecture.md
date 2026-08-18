---
title: 整体架构
description: Nacos 启动、集群成员、AP/CP 协议、配置与 Naming 请求的整体调用链。
category: Backend
tags: [Source Reading, Nacos, Architecture]
order: 31
updatedDate: 2026-08-16
difficulty: advanced
status: stable
lastReviewed: 2026-08-16
draft: false
sidebar: { order: 31 }
---

Nacos 的核心不是单一注册表，而是由成员管理、远程 RPC、数据一致性、领域服务和客户端状态组成的控制平面。理解分层后，AP 与 CP 的边界会比记忆模块名更清晰。

<!-- more -->

## 分层

```text
Client SDK
  ├─ ConfigService / ClientWorker ──► 配置 RPC / 长轮询
  └─ NamingService ─────────────────► 注册、订阅、心跳
                                      │
              HTTP / gRPC / cluster RPC
                                      ▼
+  Core: MemberManager / Connection / NotifyCenter
                                      │
         ┌────────────────────────────┴──────────────────────────┐
         ▼                                                       ▼
   AP: Distro                                             CP: JRaft
   临时实例、分片同步                                      持久数据、顺序写
         │                                                       │
         └──────────── Naming / Config / Persistence ────────────┘
```

## 核心抽象

| 抽象 | 作用 | 源码坐标 |
| --- | --- | --- |
| `ServerMemberManager` | 保存本机、集群成员和健康成员集合 | `core/.../ServerMemberManager.java:153` |
| `DistroProtocol` | 调度 AP 数据同步、加载和校验 | `core/.../DistroProtocol.java:106` |
| `JRaftProtocol` | 把 CP 读写委托到 Raft Server | `core/.../JRaftProtocol.java:116` |
| `NotifyCenter` | 让领域变化异步通知订阅者 | `config/.../LongPollingService.java:232` |
| `ClientWorker` | 维护配置缓存和监听请求 | `client/.../ClientWorker.java:926` |
| `HealthCheckReactor` | 调度 Naming 探活与心跳任务 | `naming/.../HealthCheckReactor.java:44` |

## 主流程一：启动

```text
Config#main
  -> SpringApplication.run
  -> SpringApplicationRunListener
  -> ServerMemberManager#init
  -> ProtocolManager 初始化 AP / CP
  -> NacosConfigConfiguration / Naming 领域 Bean
  -> Distro 加载与校验任务、JRaftServer.start
  -> ready
```

`Config#main` 把启动交给 Spring Boot；`ServerMemberManager#init` 先确定本机地址、能力和成员表，再启动地址发现。协议管理器随后装配 Distro 与 JRaft，领域服务在容器生命周期中注册事件和任务。

## 主流程二：请求处理

```text
客户端请求
  -> RPC/HTTP 接入层
  -> 领域 Controller / RequestHandler
  -> Naming 或 Config Service
  -> Distro / JRaft / 本地缓存
  -> NotifyCenter / Push / 客户端 Listener
```

配置变化通常先更新服务端数据，再发布 `LocalDataChangeEvent`；Naming 变化则更新服务快照并通过推送或订阅响应让客户端替换本地 `ServiceInfo`。

## 扩展点全景

| 扩展点 | 接口或入口 | 触发时机 | 典型用途 |
| --- | --- | --- | --- |
| 一致性协议 | `ConsistencyProtocol` | 数据读写或同步 | 替换 AP/CP 实现 |
| 健康检查 | `HealthCheckProcessorV2` | 定时探活 | HTTP/TCP/MySQL 探测 |
| 成员发现 | `MemberLookup` | 集群初始化和变更 | 地址服务器、文件或环境发现 |
| 事件订阅 | `Subscriber` | 领域事件发布 | 配置推送、指标、状态刷新 |
| 推送执行器 | `PushExecutor` | Naming 变更 | gRPC 推送和扩展传输 |

## 关键取舍

### 为什么按数据性质拆 AP 和 CP

**替代方案**：所有 Naming、Config 数据统一进入 Raft。
**为什么不行**：临时实例心跳频繁、生命周期短，强一致日志会把高频租约变化放大成共识流量；而持久配置又需要顺序提交和可恢复存储。
**证据**：`DistroProtocol#sync` 面向分片同步，`JRaftProtocol#writeAsync` 面向按 group 提交的 CP 写入。

## 源码坐标索引

- `Config#main` — `config/src/main/java/com/alibaba/nacos/config/server/Config.java:34`
- `SpringApplicationRunListener#starting` — `core/src/main/java/com/alibaba/nacos/core/code/SpringApplicationRunListener.java:62`
- `ServerMemberManager#init` — `core/src/main/java/com/alibaba/nacos/core/cluster/ServerMemberManager.java:153`
- `ServerMemberManager#update` — `core/src/main/java/com/alibaba/nacos/core/cluster/ServerMemberManager.java:252`
- `ServerMemberManager#memberChange` — `core/src/main/java/com/alibaba/nacos/core/cluster/ServerMemberManager.java:359`
- `DistroProtocol#sync` — `core/src/main/java/com/alibaba/nacos/core/distributed/distro/DistroProtocol.java:106`
- `DistroProtocol#onReceive` — `core/src/main/java/com/alibaba/nacos/core/distributed/distro/DistroProtocol.java:150`
- `JRaftProtocol#init` — `core/src/main/java/com/alibaba/nacos/core/distributed/raft/JRaftProtocol.java:116`
- `JRaftProtocol#writeAsync` — `core/src/main/java/com/alibaba/nacos/core/distributed/raft/JRaftProtocol.java:188`
- `HealthCheckReactor#scheduleCheck` — `naming/src/main/java/com/alibaba/nacos/naming/healthcheck/HealthCheckReactor.java:44`

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| 单机模式 | 看不到跨节点同步 | Distro 在 standalone 下直接标记初始化 | 不用单机测试推断集群一致性 |
| 成员列表未收敛 | 请求被转发到旧节点 | 成员发现和健康状态是异步更新 | 观察成员事件与健康集合 |
| AP 数据误用 CP 语义 | 读到短暂旧值 | Distro 追求最终收敛 | 业务上区分临时实例和持久配置 |

## 可迁移知识

控制平面常见做法是把高频、可重建状态与低频、需审计状态分开建模，再为每类状态选择一致性和传播协议。模块边界应围绕状态语义，而不是围绕网络协议名。

> **面试锚点**
> - Nacos 为什么同时有 Distro 和 JRaft？
> - 成员管理和数据一致性协议分别负责什么？
> - 配置变更如何从服务端进入客户端监听器？

## Related

- [Distro 与 AP 同步](/notes/source/java/rpc/nacos/distro-ap/)
- [JRaft 与持久化一致性](/notes/source/java/rpc/nacos/raft-persistence/)
- [Spring Boot 启动流程](/notes/source/java/spring/spring-boot/startup/)
