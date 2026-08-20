---
title: Nacos
description: Nacos 3.2 源码解析：集群成员、Distro、JRaft、配置长轮询、注册发现与健康检查。
category: Backend
tags: [Source Reading, Nacos, Service Discovery, Configuration]
order: 3
updatedDate: 2026-08-20
difficulty: advanced
status: stable
lastReviewed: 2026-08-20
draft: false
sidebar: { order: 3 }
---

Nacos 同时承担配置中心和服务发现中心。它的源码价值在于：同一套服务端基础设施把 AP 的临时实例同步、CP 的持久数据一致性、客户端推送与本地缓存组合成可运行的控制平面。

<!-- more -->

## 本册问题地图

Nacos 要分成“配置中心”和“服务发现”两条状态机来读，二者都涉及长轮询，却不是同一套逻辑：

1. **配置长轮询为什么比固定轮询省？** 服务端在请求上挂起等待，变更、超时或连接异常才返回，客户端再发起下一轮；它降低空轮询，但不能消除网络断开和客户端未刷新等问题。
2. **配置变更为何可能已经发布却未生效？** 服务端识别变更、通知请求返回、客户端更新本地缓存、应用重新读取这几个阶段分别可能失败。
3. **注册与订阅为什么要单独理解？** 注册是实例把自己写入服务端，订阅是消费者维护服务列表；一个实例健康不代表所有订阅者已经收到最新列表。
4. **Distro 为什么做责任分片？** 临时实例变化频繁且更适合最终一致，节点分担实例数据并通过同步修复副本，避免每次变化都让全体节点承担完整写入。
5. **健康检查如何影响可见性？** 心跳、主动探测、临时/持久实例语义共同决定实例是否出现在可用列表中。
6. **Raft 持久化解决什么问题？** 对需要强一致的元数据变更，日志和多数派提交让重启后的节点知道哪些状态可以安全恢复。

## 版本快照

| 项 | 值 |
| --- | --- |
| 仓库 | `alibaba/nacos` |
| 本地路径 | `E:\source\java\rpc\nacos` |
| 分支 | `develop` |
| Commit | `9b989acdf181d00898f2e8839257bb2b2a3cefe3`（2026-08-13） |
| 最近 tag | `3.2.2` |

> 本册所有源码坐标均基于上述 commit，上游演进后行号可能漂移。

## 它解决什么问题

- 让服务实例可以注册、发现、健康检查并在节点故障后收敛。
- 让配置修改不依赖客户端重启，通过长轮询、推送和本地缓存传播变更。
- 对临时实例和持久数据使用不同一致性模型，避免用昂贵的强一致协议覆盖所有流量。

## 模块地图

| 模块 | 职责 | 关键抽象 |
| --- | --- | --- |
| `api` / `client` | SDK、配置缓存、Naming 订阅 | `NacosConfigService`、`NacosNamingService` |
| `core` | 集群成员、RPC、AP/CP 基础设施 | `ServerMemberManager`、`DistroProtocol` |
| `consistency` | 一致性协议契约 | `ConsistencyProtocol`、`CPProtocol` |
| 
aming` | 实例、服务、心跳、健康检查 | `ServiceManager`、`HealthCheckReactor` |
| `config` | 配置存储、监听与长轮询 | `LongPollingService` |
| `bootstrap` / `server` | 应用聚合和启动 | Spring Boot 启动入口 |

## 读码入口顺序

1. `Config#main` 与 `SpringApplicationRunListener`：理解服务启动和生命周期钩子。
2. `ServerMemberManager#init`：理解集群成员与地址发现。
3. `DistroProtocol#sync`、`JRaftProtocol#writeAsync`：比较 AP 与 CP。
4. `LongPollingService#addLongPollingClient` 与 `ClientWorker`：追踪配置变更闭环。
5. `NacosNamingService#registerInstance`、`subscribe`：追踪 Naming 客户端到服务端。
6. `HealthCheckReactor#scheduleCheck`：看心跳、探活和健康状态如何解耦。

## 本册目录

- [整体架构](/notes/source/java/rpc/nacos/architecture/)：启动、成员、协议和请求主流程
- [Distro 与 AP 同步](/notes/source/java/rpc/nacos/distro-ap/)：临时实例分片、同步、校验和失败恢复
- [配置长轮询与推送](/notes/source/java/rpc/nacos/config-long-polling/)：MD5、异步请求、事件通知与客户端缓存
- [JRaft 与持久化一致性](/notes/source/java/rpc/nacos/raft-persistence/)：CP 写入、读写超时和多 Raft Group
- [注册发现与客户端订阅](/notes/source/java/rpc/nacos/naming-discovery/)：注册、心跳、订阅和服务快照
- [健康检查与故障收敛](/notes/source/java/rpc/nacos/health-check/)：探活调度、健康状态和保护边界
- [面试专题](/notes/source/java/rpc/nacos/interview/)：高频题、高难追问与场景题

## 横向对照

| 对象 | 对照点 |
| --- | --- |
| Dubbo | Dubbo 消费者依赖注册订阅，Nacos 负责维护注册和配置控制面 |
| Spring Cloud Alibaba | 适配层把 Nacos 客户端接入 Spring，源码册关注 Nacos 内部协议与状态机 |
| ZooKeeper | Nacos 按数据性质区分 Distro 与 JRaft，不把所有数据统一放进 ZAB 类模型 |
| Sentinel | Nacos 传播配置和实例状态，Sentinel 消费规则并在调用侧执行流控 |

## Related

- [RPC 与微服务](/notes/source/java/rpc/)
- [Spring Cloud Alibaba](/notes/source/java/spring/spring-cloud-alibaba/)
- [Dubbo](/notes/source/java/rpc/dubbo/)
