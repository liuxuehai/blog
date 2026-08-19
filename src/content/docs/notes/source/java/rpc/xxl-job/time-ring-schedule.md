---
title: DB 锁与秒级时间轮
description: FOR UPDATE 抢锁的事务边界、5 秒预读窗口、60 刻度时间轮为何不需要 remainingRounds、三分支判定与批量合并更新，以及不重不漏的四道防线。
category: Backend
tags:
  - Source Reading
  - XXL-JOB
  - Time Ring
  - Distributed Lock
order: 12
updatedDate: 2026-08-19
difficulty: advanced
status: stable
lastReviewed: 2026-08-19
draft: false
sidebar:
  order: 12
---

调度中心集群里，N 个节点同时盯着同一张 `xxl_job_info` 表。要保证「一个任务在一个触发时刻只被发出去一次」，XXL-JOB 用的不是分布式锁中间件，而是**一行 MySQL 记录 + `SELECT ... FOR UPDATE`**，配合一个只有 60 个槽的内存时间轮把秒级精度补回来。这一篇拆的就是这两百行。

<!-- more -->

## 先给答案：时间轮不是为了让任务更准，而是为了让大量“未来某时执行”的任务可批量管理

调度中心面对的不是一次定时器，而是持续到来的大量触发时间。逐个创建精确 Timer 会把管理成本分散到每个任务；时间轮则把时间离散成槽位，每次 tick 只扫描当前槽，再把任务重新放回未来轮次或交给执行线程。

这是一种明确的取舍：它用固定 tick 粒度换取可预测的调度开销，因此“到点”通常意味着进入触发流程，而不是业务代码已经执行完成。任务执行耗时、线程池拥塞、重试和阻塞策略都发生在时间轮之外，不能把调度触发延迟误认为执行成功。


## 问题背景

如果不做任何机制，最朴素的实现是「每秒扫一次 `WHERE trigger_next_time <= now()`」。三个问题立刻出现：

| 问题 | 后果 |
| --- | --- |
| 集群下 N 个节点同时扫到同一批任务 | 一次触发被执行 N 次 |
| 扫描 + 发 HTTP 请求耗时超过 1 秒 | 下一秒的任务被推迟，误差累积后彻底失准 |
| 每个任务触发后都要 `UPDATE` 一次下次触发时间 | 高频任务场景下 SQL 数量 = 任务数 × 频率，DB 先崩 |

XXL-JOB 的三个对策一一对应：**DB 行锁保证互斥** → **预读 + 时间轮把「判定」和「触发」解耦** → **批量合并更新把 N 条 UPDATE 压成 1 条**。

## 设计概览

```text
                 ┌──────────────── scheduleThread（每秒一轮）───────────────┐
                 │                                                         │
                 │  ① BEGIN                                                │
                 │  ② SELECT * FROM xxl_job_lock                           │
                 │       WHERE lock_name='schedule_lock' FOR UPDATE   ◄──── 集群互斥点
                 │  ③ SELECT ... WHERE trigger_next_time <= now+5000       │
                 │       ORDER BY id LIMIT preReadCount                    │
                 │  ④ for each job：三分支判定                              │
                 │       ├ now > next+5s  → misfire 策略 + 只刷新时间       │
                 │       ├ now >= next    → 立即丢进线程池 + 刷新时间       │
                 │       └ now <  next    → 推时间轮 (next/1000)%60 + 刷新  │
                 │  ⑤ scheduleBatchUpdate(每批 100 条 CASE WHEN)            │
                 │  ⑥ COMMIT  ◄────────────────────────────────────── 锁释放
                 │  ⑦ sleep(命中?1000:5000 - now%1000)  ← 对齐整秒          │
                 └─────────────────────────────────────────────────────────┘
                                          │ pushTimeRing
                                          ▼
      ringData : ConcurrentHashMap<Integer, List<Integer>>      // 秒 → jobId 列表
         0    1    2   ...  57   58   59
       ┌────┬────┬────┬───┬────┬────┬────┐
       │    │ 3  │    │   │ 7  │    │ 12 │      ← 只存 jobId，不存任何时间信息
       └────┴────┴────┴───┴────┴────┴────┘
                                          ▲
                 ┌────────────────────────┴──── ringThread（严格每秒）──────┐
                 │  sleep(1000 - now%1000)          对齐整秒                │
                 │  nowSecond = Calendar.SECOND                             │
                 │  for i in 0..2:  remove((nowSecond+60-i)%60)  ◄── 补漏    │
                 │  distinct()                                  ◄── 去重    │
                 │  for jobId: fastPool/slowPool.execute(trigger)           │
                 └─────────────────────────────────────────────────────────┘
```

