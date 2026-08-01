---
title: 熔断降级
description: Sentinel 熔断策略（慢调用比例、异常比例、异常数）、状态机与半开探测。
category: Backend
tags:
  - Sentinel
  - Circuit Breaking
  - Resilience
order: 542
updatedDate: 2024-09-22
difficulty: advanced
status: stable
lastReviewed: 2025-03-05
draft: false
sidebar:
  order: 542
---

熔断降级用于保护调用链路中不稳定的资源。当依赖服务出现不稳定时，响应时间变长会导致线程堆积，最终耗尽业务自身的线程池，服务本身也变得不可用。

<!-- more -->

## 熔断状态机

Sentinel 的熔断器采用三态模型：

```text
        统计窗口内满足熔断条件
CLOSED ──────────────────────────→ OPEN
  ↑                                  │
  │  探测请求成功                      │ 熔断时长到期
  │                                  ↓
  └──────────────────────── HALF-OPEN
                                  │
                                  │ 探测请求失败
                                  ↓
                                OPEN（再次熔断）
```

| 状态 | 说明 |
|------|------|
| **CLOSED** | 正常状态，请求正常通过 |
| **OPEN** | 熔断状态，请求被自动拒绝/降级 |
| **HALF-OPEN** | 探测恢复状态，允许有限请求通过以探测依赖是否恢复 |

**状态转换：**

1. **CLOSED → OPEN**：统计窗口内满足熔断条件
2. **OPEN → HALF-OPEN**：经过设定的熔断时长后自动转入
3. **HALF-OPEN → CLOSED**：探测请求成功则恢复
4. **HALF-OPEN → OPEN**：探测请求失败则再次熔断

## 三种熔断策略

### 1. 慢调用比例（SLOW_REQUEST_RATIO）

- 设置允许的慢调用 RT（最大响应时间），超过该值即统计为慢调用
- 统计时长内，若请求数 ≥ 最小请求数且慢调用比例超过阈值，则触发熔断
- 熔断持续 `timeWindow` 秒后进入 HALF-OPEN 状态
- HALF-OPEN 时，若下一个请求响应时间 < 慢调用 RT 则结束熔断，否则再次熔断

```java
DegradeRule rule = new DegradeRule();
rule.setResource("orderService");
rule.setGrade(RuleConstant.DEGRADE_GRADE_RT);       // 慢调用比例
rule.setCount(200);                                   // 慢调用 RT 阈值 200ms
rule.setSlowRatioThreshold(0.5);                      // 慢调用比例阈值 50%
rule.setTimeWindow(10);                               // 熔断时长 10 秒
rule.setMinRequestAmount(5);                          // 最小请求数
rule.setStatIntervalMs(10000);                        // 统计时长 10 秒
```

### 2. 异常比例（ERROR_RATIO）

- 统计时长内请求数 ≥ 最小请求数且异常比例超过阈值时触发熔断
- 阈值范围 `[0.0, 1.0]`，对应 0%~100%
- 熔断时长过后进入 HALF-OPEN 状态，下一个请求成功则恢复，否则再次熔断

```java
DegradeRule rule = new DegradeRule();
rule.setResource("paymentService");
rule.setGrade(RuleConstant.DEGRADE_GRADE_EXCEPTION_RATIO); // 异常比例
rule.setCount(0.5);                                         // 50% 异常率
rule.setTimeWindow(10);
rule.setMinRequestAmount(5);
rule.setStatIntervalMs(10000);
```

### 3. 异常数（ERROR_COUNT）

- 统计时长内异常数超过阈值时触发熔断
- HALF-OPEN 状态逻辑同异常比例策略

```java
DegradeRule rule = new DegradeRule();
rule.setResource("inventoryService");
rule.setGrade(RuleConstant.DEGRADE_GRADE_EXCEPTION_COUNT); // 异常数
rule.setCount(5);                                           // 5 次异常
rule.setTimeWindow(10);
rule.setMinRequestAmount(5);
rule.setStatIntervalMs(10000);
```

## 熔断规则字段

| 字段 | 说明 | 默认值 |
|------|------|--------|
| `resource` | 资源名 | — |
| `grade` | 熔断策略（慢调用比例 / 异常比例 / 异常数） | 慢调用比例 |
| `count` | 慢调用模式下为临界 RT；异常比例/异常数模式下为对应阈值 | — |
| `timeWindow` | 熔断时长（秒） | — |
| `minRequestAmount` | 触发熔断的最小请求数 | 5 |
| `statIntervalMs` | 统计时长（毫秒） | 1000 |
| `slowRatioThreshold` | 慢调用比例阈值（仅慢调用比例模式有效） | — |

## 业务异常统计

异常降级**仅针对业务异常**，对 Sentinel 自身的 `BlockException` 不生效。需通过 `Tracer.trace(ex)` 记录业务异常：

```java
Entry entry = null;
try {
    entry = SphU.entry(resource);
    // 业务代码
} catch (Throwable t) {
    if (!BlockException.isBlockException(t)) {
        Tracer.trace(t); // 记录业务异常
    }
} finally {
    if (entry != null) {
        entry.exit();
    }
}
```

使用 `@SentinelResource` 注解时会自动统计业务异常，无需手动调用。

## 熔断器事件监听

```java
EventObserverRegistry.getInstance().addStateChangeObserver("logging",
    (prevState, newState, rule, snapshotValue) -> {
        if (newState == State.OPEN) {
            log.warn("{} -> OPEN at {}, snapshotValue={}",
                prevState.name(), TimeUtil.currentTimeMillis(), snapshotValue);
        } else {
            log.info("{} -> {} at {}",
                prevState.name(), newState.name(), TimeUtil.currentTimeMillis());
        }
    });
```

变换至 OPEN 状态时会携带触发时的快照值（`snapshotValue`），便于监控和排查。

## 三种策略选型

| 策略 | 适用场景 | 特点 |
|------|----------|------|
| **慢调用比例** | 外部服务响应变慢 | 保护调用方线程不被慢接口耗尽 |
| **异常比例** | 服务不稳定，偶发异常 | 按比例触发，适合偶发故障 |
| **异常数** | 服务不稳定，异常有绝对数量 | 按数量触发，适合低流量场景 |

```text
选型决策：
  ├─ 关注响应时间 → 慢调用比例
  ├─ 关注异常率 → 异常比例
  └─ 关注异常绝对数 → 异常数
```

> 熔断降级是服务容错的最后一道防线。与流控不同，熔断针对的是"已经出现不稳定"的资源，目的是快速失败，防止级联故障。
