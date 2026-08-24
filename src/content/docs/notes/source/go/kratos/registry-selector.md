---
title: Kratos 注册发现与负载选择
description: Kratos Registrar、Discovery、watcher、HTTP/gRPC resolver、subset 与 selector。
category: Backend
tags: [Source Reading, Kratos, Go, Registry, Load Balancing]
order: 35
updatedDate: 2026-08-24
difficulty: advanced
status: stable
lastReviewed: 2026-08-24
draft: false
sidebar:
  order: 35
---

Kratos 将“服务注册”“实例变化通知”“节点选择”拆成三个层次：`registry` 定义中心接口，resolver 把实例变化转换为协议地址，`selector` 决定每次请求选哪个节点。

<!-- more -->

## 先给答案：Kratos 将“服务注册”“实例变化通知”“节点选择”拆成三个层次：registry 定义中心接口，re…

Kratos 将“服务注册”“实例变化通知”“节点选择”拆成三个层次：registry 定义中心接口，resolver 把实例变化转换为协议地址，selector 决定每次请求选哪个节点。 正文沿“数据流 -> gRPC resolver -> Selector 边界”展开：先确认入口和状态归属，再跟踪控制流或数据流的推进，最后落到对外可观察的结果。

主要失效边界集中在“selector.Selector 同时拥有 Apply 和 Select：selector/selector.go:12-30”这些场景。它们破坏的是容量、顺序、并发或生命周期前提；排查时应先确认状态是否仍由正确对象持有，再核对推进条件和清理路径。

## 数据流

```text
App.Run -> Registrar.Register(ServiceInstance)
                              |
client -> Discovery.Watch(service)
                              |
                         Watcher.Next
                              |
          HTTP rebalancer / gRPC resolver.UpdateState
                              |
                       Selector.Select
```

接口定义在 `registry/registry.go:9-34`，实例模型在 `:36-50`。Watcher 的 `Next` 首次可返回实例列表，之后阻塞到变化或 context 结束。

## gRPC resolver

`NewBuilder` 在 `transport/grpc/resolver/discovery/builder.go:50-61` 创建 resolver builder；`Build` 使用 timeout 创建 watcher，并启动后台 watch：`:64-106`。更新时去重 endpoint、应用 subset，再写入 grpc resolver state：`resolver.go:50-95`。

HTTP resolver 类似，但把实例转换为 selector.Node 并交给 rebalancer：`transport/http/resolver.go:56-119`、`:122-150`。HTTP client 的 `WithBlock` 会等待第一次有效节点。

## Selector 边界

`selector.Selector` 同时拥有 `Apply` 和 `Select`：`selector/selector.go:12-30`。Apply 更新完整节点集，Select 返回节点和 `DoneFunc`，调用结束后把错误、响应 metadata 和收发字节信息反馈给负载均衡器：`:55-74`。

## 设计取舍

**替代方案**：每次请求都同步访问注册中心选节点。
**问题**：请求延迟依赖控制面，注册中心故障会直接放大到业务流量。
**设计**：watch 将节点缓存到本地，数据面只做本地选择；resolver 负责把控制面变化推给协议栈。

## 边界与踩坑

| 场景 | 风险 | 处理 |
| --- | --- | --- |
| watcher 创建超时 | 客户端初始化卡住 | builder 提供 watcher timeout |
| 服务实例为空 | 覆盖已有可用节点 | resolver 拒绝空地址更新 |
| 节点数量过多 | 每个客户端缓存过大 | subset 限制本地节点集 |
| 选择后不调用 Done | 权重/错误统计失真 | RPC 完成路径必须回调 DoneFunc |

## 可迁移知识

服务发现应是控制面推送，负载选择应是数据面本地决策；两者之间用稳定的节点快照接口连接。

> **面试锚点**
> - Kratos 为什么需要 resolver 和 selector 两层？
> - Watcher 的变化如何传播到 grpc-go？
> - subset 解决了什么规模问题？

## Related

- [App 生命周期](/notes/source/go/kratos/app-lifecycle/)
- [etcd Lease 与 KeepAlive](/notes/source/go/etcd/lease/)
- [Nacos 注册发现](/notes/source/java/rpc/nacos/)