## 实现拆解

### 1. 抢锁：事务边界就是临界区

`JobScheduleHelper.java:79-81` 手动开启事务并立刻抢锁：

```java
transactionStatus = ...getTransactionManager().getTransaction(new DefaultTransactionDefinition());
String lockedRecord = ...getXxlJobLockMapper().scheduleLock();
```

SQL 本体只有三行（`XxlJobLockMapper.xml:6-10`）：

```sql
SELECT * FROM xxl_job_lock
WHERE lock_name = 'schedule_lock'
FOR UPDATE
```

`xxl_job_lock` 表结构极简——只有 `lock_name VARCHAR(50) PRIMARY KEY` 一列，初始化时插入一行 `schedule_lock`（`doc/db/tables_xxl_job.sql:123-129`、`:189`）。`FOR UPDATE` 在 InnoDB 上对主键索引加**行级排他锁**，其余节点在这一句上阻塞。

**关键在于锁的持有时长**：`commit` 写在 `finally` 里（`JobScheduleHelper.java:163-171`），也就是说**扫描、三分支判定、推时间轮、批量回写全部在锁内**。这是个刻意的设计——把「读到的下次触发时间」和「写回的下次触发时间」放在同一个事务里，才能保证别的节点读到的一定是更新后的值，从而不会重复触发。

> 代码注释直接标了目的：`// avlid schedule repeat`（`:167`，原文拼写如此）。

### 2. 预读：为什么是 5 秒

```java
public static final long PRE_READ_MS = 5000;                                        // :30
int preReadCount = (getTriggerPoolFastMax() + getTriggerPoolSlowMax()) * 10;         // :67
List<XxlJobInfo> scheduleList = ...scheduleJobQuery(nowTime + PRE_READ_MS, preReadCount);  // :85
```

对应 SQL（`XxlJobInfoMapper.xml:222-229`）：

```sql
SELECT ... FROM xxl_job_info AS t
WHERE t.trigger_status = 1
  AND t.trigger_next_time <= #{maxNextTime}
ORDER BY id ASC
LIMIT #{pagesize}
```

按默认配置 `fast.max=300` / `slow.max=200`，`preReadCount = (300+200)*10 = 5000`——**一轮最多处理 5000 个任务**。系数 `10` 的含义写在注释里：「trigger-qps: 1000ms / 100ms each trigger cost」，即假设单次触发耗时 100ms、一个线程一秒能做 10 次。

> v3.3.0 Release Notes 第 7 条：「调度快慢线程池默认配置上调，提升默认配置单机负载；**调度预读任务数计算系数下调，降低事务颗粒度，提升性能及稳定性**」。系数从更大的值降到 10，正是因为预读越多、锁持有越久、集群吞吐越差。

### 3. 三分支判定

`JobScheduleHelper.java:89-141` 是整个调度的决策树：

```text
for each jobInfo in scheduleList:

  now > next + 5000 ?  ──是──►  ① 过期太久
  │                              MisfireStrategyEnum.match(...).handle(jobId)      :96-97
  │                              refreshNextTriggerTime(job, new Date())           :100
  │                                    ↑ 注意基准是「现在」，被跳过的时刻直接丢弃
  否
  ▼
  now >= next ?        ──是──►  ② 刚好到期（0~5s 内过期）
  │                              jobTriggerPoolHelper.trigger(...)  直接进线程池   :106
  │                              refreshNextTriggerTime(job, new Date())           :110
  │                              如果新的 next 仍在 5s 内 → 顺手推一次时间轮        :113-124
  否
  ▼
  ③ 未来 5 秒内
     ringSecond = (next / 1000) % 60                                              :131
     pushTimeRing(ringSecond, jobId)                                              :134
     refreshNextTriggerTime(job, new Date(next))                                  :138
           ↑ 注意基准是「原定的 next」，保证 cron 序列不漂移
```

