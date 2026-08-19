---
title: 阻塞策略与失败重试
description: JobThread 单任务串行模型、三种阻塞策略、执行超时的线程语义，以及失败重试和告警的状态闭环。
category: Backend
tags:
  - Source Reading
  - XXL-JOB
  - Concurrency
  - Retry
order: 14
updatedDate: 2026-08-19
difficulty: advanced
status: stable
lastReviewed: 2026-08-19
draft: false
sidebar:
  order: 14
---

XXL-JOB 的“串行执行”不是调度中心排队，而是执行器为每个 `jobId` 建立一个常驻 `JobThread` 和一条队列。阻塞策略只决定新触发如何进入这条队列，失败重试则由 admin 侧扫描失败日志后重新走一次触发链。

<!-- more -->

## 先给答案：阻塞策略决定“同一任务的并发语义”，重试决定“失败是否再次制造压力”

同一个任务在上一次执行尚未结束时再次触发，系统必须先做选择：串行等待、丢弃新触发，还是终止旧执行让新执行接管。三种策略没有绝对优劣，它们分别保护顺序性、保护当前执行，或追求最新任务尽快生效。

失败重试则是另一条时间轴。它发生在一次执行已经结束之后，决定失败是否重新进入调度系统。若把阻塞策略和重试混在一起，就会误以为“重试次数越多越可靠”；实际上，非幂等任务可能被重复执行，持续失败还会形成重试风暴，所以重试必须和幂等性、退避、告警一起设计。


## 设计概览

```text
admin POST /trigger
        │
        ▼
ExecutorBizImpl#trigger
        ├─ 找 jobThread / 校验 handler
        ├─ SERIAL_EXECUTION ───────► 入队
        ├─ DISCARD_LATER ──忙──────► 立即失败
        └─ COVER_EARLY ───忙───────► 停旧线程、建新线程、入队
                                      │
                                      ▼
                         JobThread.poll(3s)
                              │
                         handler.execute()
                              │
                   finally push CallbackData
                              │
                 admin callback / 失败落盘重试
```

## `JobThread`：按任务隔离串行语义

`XxlJobExecutor` 的 `jobThreadRepository` 以 `jobId` 为键保存线程（`xxl-job-core/src/main/java/com/xxl/job/core/executor/XxlJobExecutor.java:388-414`）。首次触发时 `registJobThread` 先启动新线程，再用 `Map#put` 替换旧线程，并调用旧线程的 `toStop` 与 `interrupt`（同文件 `:389-400`）。

```text
jobThreadRepository
  42 ─► JobThread-42
          ├ handler
          ├ LinkedBlockingQueue<TriggerRequest>
          ├ triggerLogIdSet
          └ running / toStop
```

`JobThread#pushTriggerQueue` 先把 `logId` 放入 `ConcurrentHashMap.newKeySet()`，重复的同一调度日志直接返回失败（`xxl-job-core/src/main/java/com/xxl/job/core/thread/JobThread.java:54-70`）。消费后在 `poll` 成功处移除该 `logId`（同文件 `:106-113`），因此去重窗口覆盖“已入队但尚未执行”。

线程使用 `poll(3, TimeUnit.SECONDS)` 而不是 `take()`（`JobThread.java:105-108`），因为停止信号必须在有限时间内被检查。连续空闲超过 30 次且队列仍为空时，线程自毁（`JobThread.java:176-185`），把“每个 job 一个线程”的常驻成本降为按需创建。

## 三种阻塞策略

`ExecutorBlockStrategyEnum` 只保留 `SERIAL_EXECUTION`、`DISCARD_LATER`、`COVER_EARLY` 三项（`xxl-job-core/src/main/java/com/xxl/job/core/constant/ExecutorBlockStrategyEnum.java:6-29`）。策略在 `ExecutorBizImpl#trigger` 入队之前判定（`xxl-job-core/src/main/java/com/xxl/job/core/openapi/executor/impl/ExecutorBizImpl.java:132-158`）。

| 策略 | 忙时动作 | 语义 | 代价 |
| --- | --- | --- | --- |
| `SERIAL_EXECUTION` | 继续入队 | 同一任务按接收顺序串行 | 队列可能积压 |
| `DISCARD_LATER` | 返回失败 | 当前执行未结束就丢弃后来的触发 | 需要依赖失败重试或监控 |
| `COVER_EARLY` | 停旧线程并重建 | 新触发覆盖旧执行上下文 | 旧任务会收到失败回调，业务可能仍未真正停止 |

### 为什么没有直接并行执行

**替代方案**：同一个 `jobId` 每次触发都提交到共享线程池并行执行。
**为什么不行**：任务配置通常默认表达“同一任务的下一次不能和上一次重叠”。共享池无法自然表达单任务顺序，也无法让 `BUSYOVER` 精确判断某个 job 是否占用。
**证据**：`JobThread#isRunningOrHasQueue` 同时检查 `running` 和队列非空（`JobThread.java:84-86`），`ExecutorBizImpl#idleBeat` 正是依赖这个状态（`ExecutorBizImpl.java:33-44`）。

