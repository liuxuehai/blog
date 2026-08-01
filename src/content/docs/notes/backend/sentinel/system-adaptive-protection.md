---
title: 系统保护
description: Sentinel 系统自适应保护的原理、指标维度与集群过载防护。
category: Backend
tags:
  - Sentinel
  - System Protection
  - Adaptive
order: 544
updatedDate: 2024-10-20
difficulty: advanced
status: stable
lastReviewed: 2025-03-05
draft: false
sidebar:
  order: 544
---

系统保护是从系统维度进行的自适应过载保护，防止系统在高负载下崩溃。

<!-- more -->

## 核心问题

系统负载高时持续接收请求可能导致系统崩溃。集群环境下，负载均衡会将流量转发到其他机器；若其他机器也处于边缘状态，增加的流量会导致连锁崩溃，最终整个集群不可用。

**解决方案：** 让系统入口流量与系统负载达到平衡，保证系统在能力范围内处理最多请求。

## 系统规则指标

| 指标 | 参数 | 说明 |
|------|------|------|
| **系统负载** | `highestSystemLoad` | Linux load1，超过阈值触发保护 |
| **CPU 使用率** | `highestCpuUsage` | CPU 使用率，超过阈值触发保护 |
| **入口 QPS** | `qps` | 全局入口 QPS，超过阈值触发保护 |
| **平均响应时间** | `avgRt` | 所有入口流量的平均 RT，超过阈值触发保护 |
| **并发线程数** | `maxThread` | 入口并发线程数，超过阈值触发保护 |

## 使用示例

```java
SystemRule rule = new SystemRule();
rule.setHighestSystemLoad(2.0);      // 系统负载超过 2.0 时触发
rule.setHighestCpuUsage(0.8);        // CPU 超过 80% 时触发
rule.setQps(5000);                    // 全局入口 QPS 超过 5000 时触发
rule.setAvgRt(200);                   // 平均 RT 超过 200ms 时触发
rule.setMaxThread(200);               // 并发线程数超过 200 时触发

SystemRuleManager.loadRules(Collections.singletonList(rule));
```

## 自适应保护策略

Sentinel 的系统保护不是简单的阈值限流，而是基于系统负载的自适应调整：

```text
系统负载上升 → Sentinel 检测到 → 自动降低入口流量
系统负载下降 → Sentinel 检测到 → 逐步恢复入口流量
```

### 系统负载保护

基于 Linux load1（1 分钟平均负载）进行判断：

- 当 load1 超过阈值时，触发保护，拒绝部分请求
- 当 load1 恢复正常时，自动解除保护

**注意：** 系统负载保护仅在 Linux/macOS 上有效，Windows 不支持。

### CPU 使用率保护

基于 CPU 使用率进行判断：

- 当 CPU 使用率超过阈值时，触发保护
- 适用于所有操作系统

### 入口 QPS 保护

基于全局入口 QPS 进行判断：

- 当入口 QPS 超过阈值时，触发保护
- 适用于系统整体容量保护

## 系统保护 vs 资源流控

| 维度 | 资源流控 | 系统保护 |
|------|----------|----------|
| 粒度 | 单个资源 | 整个系统 |
| 指标 | 资源级别的 QPS/线程数 | 系统级别的负载/CPU/QPS |
| 配置方式 | 针对每个资源单独配置 | 全局配置 |
| 适用场景 | 保护单个接口/服务 | 保护整个系统不被过载 |

## 集群过载保护

在集群场景下，单机的系统保护可能不够。Sentinel 提供集群级别的过载保护：

```text
请求 → 负载均衡 → 机器 A（负载高，触发保护，拒绝请求）
                 → 机器 B（负载正常，接受请求）
                 → 机器 C（负载正常，接受请求）
```

每台机器独立进行系统保护判断，负载均衡器（如 Nginx、Spring Cloud LoadBalancer）配合进行流量调度。

## 与 Kubernetes HPA 的配合

| 组件 | 职责 |
|------|------|
| **Sentinel 系统保护** | 保护单机不过载，快速拒绝过量请求 |
| **Kubernetes HPA** | 根据负载指标自动扩缩容 |

```text
流量突增 → Sentinel 拒绝过量请求（秒级响应）
         → HPA 检测到负载上升 → 触发扩容（分钟级响应）
         → 新 Pod 就绪 → 流量分散 → Sentinel 恢复
```

> 系统保护是 Sentinel 的最后一道防线。当资源级流控和熔断都无法完全保护时，系统保护从整体维度防止过载。
