---
title: 治理与 Mode
description: SPI 扩展、Standalone/Cluster 模式、状态持久化和元数据上下文构建。
category: Backend
tags: [Source Reading, ShardingSphere, Governance, SPI]
order: 27
updatedDate: 2026-08-24
difficulty: advanced
status: stable
lastReviewed: 2026-08-24
draft: false
sidebar:
  order: 27
---

治理层负责让多个计算节点共享元数据、状态和配置。ShardingSphere 将持久化仓库抽象为 `PersistRepository`，再由 Standalone 或 Cluster Mode 提供实现，使核心内核不依赖某一种 ZooKeeper、数据库或内存存储。

<!-- more -->

## 先给答案：治理层负责让多个计算节点共享元数据、状态和配置

治理层负责让多个计算节点共享元数据、状态和配置。ShardingSphere 将持久化仓库抽象为 PersistRepository，再由 Standalone 或 Cluster Mode 提供实现，使核心内核不依赖某一种 ZooKeeper、数据库或内存存储。 正文沿“Mode 架构 -> 实现拆解 -> 为什么用 Mode 抽象而不是直接依赖 ZooKeeper”展开：先确认入口和状态归属，再跟踪控制流或数据流的推进，最后落到对外可观察的结果。

主要失效边界集中在“Standalone 与 Cluster 混用、状态更新失败、SPI 缺失”这些场景。它们破坏的是容量、顺序、并发或生命周期前提；排查时应先确认状态是否仍由正确对象持有，再核对推进条件和清理路径。

## Mode 架构

```text
ModeConfiguration
      |
      v
ContextManagerBuilder
      |
      +-- StandalonePersistRepository
      +-- ClusterPersistRepository
      |
      v
MetaDataContexts + ComputeNodeInstanceContext
      |
      v
rules / data sources / state services
```

## 实现拆解

- Standalone builder 从 Mode 配置取 repository，并通过 `TypedSPILoader` 选择实现：`mode/type/standalone/core/src/main/java/org/apache/shardingsphere/mode/manager/standalone/StandaloneContextManagerBuilder.java:45`、`:49`。
- builder 创建 `MetaDataContexts`，再组装 `ContextManager`：`StandaloneContextManagerBuilder.java:52`。
- `StatePersistService#update` 将状态转换成节点路径并持久化：`mode/core/src/main/java/org/apache/shardingsphere/mode/state/StatePersistService.java:38`。
- `load` 从仓库读取状态并转换回枚举：`StatePersistService.java:47`。
- `PersistRepository` 作为仓库 SPI，隔离 persist/query/getChildrenKeys 等基础能力：`mode/spi/src/main/java/org/apache/shardingsphere/mode/spi/repository/PersistRepository.java:24`。
- Cluster repository 也遵循独立配置和接口边界：`mode/type/cluster/repository/api/src/main/java/org/apache/shardingsphere/mode/repository/cluster/ClusterPersistRepository.java:25`。

## 为什么用 Mode 抽象而不是直接依赖 ZooKeeper

**替代方案**：在元数据管理器中直接调用 ZooKeeper API。
**为什么不行**：本地开发、嵌入式部署、数据库持久化和集群部署需要不同后端；核心模块直接依赖某个实现会扩大依赖和测试成本。
**证据**：`StandaloneContextManagerBuilder` 通过 `TypedSPILoader` 获取 `StandalonePersistRepository`，`StatePersistService` 只依赖 `PersistRepository#persist/query`：`mode/type/standalone/core/src/main/java/org/apache/shardingsphere/mode/manager/standalone/StandaloneContextManagerBuilder.java:49`、`mode/core/src/main/java/org/apache/shardingsphere/mode/state/StatePersistService.java:38`。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| Standalone 与 Cluster 混用 | 配置能解析但行为不符合预期 | repository 类型决定持久化语义 | 明确部署模式和 repository provider |
| 状态更新失败 | 节点状态与本地状态不一致 | 持久化调用不是内存赋值 | 对更新失败做重试和告警 |
| SPI 缺失 | ContextManager 无法构建 | provider 未打包或服务文件缺失 | 检查 `META-INF/services` 和依赖 |
| 多节点并发修改 | 元数据覆盖或版本冲突 | 需要仓库侧版本/监听语义 | 使用 Cluster repository 的一致性能力 |

## 可迁移知识

“核心服务依赖能力接口，部署模式负责装配实现”是可复用的插件架构。配置中心、选主、锁服务和审计存储都可以采用同一方式，把环境差异推迟到启动装配阶段。

> **面试锚点**
> - `PersistRepository` 为什么比直接依赖 ZooKeeper 更合理？
> - Standalone builder 创建了哪些上下文？
> - 状态持久化和元数据持久化为什么要有独立 service？

## Related

- [整体架构](/notes/source/java/storage/shardingsphere/architecture/)
- [SQL 解析与 AST](/notes/source/java/storage/shardingsphere/sql-parser/)
- [Nacos 源码解析](/notes/source/java/rpc/nacos/)