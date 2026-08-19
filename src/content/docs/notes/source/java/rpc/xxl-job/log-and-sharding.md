---
title: 日志回捞与分片广播
description: 执行器本地日志、fromLineNum 增量回捞、回调消息队列与磁盘降级，以及分片广播的扇出和重试退化。
category: Backend
tags:
  - Source Reading
  - XXL-JOB
  - Logging
  - Sharding
order: 15
updatedDate: 2026-08-19
difficulty: advanced
status: stable
lastReviewed: 2026-08-19
draft: false
sidebar:
  order: 15
---

XXL-JOB 不把任务输出持续写入数据库，而是让执行器按 `logId` 落本地文件，控制台需要时再按行号增量读取。任务结果则走异步回调，内存队列承载正常流量，admin 不可达时落到 `callbacklogs/`，把网络故障转换成可恢复的本地文件。

<!-- more -->

## 先给答案：日志回捞和分片广播解决的是“异步执行后如何找回证据与覆盖数据”

调度中心发起执行后，真正的业务代码在执行器进程中运行，结果和日志天然不在同一个地方。日志回捞通过“执行器本地文件 + admin 增量读取”把异步过程重新拼成可查询证据；回调则把执行状态带回调度中心，完成任务实例闭环。

分片广播解决的不是普通负载均衡，而是“同一个逻辑任务必须让多个节点各处理一部分数据”。因此 `分片序号/总分片数` 是业务分片的输入，不是调度器替业务决定的数据范围。节点扩缩容、重试和重复回调都会改变分片执行的稳定性，任务本身必须能处理重复和分片变化。


## 日志数据流

```text
JobThread
  └─ XxlJobContext(logId, logDateTime, logFileName)
       └─ XxlJobHelper.log -> XxlJobFileAppender.appendLog
                                      │
                                      ▼
                         executor logPath/yyyy-MM-dd/logId.log
                                      │
admin 控制台 ── LogRequest(logId, date, fromLineNum) ──► ExecutorBizImpl#log
                                      │
                                      ▼
                         readLog -> LogData(from, to, content, end)
```

## 本地日志与增量读取

`JobThread` 在消费触发请求时用 `logDateTime` 和 `logId` 生成文件名，并把它放进 `XxlJobContext`（`xxl-job-core/src/main/java/com/xxl/job/core/thread/JobThread.java:113-126`）。业务调用 `XxlJobHelper.log` 时，最终由 `XxlJobFileAppender.appendLog` 追加写入（`xxl-job-core/src/main/java/com/xxl/job/core/context/XxlJobHelper.java:188-191`；`XxlJobFileAppender.java:104-115`）。

控制台回捞请求只携带 `logId`、日期和 `fromLineNum`（`xxl-job-core/src/main/java/com/xxl/job/core/openapi/executor/dto/LogRequest.java:13-44`）。`ExecutorBizImpl#log` 重建文件名后调用 `readLog`（`xxl-job-core/src/main/java/com/xxl/job/core/openapi/executor/impl/ExecutorBizImpl.java:175-181`）。读取器跳过小于起始行号的内容，返回 `fromLineNum`、`toLineNum` 和 `isEnd`（`xxl-job-core/src/main/java/com/xxl/job/core/log/XxlJobFileAppender.java:126-171`）。

这是一个适合浏览器轮询的增量协议：客户端保存 `toLineNum`，下一次从该位置继续读；任务仍在运行时 `isEnd=false`，完成后文件自然不再增长。

## 回调的三级降级

```text
JobThread finally
      │ pushCallback
      ▼
MessageQueue(batch <= 50, interval 1ms)
      │
      ├─ admin A callback 成功 ─► 完成
      ├─ admin A 失败，admin B 成功 ─► 完成
      └─ 全部失败 ─► callbacklogs/xxl-job-callback-{md5}.log
                                      │ 每 30s
                                      ▼
                              读文件、删文件、重试
```

`TriggerCallbackThreadHelper#start` 创建 `MessageQueue`，批量上限是 50，消费间隔参数为 1（`xxl-job-core/src/main/java/com/xxl/job/core/thread/TriggerCallbackThreadHelper.java:63-73`）。队列生产失败时，`pushCallBack` 退化为当前线程直接调用 `doCallback`（同文件 `:140-146`），避免回调静默丢失。

`doCallback` 会遍历全部 admin 代理，任一成功即停止（同文件 `:153-180`）。全部失败后把整个批次 JSON 序列化，使用 MD5 作为文件名的一部分写入本地（同文件 `:213-237`）。重试线程每 `Const.BEAT_TIMEOUT` 即 30 秒扫描目录，读出文件后先删除，再重新调用 `doCallback`（同文件 `:78-120`）。

先删后重试意味着：进程在“删文件后、重试前”崩溃，文件中的回调可能丢失。这是实现中的明确风险，不应把它描述成持久化事务。生产上应依赖 admin 的“结果丢失监控”兜底，并保证任务业务幂等。

## admin 侧完成与重复回调