**两个 `refreshNextTriggerTime` 的基准时间不同**，这是最容易看漏的一处：

| 分支 | 基准 | 后果 |
| --- | --- | --- |
| ①② 已到期 | `new Date()`（当前时刻） | 从现在重新起算，被跳过的触发点永久丢失 |
| ③ 未到期 | `new Date(jobInfo.getTriggerNextTime())`（原定时刻） | cron 序列严格延续，不会因为调度延迟而整体后移 |

分支 ② 里那个「顺手再推一次时间轮」的嵌套逻辑（`:113-124`）容易被误读成重复触发。它的实际语义是：**一个 5 秒扫描窗口里可能容纳同一个高频任务的多次触发**（比如 `FIX_RATE=2` 秒的任务），直发一次之后，下一次触发点仍落在窗口内，就必须推进时间轮，否则要等到下一轮扫描才能发现，已经晚了。

### 4. `refreshNextTriggerTime` 与 `-1` 哨兵

```java
if (nextTriggerTime != null) {
    jobInfo.setTriggerStatus(-1);              // pass, may be Inaccurate     :274
    jobInfo.setTriggerLastTime(jobInfo.getTriggerNextTime());
    jobInfo.setTriggerNextTime(nextTriggerTime.getTime());
} else {
    jobInfo.setTriggerStatus(TriggerStatus.STOPPED.getValue());   // 停掉任务   :279
    ...
}
```

`triggerStatus = -1` 不是一个真实状态，而是**「本次不要动这一列」的哨兵**。批量 SQL 里对它做了判定（`XxlJobInfoMapper.xml:258-269`）：

```sql
trigger_status = CASE id
  <foreach ...>
    WHEN #{item.id} THEN
      <choose>
        <when test="item.triggerStatus gte 0">#{item.triggerStatus}</when>
        <otherwise>trigger_status</otherwise>     ← 保持原值
      </choose>
  </foreach>
END
```

用一个负数在**同一个字段**里同时表达「新值」和「别改」，省掉了一个 flag 字段和一条分支 SQL。代价是可读性——注释 `pass, may be Inaccurate` 完全没解释清楚。

生成下次时间的策略在 `type/strategy/` 下：`CronScheduleType` 走 `new CronExpression(conf).getNextValidTimeAfter(fromTime)`（`CronScheduleType.java:14`，`CronExpression` 是从 Quartz 抠出来的 1693 行独立实现）；`FixRateScheduleType` 是 `fromTime + conf*1000`，并额外把毫秒抹平到整秒（`FixRateScheduleType.java:15-20`）——**因为时间轮的刻度是秒，毫秒残余会导致 `(next/1000)%60` 落错槽**。

### 5. 批量合并更新

v3.4.0 之前是循环里一条条 `scheduleUpdate`（源码里还留着注释掉的旧代码，`JobScheduleHelper.java:145-147`）。现在：

```java
int batchSize = ...getScheduleBatchSize();                                    // :148
List<List<XxlJobInfo>> batches = CollectionTool.split(scheduleList, batchSize);
for (List<XxlJobInfo> batch : batches) {
    ...getXxlJobInfoMapper().scheduleBatchUpdate(batch);                      // :151
}
```

SQL 用 `CASE id WHEN ... THEN ...` 三段拼装（`XxlJobInfoMapper.xml:243-273`），一条语句更新 100 行的三个字段。

> v3.4.0 Release Notes 第 2 条：「**任务合并调度：任务调度后批量合并更新，高频调度场景可百倍降低 SQL 操作合并执行，提升调度性能**」。默认 `xxl.job.schedule.batchsize=100`，取值被钳制在 `[50, 500]`（`XxlJobAdminBootstrap.java:258-263`）。

### 6. ringThread：三刻度补漏 + 单刻度去重

```java
sleep(1000 - System.currentTimeMillis() % 1000);                         // :207 对齐整秒
int nowSecond = Calendar.getInstance().get(Calendar.SECOND);             // :219
for (int i = 0; i <= 2; i++) {
    List<Integer> ringItemList = ringData.remove((nowSecond + 60 - i) % 60);   // :221
    if (isNotEmpty(ringItemList)) {
        List<Integer> distinct = ringItemList.stream().distinct().toList();     // :224
        ...
    }
}
```

