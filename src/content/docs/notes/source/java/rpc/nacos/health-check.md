---
title: 健康检查与故障收敛
description: Nacos 如何调度心跳、HTTP/TCP/MySQL 探活、更新健康状态并避免检查任务重入。
category: Backend
tags: [Source Reading, Nacos, Health Check, Heartbeat]
order: 36
updatedDate: 2026-08-24
difficulty: advanced
status: stable
lastReviewed: 2026-08-24
draft: false
sidebar: { order: 36 }
---

健康检查把“实例存在”与“实例可用”分开。Nacos 通过统一调度器、处理器委托、心跳任务和状态字段，把不同检查方式接入同一套服务状态模型。

<!-- more -->

## 先给答案：健康检查把“实例存在”与“实例可用”分开

健康检查把“实例存在”与“实例可用”分开。Nacos 通过统一调度器、处理器委托、心跳任务和状态字段，把不同检查方式接入同一套服务状态模型。 正文沿“调度链 -> 实现拆解 -> 为什么采用处理器委托而不是在 Reactor 中写 if/else”展开：先确认入口和状态归属，再跟踪控制流或数据流的推进，最后落到对外可观察的结果。

主要失效边界集中在“检查超时、重复调度、连续失败抖动”这些场景。它们破坏的是容量、顺序、并发或生命周期前提；排查时应先确认状态是否仍由正确对象持有，再核对推进条件和清理路径。

## 调度链

```text
HealthCheckReactor#scheduleCheck
  -> HealthCheckTaskInterceptWrapper
  -> HealthCheckTaskV2#run
  -> ProcessorV2Delegate#process
       ├─ HTTP
       ├─ TCP
       └─ MySQL / NONE
  -> HealthCheckInstancePublishInfo
  -> Service snapshot / push
```

客户端心跳是另一条链：`ClientBeatCheckTaskV2` 周期检查客户端最近心跳，`ClientBeatProcessorV2` 处理心跳到达；服务端主动探活则由 `HealthCheckTaskV2` 和具体 Processor 执行。

## 实现拆解

`HealthCheckReactor#scheduleCheck` 先记录任务启动时间，再包装任务后提交到 Naming 健康线程池。心跳任务使用 `futureMap` 按 task key 去重，取消时移除 Future，避免同一实例重复调度。

`HealthCheckInstancePublishInfo#tryStartCheck` 与 `finishCheck` 为检查提供并发闸门。检查结果最终由 Processor 更新健康状态、响应时间和连续成功/失败计数，避免慢检查覆盖更新的状态。

## 为什么采用处理器委托而不是在 Reactor 中写 if/else

**替代方案**：`HealthCheckReactor` 直接判断 HTTP/TCP/MySQL 并执行探活。
**为什么不行**：调度、协议细节和状态更新会耦合，新增检查类型必须修改中心类，且测试边界变大。
**证据**：`HealthCheckProcessorV2Delegate#process` 负责选择处理器，`HttpHealthCheckProcessor`、`TcpHealthCheckProcessor` 和 `MysqlHealthCheckProcessor` 各自实现检查细节。

## 源码坐标索引

- `HealthCheckReactor#scheduleCheck(HealthCheckTaskV2)` — `naming/src/main/java/com/alibaba/nacos/naming/healthcheck/HealthCheckReactor.java:44`
- `HealthCheckReactor#scheduleCheck(BeatCheckTask)` — `naming/src/main/java/com/alibaba/nacos/naming/healthcheck/HealthCheckReactor.java:56`
- `HealthCheckReactor#cancelCheck` — `naming/src/main/java/com/alibaba/nacos/naming/healthcheck/HealthCheckReactor.java:73`
- `HealthCheckReactor#scheduleNow` — `naming/src/main/java/com/alibaba/nacos/naming/healthcheck/HealthCheckReactor.java:94`
- `HealthCheckTaskV2#run` — `naming/src/main/java/com/alibaba/nacos/naming/healthcheck/v2/HealthCheckTaskV2.java:172`
- `HealthCheckProcessorV2Delegate#process` — `naming/src/main/java/com/alibaba/nacos/naming/healthcheck/v2/processor/HealthCheckProcessorV2Delegate.java:59`
- `HttpHealthCheckProcessor#process` — `naming/src/main/java/com/alibaba/nacos/naming/healthcheck/v2/processor/HttpHealthCheckProcessor.java:70`
- `TcpHealthCheckProcessor#process` — `naming/src/main/java/com/alibaba/nacos/naming/healthcheck/v2/processor/TcpHealthCheckProcessor.java:97`
- `MysqlHealthCheckProcessor#process` — `naming/src/main/java/com/alibaba/nacos/naming/healthcheck/v2/processor/MysqlHealthCheckProcessor.java:82`
- `HealthCheckInstancePublishInfo#tryStartCheck` — `naming/src/main/java/com/alibaba/nacos/naming/core/v2/pojo/HealthCheckInstancePublishInfo.java:56`
- `HealthCheckInstancePublishInfo#finishCheck` — `naming/src/main/java/com/alibaba/nacos/naming/core/v2/pojo/HealthCheckInstancePublishInfo.java:60`
- `ClientBeatCheckTaskV2#run` — `naming/src/main/java/com/alibaba/nacos/naming/healthcheck/heartbeat/ClientBeatCheckTaskV2.java:81`

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| 检查超时 | 健康状态迟迟不变 | 探活线程被网络 IO 占满 | 独立线程池、设置连接和响应超时 |
| 重复调度 | CPU 和网络翻倍 | task key 不一致或取消失败 | 保持稳定 task key，检查 futureMap |
| 连续失败抖动 | 实例在健康/不健康间切换 | 单次结果过于敏感 | 使用连续失败计数和保护阈值 |

## 可迁移知识

健康检查系统应把调度、探测协议、状态机和传播分层。检查结果最好带时间、RT、连续计数和版本，才能在并发和网络抖动下解释状态变化。

> **面试锚点**
> - 心跳和主动健康检查有什么区别？
> - 如何避免同一个实例被重复检查？
> - 为什么需要连续失败计数而不是一次失败立即摘除？

## Related

- [注册发现与客户端订阅](/notes/source/java/rpc/nacos/naming-discovery/)
- [Distro 与 AP 同步](/notes/source/java/rpc/nacos/distro-ap/)
- [Spring Cloud Alibaba Nacos 服务发现](/notes/source/java/spring/spring-cloud-alibaba/nacos-discovery/)
