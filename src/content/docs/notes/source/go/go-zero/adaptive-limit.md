---
title: 自适应限流与负载保护
description: go-zero 的 shedder、周期限流、令牌桶和 Redis 故障 rescue 路径。
category: Backend
tags: [Source Reading, go-zero, Go, Rate Limiting]
order: 23
updatedDate: 2026-08-24
difficulty: advanced
status: stable
lastReviewed: 2026-08-24
draft: false
sidebar:
  order: 23
---

go-zero 同时提供三种不同语义的保护：按周期计数的配额、按速率发放的令牌桶，以及根据 CPU、RT 和并发动态判断的 adaptive shedder。

<!-- more -->

## 先给答案：go-zero 同时提供三种不同语义的保护：按周期计数的配额、按速率发放的令牌桶，以及根据 CPU、RT …

go-zero 同时提供三种不同语义的保护：按周期计数的配额、按速率发放的令牌桶，以及根据 CPU、RT 和并发动态判断的 adaptive shedder。 正文沿“三种限流模型 -> AdaptiveShedder -> Redis 故障 rescue”展开：先确认入口和状态归属，再跟踪控制流或数据流的推进，最后落到对外可观察的结果。

主要失效边界集中在“reserveN 调用脚本失败后启动 monitor，并使用 x/time/rate 的本地 limiter：core/limit/tokenlimit.go:85-126”这些场景。它们破坏的是容量、顺序、并发或生命周期前提；排查时应先确认状态是否仍由正确对象持有，再核对推进条件和清理路径。

## 三种限流模型

| 模型 | 适合问题 | 核心状态 |
| --- | --- | --- |
| `PeriodLimit` | 租户/接口周期配额 | Redis key、窗口起点、计数 |
| `TokenLimiter` | 平滑速率和突发容量 | Redis Lua 令牌、rescue limiter |
| `AdaptiveShedder` | 进程过载与并发保护 | pass、RT、flying、CPU |

`PeriodLimit.Allow` 先在本地判断窗口，再执行 Redis Lua 的计数和过期逻辑：`core/limit/periodlimit.go:51-117`。`TokenLimiter` 将令牌桶计算放入脚本，Redis 出错时转入进程内 rescue 路径：`core/limit/tokenlimit.go:44-158`。

## AdaptiveShedder

```text
request enters
   |
   +--> flying +1
   +--> rolling pass / RT window
   +--> avgFlying, maxFlight, CPU factor
                |
        overload and over limit?
             /             \
          drop              pass
```

构造阶段设置窗口、CPU threshold 和统计对象：`core/load/adaptiveshedder.go:94-120`。判断阶段用 pass 与最小 RT 推导最大并发，再结合平滑的 `avgFlying` 和 CPU overload factor：`core/load/adaptiveshedder.go:161-218`。它保护的是当前实例的资源，不是跨实例的全局配额。

## Redis 故障 rescue

`reserveN` 调用脚本失败后启动 monitor，并使用 `x/time/rate` 的本地 limiter：`core/limit/tokenlimit.go:85-126`。`startMonitor` 通过互斥保证只启动一个恢复监控，定期 Ping Redis，成功后回到分布式路径：`core/limit/tokenlimit.go:129-141`。

```text
Redis Lua success --> distributed decision
       |
       +-- error --> local rescue limiter --> Ping monitor --> recover
```

## 为什么不能只用一个 limiter

**替代方案**：所有请求都走固定 QPS 令牌桶。
**为什么不行**：固定速率不知道当前请求耗时和 CPU 压力；反过来 adaptive shedder 也不能表达租户的跨实例总配额。
**结论**：资源保护和业务配额是两个维度，应组合而不是互相替代。

## 边界与踩坑

| 场景 | 风险 | 处理 |
| --- | --- | --- |
| 把本地 limiter 当全局配额 | 实例数增加后总量膨胀 | 使用 Redis 或专门配额服务 |
| Redis 故障直接放行 | 下游被故障流量冲垮 | 保留 rescue limiter |
| context 超时算 Redis 故障 | 错误触发恢复线程 | 单独识别 deadline/cancel |
| 只按 CPU 丢弃 | IO 等待型过载漏判 | 联合 RT、并发和 CPU |

## 可迁移知识

限流设计要先问清楚“限制什么”：速率、周期总量、并发数、资源使用率还是下游失败压力。不同目标必须使用不同的反馈信号。

> **面试锚点**
> - PeriodLimit、TokenLimiter、AdaptiveShedder 的边界是什么？
> - Redis 故障时为什么要 rescue 而不是 fail-open？
> - adaptive shedder 如何把 RT 转换成并发上限？

## Related

- [自适应熔断](/notes/source/go/go-zero/adaptive-breaker/)
- [缓存一致性与击穿保护](/notes/source/go/go-zero/cache/)
- [Sentinel 流控与规则匹配](/notes/source/java/rpc/sentinel/flow-control/)
