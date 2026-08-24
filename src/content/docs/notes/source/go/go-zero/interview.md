---
title: 面试专题
description: go-zero 高频面试题、高难追问和源码级排障回答。
category: Backend
tags: [Source Reading, go-zero, Go, Interview]
order: 29
updatedDate: 2026-08-24
difficulty: advanced
status: stable
lastReviewed: 2026-08-24
draft: false
sidebar:
  order: 29
---

go-zero 面试的重点不是背“熔断、限流、缓存”四个名词，而是能说清统计窗口、失败边界、降级路径和运行时装配。

<!-- more -->

## 先给答案：go-zero 面试的重点不是背“熔断、限流、缓存”四个名词，而是能说清统计窗口、失败边界、降级路径和运行…

go-zero 面试的重点不是背“熔断、限流、缓存”四个名词，而是能说清统计窗口、失败边界、降级路径和运行时装配。 正文沿“高频题 -> 高难追问 -> 场景题”展开：先确认入口和状态归属，再跟踪控制流或数据流的推进，最后落到对外可观察的结果。

主要失效边界集中在“数据库连接数突然打满，怎么沿源码排查、服务发布后旧实例仍收到请求，怎么判断”这些场景。它们破坏的是容量、顺序、并发或生命周期前提；排查时应先确认状态是否仍由正确对象持有，再核对推进条件和清理路径。

## 高频题

### go-zero 的 breaker 和传统熔断器有什么不同？

**30 秒版**：它使用 Google SRE 风格滚动窗口计算丢弃概率，不是简单的 OPEN/CLOSE 状态切换。请求成功、失败和被丢弃都会进入窗口，系统还保留强制放行的探测通道。

**展开**：`newGoogleBreaker` 建立 10 秒 40 桶窗口，`accept` 根据失败桶、工作桶和成功数计算 `dropRatio`，再用概率决定拒绝：`core/breaker/googlebreaker.go:40-79`。

**加分项**：`Allow` 返回 Promise，调用方必须 `Accept` 或 `Reject`，而 `Do` 自动处理 panic 和结果上报：`core/breaker/breaker.go:30-45`。

**常见错答**：说成“失败率达到阈值后打开 30 秒”。源码实际是概率丢弃和探测放行。

### Redis 挂掉时 TokenLimiter 会怎样？

**30 秒版**：不会直接放行，而是切换到进程内 `x/time/rate` rescue limiter，并启动一个监控 goroutine 定期 Ping Redis。Redis 恢复后再回到分布式 Lua 路径。

**展开**：`reserveN` 在脚本错误时调用 `startMonitor` 并使用 `rescueLimiter`：`core/limit/tokenlimit.go:85-126`；`startMonitor` 用 mutex 保证只启动一个恢复监控：`core/limit/tokenlimit.go:129-141`。

**加分项**：context deadline/cancel 被单独识别为拒绝，不会把请求上下文错误误判成 Redis 故障恢复。

**常见错答**：说“Redis 故障后限流失效”。源码明确设计了 rescue。

### SingleFlight 为什么能防缓存击穿？

**30 秒版**：它按 key 选出一个 leader 执行回源，其他调用等待同一个 `WaitGroup` 并共享结果。缓存填充后下一次请求直接命中，不会重复打数据库。

**展开**：`createCall` 在 map 中登记进行中的 key；follower 解锁后等待；leader 完成时删除 key、写入结果并 `Done`：`core/syncx/singleflight.go:56-81`。

**加分项**：缓存的 `Take` 在进入 barrier 后还会双检，因为另一个请求可能已经填充缓存：`core/collection/cache.go:127-149`。

**常见错答**：把它理解成长期缓存。SingleFlight 只合并同一时刻的调用。

### zrpc 如何完成优雅停机？

**30 秒版**：启动时注册健康服务并标记 ready；收到关闭信号后先把健康状态置为 shutdown，阻止新流量，再调用 gRPC `GracefulStop` 等待在途请求完成。

**展开**：`rpcServer.Start` 在 `grpc.NewServer` 后注册 health 并 `MarkReady`：`zrpc/internal/rpcserver.go:53-67`；shutdown listener 中先 `s.health.Shutdown()` 再 `server.GracefulStop()`：`zrpc/internal/rpcserver.go:69-75`。

**加分项**：health 状态是生命周期的一部分，不等于端口是否仍然监听。

**常见错答**：只调用强制 `Stop`，会中断在途 RPC。

## 高难追问

### AdaptiveShedder 如何决定丢弃？

它维护 pass 和 RT 滑动窗口，并跟踪当前 flying 请求与平滑的 `avgFlying`。`maxFlight = maxPass * minRt * windowScale`，再乘 CPU overload factor；只有系统过载且并发超过上限时才丢弃：`core/load/adaptiveshedder.go:161-218`。

### 为什么缓存 not-found 也要写 Redis？

否则热点不存在 key 会持续 miss 并反复查询数据库，形成缓存穿透。`setCacheWithNotFound` 用占位符和较短 TTL：`core/stores/cache/cachenode.go:278-281`。

### goctl 生成为什么分很多阶段？

它先建立统一项目上下文，再按 etc、pb、config、svc、logic、server、main 生成：`tools/goctl/rpc/generator/gen.go:85-126`。阶段化让产物边界清晰，也方便单独替换某个输出阶段。

## 场景题

### 数据库连接数突然打满，怎么沿源码排查？

先看 cache miss、not-found 命中和 `SingleFlight` 的 key 是否过粗或失效；再看 `cacheNode.doTake` 是否把非 not-found 错误快速返回；最后检查 zrpc 的 breaker、shedding 和 timeout 是否开启。证据坐标是 `core/stores/cache/cachenode.go:208-255`、`zrpc/server.go:144-167`。

### 服务发布后旧实例仍收到请求，怎么判断？

检查健康探针是否在启动后 `MarkReady`、停机前 `Shutdown`，以及负载均衡是否消费 gRPC health 状态：`zrpc/internal/rpcserver.go:60-75`。

## 反向问面试官

- 你们的限流目标是单实例、租户级还是全局配额？
- RPC 健康状态是否真正接入了注册中心和负载均衡？
- 生成代码和手写业务代码的边界如何维护？

## Related

- [go-zero 总览](/notes/source/go/go-zero/)
- [整体架构](/notes/source/go/go-zero/architecture/)
- [缓存一致性与击穿保护](/notes/source/go/go-zero/cache/)
