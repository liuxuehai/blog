---
title: 集群流控
description: Sentinel 集群流量控制的 Token Client/Server 模式与精确流量控制。
category: Backend
tags:
  - Sentinel
  - Cluster Flow Control
  - Distributed
order: 545
updatedDate: 2024-11-03
difficulty: advanced
status: stable
lastReviewed: 2025-03-05
draft: false
sidebar:
  order: 545
---

集群流控解决了单机流控在分布式场景下的精度问题——多台实例各自独立限流，总量会超出预期。

<!-- more -->

## 为什么需要集群流控

单机流控的问题：

```text
假设接口限流阈值 1000 QPS，部署 10 台机器
每台机器独立限流 1000 QPS → 总量可达 10000 QPS
实际期望总量 1000 QPS → 单机限流形同虚设
```

解决方案有两种：

| 方案 | 说明 | 优缺点 |
|------|------|--------|
| **统一 Gateway 限流** | 在网关层统一限流 | 简单，但无法精确到服务级别 |
| **集群流控** | 多实例共享一个全局 Token Server | 精确，但需要额外组件 |

Sentinel 采用集群流控方案。

## 架构设计

```text
                    ┌─────────────┐
                    │ Token Server│
                    │ （全局统计）  │
                    └──────┬──────┘
                           │
            ┌──────────────┼──────────────┐
            ↓              ↓              ↓
      ┌──────────┐   ┌──────────┐   ┌──────────┐
      │Client(A) │   │Client(B) │   │Client(C) │
      │ 业务实例  │   │ 业务实例  │   │ 业务实例  │
      └──────────┘   └──────────┘   └──────────┘
```

### Token Client（客户端）

- 嵌入业务实例，拦截请求
- 向 Token Server 申请 Token
- 获得 Token 则通过，否则限流

### Token Server（服务端）

- 独立部署，全局统计 QPS
- 管理 Token 的分配和回收
- 支持单机和嵌入式两种部署模式

## 两种部署模式

### 独立模式（Alone）

Token Server 独立部署，所有 Client 连接到同一个 Server。

```yaml
# Token Server 配置
seata:
  sentinel:
    transport:
      cluster: true
      server-addr: token-server:8719
```

**优点：** 统计精确，不受业务实例影响

**缺点：** 需要额外部署和维护 Server

### 嵌入模式（Embedded）

Token Server 嵌入在某个业务实例中，其他实例作为 Client 连接过来。

**优点：** 不需要额外部署

**缺点：** Server 所在实例的负载会影响流控精度

## 集群流控规则

```java
FlowRule rule = new FlowRule();
rule.setResource("orderService");
rule.setGrade(RuleConstant.FLOW_GRADE_QPS);
rule.setCount(1000);                    // 全局阈值 1000 QPS
rule.setClusterMode(true);              // 集群模式
rule.setClusterConfig(
    new ClusterFlowConfig()
        .setFlowId(1)                   // 规则 ID
        .setThresholdType(ClusterRuleConstant.FLOW_THRESHOLD_GLOBAL) // 全局阈值
);
```

### 阈值类型

| 类型 | 说明 |
|------|------|
| **GLOBAL（全局均摊）** | 总阈值为 N，每个实例分到 N/实例数 |
| **LOCAL（单机阈值）** | 每个实例独立的阈值 |

## 集群流控 vs 单机流控

| 维度 | 单机流控 | 集群流控 |
|------|----------|----------|
| 统计范围 | 单实例 | 全局所有实例 |
| 精度 | 实例越多越不精确 | 精确 |
| 部署复杂度 | 无额外组件 | 需要 Token Server |
| 网络开销 | 无 | Client ↔ Server 通信 |
| 适用场景 | 单实例限流、非关键接口 | 全局限流、关键接口 |

## 适用场景

| 场景 | 原因 |
|------|------|
| **第三方 API 限流** | 第三方有全局 QPS 限制，必须精确控制 |
| **数据库连接池保护** | 数据库连接数有限，需要全局控制 |
| **关键接口全局限流** | 防止多实例叠加超过预期 |
| **多租户资源隔离** | 不同租户的资源配额需要全局管理 |

## 注意事项

| 注意点 | 说明 |
|--------|------|
| **Server 高可用** | Token Server 需要保证高可用，否则集群流控失效 |
| **网络延迟** | Client ↔ Server 的网络延迟会影响流控精度 |
| **降级策略** | Client 无法连接 Server 时的降级行为（fallbackToLocalThreshold） |
| **规则同步** | 集群规则需要通过数据源同步到所有节点 |

> 集群流控适合对精度要求高的场景（如第三方 API 限流、数据库保护）。大多数场景下，单机流控 + 合理的实例数已经足够。
