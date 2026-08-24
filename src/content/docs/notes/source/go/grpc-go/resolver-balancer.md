---
title: grpc-go Resolver 与 Balancer
description: grpc-go 名字解析、service config、SubConn、连接状态聚合和 Picker 数据面。
category: Backend
tags: [Source Reading, gRPC, Go, Load Balancing]
order: 46
updatedDate: 2026-08-24
difficulty: advanced
status: stable
lastReviewed: 2026-08-24
draft: false
sidebar:
  order: 46
---

resolver 把 target 变成地址、endpoint 和 service config；balancer 把这些控制面信息变成 SubConn 和 Picker；每次 RPC 只通过 Picker 选择可用 transport。三者分开后，地址来源和负载算法可以独立替换。

<!-- more -->

## 先给答案：resolver 把 target 变成地址、endpoint 和 service config；bala…

resolver 把 target 变成地址、endpoint 和 service config；balancer 把这些控制面信息变成 SubConn 和 Picker；每次 RPC 只通过 Picker 选择可用 transport。三者分开后，地址来源和负载算法可以独立替换。 正文沿“控制面到数据面 -> Balancer 与 Picker -> pickfirst 与 roundrobin”展开：先确认入口和状态归属，再跟踪控制流或数据流的推进，最后落到对外可观察的结果。

主要失效边界集中在“resolver 发布空列表、Picker 内做网络调用、忽略 Done 回调”这些场景。它们破坏的是容量、顺序、并发或生命周期前提；排查时应先确认状态是否仍由正确对象持有，再核对推进条件和清理路径。

## 控制面到数据面

```text
target URI
  -> resolver.Builder.Build
  -> resolver.UpdateState
       {Addresses, Endpoints, ServiceConfig}
  -> ClientConn
  -> balancer.UpdateClientConnState
  -> create/update SubConn
  -> UpdateState(connectivity, Picker)
  -> pickerWrapper
  -> RPC Pick
```

resolver 的注册表与核心接口位于 `resolver/resolver.go:54-61`、`:232-329`。`ccResolverWrapper.start` 构建 resolver，并用串行化回调隔离并发更新：`resolver_wrapper.go:57-105`；`UpdateState` 将地址和 service config 交回 `ClientConn`：`:127-179`。

## Balancer 与 Picker

balancer 的 `Builder`、`ClientConn`、`SubConn`、`Picker` 和 `Balancer` 接口位于 `balancer/balancer.go:139-365`。balancer 管理连接集合并在状态变化时发布一个新的不可变 Picker；Picker 自身位于 RPC 热路径，只做快速选择并返回 `PickResult.Done` 供策略接收结果反馈。

`pickerWrapper.pick` 在 Picker 暂不可用时等待更新；fail-fast 调用遇到非临时选择错误直接返回，wait-for-ready 调用则继续等待 context：`picker_wrapper.go:105-205`。

## pick_first 与 round_robin

`pick_first` 维护有序地址并选择首个 Ready SubConn：`balancer/pickfirst/pickfirst.go:52-80`、`:210-330`。`round_robin` 基于 endpoint 状态构建 ready picker：`balancer/roundrobin/roundrobin.go:35-85`。service config 决定使用哪种策略，而不是 resolver 直接选择节点。

## 关键取舍

**替代方案**：resolver 直接返回当前应访问的单个地址。

**问题**：地址发现、连接维护和负载算法耦合，无法维护多个 SubConn，也无法利用调用结果反馈。

**设计**：resolver 发布事实，balancer 管理候选连接，Picker 提供低成本数据面快照。

## 边界与踩坑

| 场景 | 风险 | 处理 |
| --- | --- | --- |
| resolver 发布空列表 | Picker 进入无地址状态 | 区分真实删除与短暂发现失败 |
| Picker 内做网络调用 | 每次 RPC 延迟抖动 | 控制面预计算，Pick 只做内存选择 |
| 忽略 Done 回调 | 自适应策略无结果反馈 | 正确传播完成状态 |
| service config 错误 | 回退旧配置或默认策略 | 监控解析错误和当前策略 |

## 可迁移知识

服务发现系统应把“发现了什么”“连接是否可用”“这次请求选谁”拆成三个阶段，分别优化一致性、状态收敛和热路径成本。

> **面试锚点**
> - resolver、balancer、Picker 的职责分别是什么？
> - Picker 为什么适合做成状态快照？
> - wait-for-ready 在没有 Ready SubConn 时如何工作？

## Related

- [ClientConn 与连接状态机](/notes/source/go/grpc-go/clientconn/)
- [Kratos 注册发现与负载选择](/notes/source/go/kratos/registry-selector/)
- [etcd Lease 与 KeepAlive](/notes/source/go/etcd/lease/)

