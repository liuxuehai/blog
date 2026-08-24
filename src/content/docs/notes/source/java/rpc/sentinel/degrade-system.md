---
title: 熔断、系统保护与授权
description: DegradeSlot、三态熔断器、SystemSlot、热点参数和 AuthoritySlot 的源码实现边界。
category: Backend
tags: [Source Reading, Sentinel, Circuit Breaker, System Protection]
order: 45
updatedDate: 2026-08-24
difficulty: advanced
status: stable
lastReviewed: 2026-08-24
draft: false
sidebar: { order: 45 }
---

<!-- more -->

## 先给答案：DegradeSlot、三态熔断器、SystemSlot、热点参数和 AuthoritySlot 的源码实…

DegradeSlot、三态熔断器、SystemSlot、热点参数和 AuthoritySlot 的源码实现边界。 正文沿“三类检查 -> 熔断状态机 -> 为什么这么设计”展开：先确认入口和状态归属，再跟踪控制流或数据流的推进，最后落到对外可观察的结果。

主要失效边界集中在“熔断器只在请求完成后得到 RT/异常结果；入口被 Flow 或 Authority 阻断不会贡献资源失败样本。、HALFOPEN 是探测窗口，不是“半数流量放行”。、系统规则使用全局入口 Node，不能用单个资源 Node 的 QPS 替代。”这些场景。它们破坏的是容量、顺序、并发或生命周期前提；排查时应先确认状态是否仍由正确对象持有，再核对推进条件和清理路径。

## 三类检查

```text
入口
  -> AuthoritySlot: origin / allow deny
  -> SystemSlot: 入站总 QPS、线程、RT、load、CPU
  -> FlowSlot: 资源配额
  -> DegradeSlot: 资源失败或慢请求

DegradeSlot.exit
  -> CircuitBreaker.onRequestComplete
  -> CLOSED / OPEN / HALF_OPEN
```

## 熔断状态机

```text
             threshold exceeded
       +------------------------------+
       |                              v
   CLOSED -------------------------> OPEN
      ^                                |
      | probe success                  | timeout
      |                                v
      +--------------------------- HALF_OPEN
                                      |
                         probe fail --+--> OPEN
```

`AbstractCircuitBreaker` 用 `AtomicReference<State>` 做状态转换。OPEN 期间拒绝请求；恢复时间到达后只允许探测请求进入 HALF_OPEN；探测成功关闭并重置统计，失败重新打开。

RT、异常比例和异常数分别由 `ResponseTimeCircuitBreaker`、`ExceptionCircuitBreaker` 维护自己的窗口计数，不直接复用资源总统计，从而让熔断阈值拥有独立的最小请求数和统计周期。

SystemRuleManager 的规则通过 Property 更新为最严格阈值；`checkSystem` 只检查入站流量，并从 `Constants.ENTRY_NODE` 读取全局 QPS、线程和 RT。load 检查还结合 BBR 风格的当前线程、最大成功 QPS 和最小 RT。

## 为什么这么设计

**替代方案一：** 所有阻断都使用同一种计数器。**问题：** 系统过载、资源错误和权限拒绝的恢复语义完全不同。**选择：** 按事实来源拆分 Slot 和状态。

**替代方案二：** OPEN 到期后允许所有请求恢复。**问题：** 故障依旧时会形成瞬时冲击。**选择：** HALF_OPEN 只放行探测请求。

**替代方案三：** 系统规则作用于所有 EntryType。**问题：** 出站调用会被误计入当前应用的入站容量。**选择：** `SystemRuleManager.checkSystem` 明确过滤 `EntryType.IN`。

## 源码坐标索引

- `DefaultCircuitBreakerSlot#entry` — `sentinel-core/src/main/java/com/alibaba/csp/sentinel/slots/block/degrade/DefaultCircuitBreakerSlot.java:41`
- `DefaultCircuitBreakerSlot#performChecking` — `sentinel-core/src/main/java/com/alibaba/csp/sentinel/slots/block/degrade/DefaultCircuitBreakerSlot.java:48`
- `DefaultCircuitBreakerSlot#exit` — `sentinel-core/src/main/java/com/alibaba/csp/sentinel/slots/block/degrade/DefaultCircuitBreakerSlot.java:68`
- `AbstractCircuitBreaker#tryPass` — `sentinel-core/src/main/java/com/alibaba/csp/sentinel/slots/block/degrade/circuitbreaker/AbstractCircuitBreaker.java:69`
- `AbstractCircuitBreaker#fromCloseToOpen` — `sentinel-core/src/main/java/com/alibaba/csp/sentinel/slots/block/degrade/circuitbreaker/AbstractCircuitBreaker.java:94`
- `AbstractCircuitBreaker#fromOpenToHalfOpen` — `sentinel-core/src/main/java/com/alibaba/csp/sentinel/slots/block/degrade/circuitbreaker/AbstractCircuitBreaker.java:105`
- `ResponseTimeCircuitBreaker#onRequestComplete` — `sentinel-core/src/main/java/com/alibaba/csp/sentinel/slots/block/degrade/circuitbreaker/ResponseTimeCircuitBreaker.java:62`
- `ExceptionCircuitBreaker#onRequestComplete` — `sentinel-core/src/main/java/com/alibaba/csp/sentinel/slots/block/degrade/circuitbreaker/ExceptionCircuitBreaker.java:65`
- `SystemSlot#entry` — `sentinel-core/src/main/java/com/alibaba/csp/sentinel/slots/system/SystemSlot.java:36`
- `SystemRuleManager#loadRules` — `sentinel-core/src/main/java/com/alibaba/csp/sentinel/slots/system/SystemRuleManager.java:122`
- `SystemRuleManager#checkSystem` — `sentinel-core/src/main/java/com/alibaba/csp/sentinel/slots/system/SystemRuleManager.java:290`
- `AuthoritySlot#check` — `sentinel-core/src/main/java/com/alibaba/csp/sentinel/slots/block/authority/AuthoritySlot.java:51`
- `ParamFlowSlot#entry` — `sentinel-extension/sentinel-parameter-flow-control/src/main/java/com/alibaba/csp/sentinel/slots/block/flow/param/ParamFlowSlot.java:38`

## 边界与踩坑

- 熔断器只在请求完成后得到 RT/异常结果；入口被 Flow 或 Authority 阻断不会贡献资源失败样本。
- HALF_OPEN 是探测窗口，不是“半数流量放行”。
- 系统规则使用全局入口 Node，不能用单个资源 Node 的 QPS 替代。
- 热点参数是扩展模块能力；它与资源级 FlowRule 的统计维度不同。

## 可迁移知识

熔断器的关键不是状态枚举，而是“触发统计、状态转换、探测放行、结果反馈”四个闭环。系统保护则更像容量守门，应该使用全局指标并明确流量方向。

> **面试锚点**：为什么需要 HALF_OPEN？系统规则和流控规则的统计 Node 有何不同？慢请求熔断为什么独立维护窗口？

## Related

- [集群流控与面试专题](/notes/source/java/rpc/sentinel/cluster-and-interview/)
- [熔断降级概念笔记](/notes/backend/sentinel/circuit-breaking/)
- [系统自适应保护](/notes/backend/sentinel/system-adaptive-protection/)
- [热点参数流控](/notes/backend/sentinel/hotspot-param-flow/)