admin 收到回调后放入 `callbackThreadPool`，接口先返回成功（`xxl-job-admin/src/main/java/com/xxl/job/admin/business/scheduler/thread/JobCompleteHelper.java:103-125`）。真正处理时先按 `logId` 加载日志；若 `handleCode > 0`，返回重复回调，不再触发子任务（同文件 `:127-136`）。否则合并 handle message，调用 `JobCompleter#complete`（同文件 `:138-153`）。

`JobCompleter#complete` 先处理成功后的子任务，再更新 `handle_code`（`xxl-job-admin/src/main/java/com/xxl/job/admin/business/scheduler/complete/JobCompleter.java:39-60`）。因此重复回调的防线在 admin 数据库状态，而不是依赖网络层 exactly-once。

## 分片广播

```text
registryList = [A, B, C]
       │
JobTrigger#trigger(SHARDING_BROADCAST)
       ├─ processTrigger(index=0,total=3) -> A -> "0/3"
       ├─ processTrigger(index=1,total=3) -> B -> "1/3"
       └─ processTrigger(index=2,total=3) -> C -> "2/3"
                              │
                              ▼
                  XxlJobContext.broadcastIndex/Total
```

`JobTrigger#trigger` 检测到 `SHARDING_BROADCAST` 后按注册地址数量循环调用 `processTrigger`（`xxl-job-admin/src/main/java/com/xxl/job/admin/business/scheduler/trigger/JobTrigger.java:99-110`）。每个分片都会独立保存一条 `xxl_job_log`（同文件 `:148-163`），并把 `broadcastIndex` 与 `broadcastTotal` 写入 `TriggerRequest`（同文件 `:164-170`）。

广播模式不调用普通 `ExecutorRouter`，而是直接用 `registryList[index]` 取地址（同文件 `:174-188`）。普通失败重试传回原来的 `executorShardingParam`（`JobFailAlarmMonitorHelper.java:50-56`），于是重试走单分片路径，而不会再次扇出成 N 倍。

## 关键取舍

### 为什么日志放执行器本地而不是每行写 DB

**替代方案**：任务每写一行日志就同步插入数据库。
**为什么不行**：日志是高频、长文本、强时序数据，逐行写数据库会把任务执行路径绑定到 DB 吞吐，并放大事务和索引成本。
**证据**：`XxlJobHelper.log` 直接调用 `XxlJobFileAppender.appendLog`（`XxlJobHelper.java:188-191`），admin 只在触发时写一行日志、在回调时更新结果；日志回捞通过 `LogRequest.fromLineNum` 增量读取（`ExecutorBizImpl.java:175-181`）。

### 为什么广播每个分片独立建日志

**替代方案**：一次广播只建一条父日志，再在日志内容里记录各节点结果。
**为什么不行**：每个节点可能独立成功、失败或重试；单条日志无法表达部分完成，也无法让失败重试只定位到失败分片。
**证据**：`processTrigger` 每次调用都执行 `xxlJobLogMapper.save`（`JobTrigger.java:148-155`），并把 `index/total` 写入每个 `TriggerRequest`（同文件 `:164-170`）。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| 执行器磁盘满 | 任务日志写失败，结果可能变成失败 | 日志文件是执行器本地资源 | 监控磁盘和日志保留天数，设置独立日志盘 |
| 回调文件先删后重试时进程崩溃 | admin 长时间停留在运行中 | 文件重试不是事务 | 依赖 admin 10 分钟结果丢失监控，任务结果可补偿 |
| 多 admin 地址都不可达 | 回调不断落盘 | `doCallback` 只在代理成功后停止 | 保证 admin 地址列表可达，监控 callbacklogs 大小 |
| 广播期间扩容 | 新节点不会自动加入本次广播 | 广播快照来自当前 `registryList` | 下一次触发才纳入，任务逻辑不要假设分片总数永恒不变 |
| 广播节点部分失败 | 只有失败分片重试 | 每片独立日志和 `index/total` | handler 按分片参数幂等，避免重复处理 |
| `fromLineNum` 使用错误 | 日志重复或跳行 | 客户端没有正确保存 `toLineNum` | 以服务端返回的行号作为下一次起点 |

## 可迁移知识

- **本地文件作为网络失败缓冲**：适合小批量、可重放、最终一致的回调消息，但必须明确删除与重试的崩溃窗口。
- **增量读取协议**：用游标而不是整文件传输，适用于日志、对象存储分片和长轮询响应。
- **广播拆成独立子任务**：每个分片拥有独立状态，才能实现部分失败重试和可观测性。
- **幂等优先于 exactly-once**：网络回调通常只能做到 at-least-once，接收端按状态拒绝重复完成才是工程闭环。

> **面试锚点**
> - XXL-JOB 的日志为什么不直接写数据库？
> - 回调失败时如何降级？先删文件再重试有什么风险？
> - `fromLineNum` 如何实现增量日志回捞？
> - 分片广播为什么每个分片都要单独建日志？失败重试如何避免再次广播？

## Related

- [整体架构](/notes/source/java/rpc/xxl-job/architecture/)
- [阻塞策略与失败重试](/notes/source/java/rpc/xxl-job/block-and-retry/)
- [执行器注册与路由策略](/notes/source/java/rpc/xxl-job/registry-and-route/)
- [面试专题](/notes/source/java/rpc/xxl-job/interview/)
