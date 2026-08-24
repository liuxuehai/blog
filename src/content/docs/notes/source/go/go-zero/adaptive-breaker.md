---
title: 自适应熔断
description: go-zero breaker 的滚动窗口、概率丢弃、探测放行与 Promise 上报。
category: Backend
tags: [Source Reading, go-zero, Go, Circuit Breaker]
order: 22
updatedDate: 2026-08-22
difficulty: advanced
status: stable
lastReviewed: 2026-08-22
draft: false
sidebar:
  order: 22
---

go-zero 的 breaker 不是简单的 OPEN/CLOSED 状态机，而是用滚动窗口估算失败压力，再以概率丢弃请求，并保留少量探测流量观察下游是否恢复。

<!-- more -->

## 先给答案：自适应熔断用近期反馈决定是否继续把流量送给下游

每次调用都会产生成功、失败和延迟反馈，熔断器在滑动时间窗口中聚合这些信号。当错误或慢调用达到阈值，后续请求被快速拒绝；经过冷却后进入探测状态，少量请求成功才逐步恢复。它保护的是故障传播路径，不是把下游修好。

自适应的关键是阈值随样本量和负载变化，而不是固定一个“失败 50% 就熔断”。样本太少、窗口过短或把业务拒绝也算成下游错误，都会造成误判；排障要同时看请求量、错误分类、延迟分布和状态转换。

## 调用协议

```text
Allow()
  ├─ rejected --> ErrServiceUnavailable
  └─ Promise
       ├─ Accept() --> success window
       └─ Reject() --> failure window

Do(fn) = Allow + fn + Accept/Reject
```

`Breaker.Allow` 负责准入并返回 Promise；`Do` 封装执行和结果上报：`core/breaker/breaker.go:30-45`、`core/breaker/breaker.go:110-123`。调用方若手动使用 `Allow`，必须确保所有退出路径都调用 `Accept` 或 `Reject`，包括 panic 和超时。

## Google SRE 风格窗口

`newGoogleBreaker` 初始化 10 秒、40 桶的滑动窗口：`core/breaker/googlebreaker.go:40-79`。`accept` 读取窗口内失败数、工作请求数和成功数，得到 `dropRatio`；当压力升高时，`shouldDrop` 通过随机数决定是否拒绝，而不是一次性切断全部流量：`core/breaker/googlebreaker.go:93-118`。

```text
rolling buckets --> failure / request counts
                         |
                         v
                   dropRatio
                         |
                 random admission
                    /          \
                 reject       probe/pass
```

强制放行计数器用于避免“完全拒绝后永远没有恢复样本”：`core/breaker/googlebreaker.go:133-164`。这使恢复判断可以依赖真实探测，而不是固定等待一个冷却时间。

## 为什么选择概率丢弃

**替代方案**：失败率超过阈值后直接 OPEN。
**为什么不行**：全部切断会让下游恢复期间没有探测请求，也会把突发流量从平滑退化变成断崖式拒绝。
**取舍**：概率丢弃保留恢复样本，但对调用方来说拒绝比例随窗口和流量变化，排障时不能只看一个状态字段。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| Promise 未上报 | breaker 长期判断失真 | 手写调用漏掉 Reject | 用 `Do` 或 defer 兜底 |
| 把业务 4xx 都算失败 | 正常拒绝触发熔断 | 错误分类过粗 | 按下游故障语义分类 |
| 只看当前 QPS | 低流量时误判 | 窗口样本不足 | 联合看请求数、失败数和探测结果 |
| panic 未上报 | 失败率被低估 | 直接跳出调用栈 | 使用封装的 `Do` |

## 可迁移知识

熔断器的核心不是“关掉请求”，而是把失败结果反馈给准入决策，并始终保留有限的恢复观测通道。

> **面试锚点**
> - 为什么 go-zero breaker 需要 Promise？
> - 概率丢弃和 OPEN/CLOSE 状态机各有什么代价？
> - 探测放行如何避免恢复不可见？

## Related

- [整体架构](/notes/source/go/go-zero/architecture/)
- [自适应限流与负载保护](/notes/source/go/go-zero/adaptive-limit/)
- [Sentinel 熔断与系统保护](/notes/source/java/rpc/sentinel/degrade-system/)