源码里的两条中文注释就是设计说明：

> `// 避免调度遗漏：处理耗时太长、跨过刻度，除当前刻度外 + 向前校验2个刻度；`（`:220`）
> `// 避免调度重复：重复推送时间轮刻度，去重只保留一个；`（`:224`）

对应 v3.3.0 Release Notes 第 5 条：「**调度时间轮组件强化，保障不重不漏：调度时间轮单刻度数据去重，避免极端情况下任务重复执行；时间轮转动时校验临近刻度，避免极端情况下遗漏刻度**」。

「向前校验 2 个刻度」意味着：即便 ringThread 因为 GC 或触发耗时卡了 2 秒，之前两秒堆积的任务仍会在下一次醒来时被一次性捞走，只是延迟了，不会丢。而 `remove` 而非 `get` 保证了同一刻度不会被处理两次。

### 7. 快慢线程池分流

`JobTriggerPoolHelper#trigger` 在提交前先看这个 jobId 最近一分钟超时了几次：

```java
ThreadPoolExecutor triggerPool_ = fastTriggerPool;
AtomicInteger jobTimeoutCount = jobTimeoutCountMap.get(jobId);
if (jobTimeoutCount != null && jobTimeoutCount.get() > 10) {   // 1 分钟内超时 10 次
    triggerPool_ = slowTriggerPool;                            // :108-112
}
```

统计在 `finally` 里做（`:128-142`）：耗时 `> 500ms` 记一次；`minTim` 变化（跨分钟）就整体 `clear()`。

```text
                     ┌── cost > 500ms 累计 > 10 次/分钟 ──┐
   trigger(jobId) ───┤                                    ├──► slowTriggerPool  (10~200, queue 5000)
                     └── 否则 ──────────────────────────────┴──► fastTriggerPool  (10~300, queue 2000)
```

这是一个**极简版的舱壁隔离（Bulkhead）**：慢任务（通常是执行器不响应、TCP 超时）被自动关进单独的池子，不会把队列占满导致正常任务也发不出去。判定维度是「调度耗时」而不是「执行耗时」——因为 `trigger()` 只负责发 HTTP，执行时长由执行器承担。

## 关键取舍

### 为什么用 DB 悲观锁，而不是 Redis 分布式锁或选主

**替代方案 A：Redis / ZooKeeper 分布式锁。**
**为什么不行**：会给调度中心引入一个新的强依赖中间件。XXL-JOB 的核心定位是「开箱即用的轻量级调度平台」，而 MySQL 是它**已经无法回避**的依赖（任务定义、日志、注册表都在 DB 里）。多引入一个组件意味着多一份运维成本和多一个故障源，收益却只是把一次行锁换成一次网络往返。

**替代方案 B：选主（一个节点负责全部调度）。**
**为什么不行**：主节点故障时有切换空窗期，且需要额外的选主协议。而 `FOR UPDATE` 天然具备「持锁节点崩溃 → 事务回滚 → 锁自动释放 → 下一个节点接管」的语义，故障恢复时间等于 InnoDB 的锁等待超时，不需要写一行额外代码。

**替代方案 C：Quartz 式抢占（抢到锁的节点独自执行全部任务）。**
**为什么不行**：这正是 XXL-JOB 要解决的问题。官方文档 5.4.1 节：「quartz 底层以'抢占式'获取 DB 锁并由抢占成功节点负责运行任务，会导致节点负载悬殊非常大；而 XXL-JOB 通过执行器实现'协同分配式'运行任务，充分发挥集群优势，负载各节点均衡。」

**证据**：v2.1.0 Release Notes 把整个循环写成一句话——「调度：集群竞争，负载方式协同处理，**锁竞争 - 更新触发信息 - 推送时间轮 - 锁释放 - 锁竞争**」。注意「推送时间轮」在「锁释放」之前，「触发」则在锁外由线程池异步做。**锁保护的是「谁来决定触发时刻」，不是「谁来执行」**，这是它和 Quartz 的分水岭。

### 为什么时间轮不需要 `remainingRounds`