## 执行超时的真实语义

当 `executorTimeout > 0` 时，`JobThread#run` 创建 `FutureTask`，再创建一个 `future` 线程执行 handler，并用 `futureTask.get(timeout, SECONDS)` 等待（`xxl-job-core/src/main/java/com/xxl/job/core/thread/JobThread.java:131-158`）。超时只调用 `futureThread.interrupt()`（同文件 `:153-157`）。

这不是强制终止：如果业务代码不响应中断，原 handler 线程仍可能继续运行，而外层 `JobThread` 会进入回调流程。因此“超时”表示调度结果被标为超时，不等于业务线程已经停止。

## 失败重试与告警

```text
callback(handleCode <= 0)
        │
        ▼
xxl_job_log.handle_code = fail
        │  每 10s
        ▼
findFailJobLogIds(1000)
        │
        ├─ updateAlarmStatus(0 -> -1) 抢处理权
        ├─ retryCount > 0: 重新 trigger(RETRY, count-1)
        └─ JobAlarmer.alarm(...)
             └─ updateAlarmStatus(-1 -> 2/3)
```

`JobFailAlarmMonitorHelper` 每 10 秒取最多 1000 条失败日志（`xxl-job-admin/src/main/java/com/xxl/job/admin/business/scheduler/thread/JobFailAlarmMonitorHelper.java:35-49`），先用 `updateAlarmStatus(failLogId, 0, -1)` 抢占处理权（同文件 `:43-46`）。这个条件更新是多 admin 节点下的轻量 CAS：只有一个节点能把状态从 0 改成 -1。

重试触发使用原日志的 `executorShardingParam` 和 `executorParam`（同文件 `:50-56`），因此分片任务失败时只重试原分片，而不是再次广播全部节点。告警处理完成后把状态更新为 2 或 3（同文件 `:58-68`）。

## 关键取舍

### 为什么重试重新走 `JobTrigger`

**替代方案**：在失败监控线程里直接调用执行器的 `trigger`，绕过日志和路由。
**为什么不行**：重试必须重新记录触发消息、重新选择可用地址，并保留分片索引；绕过统一入口会让重试缺少审计信息，也会破坏路由策略。
**证据**：`JobFailAlarmMonitorHelper` 明确调用 `JobTriggerPoolHelper#trigger`（`JobFailAlarmMonitorHelper.java:50-56`），而 `JobTrigger#processTrigger` 会重新保存日志、组装 `TriggerRequest` 并更新 `trigger_code`（`xxl-job-admin/src/main/java/com/xxl/job/admin/business/scheduler/trigger/JobTrigger.java:134-244`）。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| handler 忽略 interrupt | 超时后业务仍在执行 | Java 无安全强杀线程机制 | handler 自己实现中断检查，避免不可中断 IO |
| `SERIAL_EXECUTION` 高频触发 | 队列越来越长 | 触发频率高于任务处理能力 | 调大间隔、拆分任务，或选择丢弃策略 |
| `COVER_EARLY` 覆盖长任务 | 旧任务收到失败但副作用仍存在 | `interrupt` 不是强杀 | 业务设计幂等、补偿与可取消 |
| 多 admin 同时扫描失败日志 | 重试次数异常增加 | 未先 CAS 锁定日志就处理 | 保留 `updateAlarmStatus(0,-1)` 这类条件更新 |
| 回调重复到达 | 子任务被重复触发风险 | 网络重试造成 at-least-once | admin 侧按 `handleCode > 0` 拒绝重复完成 |

## 可迁移知识

- **单键串行化**：按业务 key 建立独立队列，是订单、用户、设备等“同 key 有序”场景的通用模型。
- **超时与终止分离**：超时只能改变观察结果，不能假设执行已经停止；分布式任务必须接受这一区别。
- **条件更新抢处理权**：数据库 `UPDATE ... WHERE status = old` 可以作为不引入锁服务的轻量 CAS。
- **重试复用主链路**：重试应重新经过鉴权、路由、日志和幂等检查，而不是复制一条旁路逻辑。

> **面试锚点**
> - `JobThread` 为什么用 `poll(3s)` 而不是 `take()`？
> - `COVER_EARLY` 能不能真正杀掉正在执行的业务线程？
> - 失败重试如何避免多个 admin 节点重复处理？
> - 分片任务失败重试为什么不会再次广播所有节点？

## Related

- [整体架构](/notes/source/java/rpc/xxl-job/architecture/)
- [执行器注册与路由策略](/notes/source/java/rpc/xxl-job/registry-and-route/)
- [日志回捞与分片广播](/notes/source/java/rpc/xxl-job/log-and-sharding/)
- [面试专题](/notes/source/java/rpc/xxl-job/interview/)