Netty 的 `HashedWheelTimer` 每个 `HashedWheelTimeout` 都带一个 `remainingRounds` 字段，因为任务的延迟可能远超一整圈的时长，必须记录「还要转几圈才轮到你」。XXL-JOB 的 `ringData` 里只有 `List<Integer>`——纯 jobId，**没有任何轮次信息**。

**为什么可以这样**：因为推入时间轮的任务全部来自「未来 5 秒内」的预读窗口（`nowTime + PRE_READ_MS`，`:85`），而轮子有 60 个刻度。`5 ≪ 60`，任何时刻轮子里的数据最多只占用连续 6 个刻度，**永远不可能绕回来撞上自己**。轮次歧义在物理上被排除了。

**代价**：时间轮完全不能独立工作，它只是 scheduleThread 的一个 5 秒缓冲区。一旦 scheduleThread 停摆（比如抢不到锁、DB 抖动），轮子会在 5 秒内被排空并陷入静默——这也是为什么 `stop()` 要在时间轮非空时额外等 10 秒（`:346-352`）。

### 为什么把「判定」和「触发」拆成两个线程

**替代方案**：scheduleThread 扫到就直接发 HTTP。
**为什么不行**：发 HTTP 是在**持有 DB 行锁**的状态下进行的。执行器网络不通时单次触发要等 3 秒超时（`xxl.job.timeout=3`），5000 个任务串行发就是 4 小时——整个集群的调度会被一个不健康的执行器彻底堵死。
**证据**：拆分后，锁内只做「内存里推一下 `ringData`」（`pushTimeRing`，`:302-311`，纯 `ConcurrentHashMap` 操作），真正的网络 IO 由 ringThread → 线程池在锁外异步做。这就是把**临界区里的 IO 全部移出去**的标准手法。

## 参数与调优

| 参数 | 默认值 | 实际生效范围 | 含义 | 什么时候要改 |
| --- | --- | --- | --- | --- |
| `PRE_READ_MS` | 5000（硬编码） | — | 预读窗口 | 不可配。改它要同时评估时间轮 60 刻度是否还够 |
| `xxl.job.triggerpool.fast.max` | 300 | `max(配置值, 200)` | 快池最大线程 | 任务数多、触发密集时上调；**调到 200 以下无效** |
| `xxl.job.triggerpool.slow.max` | 200 | `max(配置值, 100)` | 慢池最大线程 | 存在大量不健康执行器时上调 |
| `xxl.job.schedule.batchsize` | 100 | `[50,500]`，越界回落 100 | 合并更新批大小 | 高频任务多时上调；DB 单条 SQL 过大时下调 |
| `xxl.job.timeout` | 3（秒） | — | admin→executor HTTP 超时 | 执行器 `trigger` 只入队不执行，正常应远小于 1s；调大通常是在掩盖问题 |
| 超时判定阈值 | 500ms（硬编码 `:137`） | — | 进慢池的单次耗时门槛 | 不可配 |
| 超时次数阈值 | 10 次/分钟（硬编码 `:110`） | — | 进慢池的频次门槛 | 不可配 |

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| 任务数超过 `preReadCount` | 部分任务长期不触发或严重延迟 | `scheduleJobQuery` 有 `LIMIT` 且 `ORDER BY id ASC`，**id 小的任务优先**，超出部分要等下一轮 | 上调 `fast.max`/`slow.max`（`preReadCount` 是它们的 10 倍）或横向拆分调度中心 |
| 调度中心停机 10 分钟后重启 | 期间所有触发点全部消失 | 走 misfire 分支，`refreshNextTriggerTime(job, new Date())` 以**当前时间**重算 | 关键任务把过期策略设为 `FIRE_ONCE_NOW`——注意它也**只补一次**，不是把 10 分钟的都补上 |
| `FIX_RATE` 任务的实际间隔略大于配置 | 配 2 秒，实测 2.0x 秒 | `FixRateScheduleType` 会把毫秒抹平并 `+1` 秒（`:18-20`），永远向上取整到下一个整秒 | 接受它。秒级调度不保证毫秒精度 |
| DB 主从延迟 / 长事务 | 调度整体卡住，日志无异常 | `FOR UPDATE` 在等锁，被别的长事务堵住 | 调度库独立部署；避免在同库跑大批量 DDL/报表 |
| 一个任务的 cron 写成 `* * * * * ?` 且执行器不可达 | 该任务迅速进慢池，但仍占 5000 个预读名额 | 预读名额按 `trigger_next_time` 排，不感知健康度 | 先停掉任务再排查执行器 |
| `ringData` 的推入与消费竞争 | 理论上单个 jobId 的某次触发被丢弃 | `pushTimeRing` 的 `computeIfAbsent` 拿到列表引用后，若 ringThread 恰好 `remove` 了该键并处理完，随后的 `add` 就写进了一个已被摘除的列表 | 窗口极窄（只发生在推入刻度 == 当前处理刻度时），且下一周期的预读会重新算出触发时间；生产上表现为极偶发的单次跳过 |
| 时间轮里堆着任务时强制 `kill -9` | 这批任务丢失 | 优雅停机逻辑（`:336-352`）需要正常走 `DisposableBean#destroy` | 用 `SIGTERM`，并给容器至少 15 秒的 `terminationGracePeriodSeconds` |

## 可迁移知识

| 手法 | 在这里的样子 | 别处怎么用 |
| --- | --- | --- |
| **临界区里不做 IO** | 锁内只推内存 Map，HTTP 全部移到锁外的线程池 | 任何持锁逻辑的第一条准则。把「决策」和「执行」拆成两个阶段，是缩短临界区最通用的手法 |
| **用已有依赖实现互斥** | `SELECT ... FOR UPDATE` 一行表，不引入 Redis/ZK | 系统已经强依赖 DB 时，DB 行锁往往是**成本最低且故障语义最清晰**的分布式锁：进程崩溃 → 事务回滚 → 锁自动释放，不需要处理续期与脑裂 |
| **用问题域约束简化数据结构** | 5 秒窗口 ≪ 60 刻度 ⇒ 时间轮不需要 `remainingRounds` | 通用实现（Netty 时间轮）在特定约束下往往能砍掉一整个维度。先问「我的输入范围是什么」，再决定要不要用通用方案 |
| **同一字段用负数当哨兵** | `triggerStatus = -1` 表示「本次不要改这一列」 | 批量 UPDATE 场景下能省掉一个 flag 列，但必须写清注释——xxl-job 这里就是反面教材 |
| **补漏 + 去重 = 不重不漏** | 向前多看 2 刻度（防漏）+ 单刻度 `distinct`（防重） | 任何「按时间分桶的消费」都需要这一对：多看几个桶保证 at-least-once，桶内去重保证 at-most-once，合起来才是 exactly-once 的工程近似 |
| **按耗时自动分池** | 超时 10 次/分钟的 jobId 自动降级到 slow 池 | 舱壁隔离不一定要静态配置。用运行时指标（耗时、失败率）自动分流，比人工维护名单可靠得多 |

> **面试锚点**
> - `xxl_job_lock` 表只有一行，锁的持有时间覆盖了哪些操作？为什么 HTTP 请求不在里面？
> - 为什么 XXL-JOB 的时间轮不需要 Netty 那样的 `remainingRounds`？
> - 预读为什么是 5 秒？`preReadCount` 是怎么算出来的，调大 `fast.max` 会有什么连带影响？
> - 「向前校验 2 个刻度」和「单刻度去重」分别在防什么？少了任何一个会发生什么？
> - 三分支判定里，两次 `refreshNextTriggerTime` 的基准时间为什么不同？

## Related

- [整体架构](/notes/source/java/rpc/xxl-job/architecture/)：这条链路在全局时序里的位置（步骤 ①~⑥）
- [执行器注册与路由策略](/notes/source/java/rpc/xxl-job/registry-and-route/)：时间轮吐出 jobId 之后，请求发给谁
- [阻塞策略与失败重试](/notes/source/java/rpc/xxl-job/block-and-retry/)：misfire 与 fail-retry 的区别
- [面试专题](/notes/source/java/rpc/xxl-job/interview/)
- [Disruptor 环形队列与序号栅栏](/notes/source/java/base/disruptor/ring-buffer/)：另一种「环形 + 取模」结构，对照两者在容量、并发与丢失语义上的差异
