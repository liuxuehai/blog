---
title: 整体架构
description: admin/executor 双进程分层、10 条后台线程全景、启动与调度两条主流程时序、五类扩展点与线程模型的边界。
category: Backend
tags:
  - Source Reading
  - XXL-JOB
  - Architecture
order: 11
updatedDate: 2026-08-23
difficulty: advanced
status: stable
lastReviewed: 2026-08-23
draft: false
sidebar:
  order: 11
---

XXL-JOB 没有「框架层」，它是**两个 Spring 应用 + 一条 POST/JSON 协议**。理解它的架构等价于回答三个问题：调度中心里跑着哪些线程、执行器里跑着哪些线程、以及这两组线程之间只允许发生哪 8 种交互。

<!-- more -->

## 先给答案：XXL-JOB 的架构问题不是"怎么触发定时任务"，而是"调度权归谁"

它把调度决策整个放在 admin 一侧：预读时间窗口、选择路由、判定失败与重试、回捞日志都由调度中心完成；执行器只暴露一条 HTTP/JSON 接口，接受"执行、终止、查询日志"这类指令，自己不做任何时间判断。`xxl-job-core` 定义两侧共享的协议契约，admin 与 executor 各实现一半、代理另一半，所以架构图上真正要记住的是两侧之间允许发生的那几种交互，而不是类继承关系。

因此排障有一条明确的分界线：任务没触发，查 admin 的调度线程与时间窗口；触发了没执行，查执行器的线程池与阻塞策略；执行了状态不对，查回调链路。集中式调度换来了统一的重试语义和可观测性，代价是 admin 成为决策单点——多台 admin 必须靠数据库锁保证同一时刻只有一台真正触发，这也是它对数据库有硬依赖的原因。

## 分层

严格说 XXL-JOB 只有两层：**协议契约层（`xxl-job-core/openapi`）** 和 **两侧各自的运行时**。core 模块被 admin 与 executor 同时依赖，各自实现一半接口、代理另一半。

```text
                 ┌──────────────────── xxl-job-core ────────────────────┐
                 │  openapi/executor/ExecutorBiz   （admin → executor） │
                 │      beat  idleBeat  trigger  kill  log              │
                 │  openapi/admin/AdminBiz         （executor → admin） │
                 │      callback  registry  registryRemove              │
                 │  openapi/admin/AdminJobBiz      （外部 → admin）      │
                 │      addJob updateJob removeJob start stop trigger   │
                 └──────────────────────────────────────────────────────┘
                         ▲  实现                        ▲  实现
        ┌────────────────┴──────────┐      ┌───────────┴─────────────────┐
        │  xxl-job-admin            │      │  xxl-job-core (executor 侧) │
        │  ├ AdminBizImpl           │      │  ├ ExecutorBizImpl          │
        │  ├ AdminJobBizImpl        │      │  ├ EmbedServer (Netty HTTP) │
        │  ├ OpenApiController      │◄────►│  ├ JobThread × N            │
        │  ├ JobTrigger             │ HTTP │  ├ 4 条后台线程              │
        │  └ 6 条后台线程 + MySQL   │ JSON │  └ jobHandlerRepository     │
        └───────────────────────────┘      └─────────────────────────────┘
```

| 层 | 职责 | 核心抽象 | 关键类 |
| --- | --- | --- | --- |
| 契约层 | 定义双向可调用的全部方法与 DTO | `ExecutorBiz` `AdminBiz` `Response<T>` | `openapi/executor/ExecutorBiz.java:9` `openapi/admin/AdminBiz.java:10` |
| 调度中心运行时 | 决定「何时触发、发给谁、结果如何收敛」 | 6 个 Helper + `JobTrigger` | `XxlJobAdminBootstrap.java:83` |
| 执行器运行时 | 决定「用哪个 handler、在哪个线程跑、日志写哪」 | `XxlJobExecutor` + `JobThread` | `XxlJobExecutor.java:128` |
| 传输层 | 一条 POST + JSON，无 RPC 框架 | 动态代理客户端 + `switch(uri)` 服务端 | `EmbedServer.java:207` `OpenApiController.java:69` |

## 核心抽象

### `XxlJobAdminBootstrap` —— 调度中心的服务定位器

**是什么**：一个实现了 `InitializingBean` + `DisposableBean` 的 `@Component`，在 `afterPropertiesSet()` 里把自己赋值给静态字段 `adminConfig`（`XxlJobAdminBootstrap.java:47-54`），从此全项目通过 `XxlJobAdminBootstrap.getInstance().getXxx()` 拿 Mapper、拿线程池、拿配置。

**为什么需要**：6 个 Helper 都是 `new` 出来的普通对象（不是 Bean），拿不到依赖注入。用静态单例把 Spring 容器的能力「漏」给非 Bean 对象，是最省事的做法——代价是全局可变状态和不可测试性。

**谁实现它**：唯一实现，`@Value` 注入 7 项配置，`@Resource` 注入 6 个 Mapper + `PlatformTransactionManager` + `JobAlarmer` + `JobTrigger` + `JobCompleter`（`XxlJobAdminBootstrap.java:181-226`）。

配置读取处做了**兜底钳制**，这是很容易漏看的细节：

| 配置项 | 默认 | 钳制逻辑 | 位置 |
| --- | --- | --- | --- |
| `xxl.job.triggerpool.fast.max` | 300 | `< 200` 时强制返回 200 | `:244` |
| `xxl.job.triggerpool.slow.max` | 200 | `< 100` 时强制返回 100 | `:251` |
| `xxl.job.schedule.batchsize` | 100 | 不在 `[50, 500]` 时强制返回 100 | `:258` |
| `xxl.job.logretentiondays` | 30 | `< 3` 时返回 `-1`（等于关闭清理） | `:265` |

> 也就是说**把快线程池调到 50 是无效的**，实际仍然是 200。这类「配置项存在但被静默钳制」的设计在排障时极具迷惑性。

### `XxlJobExecutor` —— 执行器的静态单例

对称设计：`start()` 里 `xxlJobExecutor = this`（`XxlJobExecutor.java:148`），之后 `JobThread`、`ExecutorBizImpl` 全部通过 `XxlJobExecutor.getInstance()` 反查。它持有两张核心 Map：

```text
XxlJobExecutor
 ├─ jobHandlerRepository : ConcurrentMap<String, IJobHandler>    (:311)
 │     key = @XxlJob("value")  →  MethodJobHandler(bean, method)
 └─ jobThreadRepository  : ConcurrentMap<Integer, JobThread>     (:388)
       key = jobId  →  一个常驻线程 + 一条 LinkedBlockingQueue
```

**`name → handler` 和 `jobId → thread` 是两张独立的表**，这是理解「换了 handler 为什么会杀线程」的前提：`ExecutorBizImpl#trigger` 发现 `jobThread.getHandler() != newJobHandler` 时，会把旧线程置空、走重建路径（`ExecutorBizImpl.java:73-79`）。

### `IJobHandler` —— 唯一的任务扩展点

三个实现覆盖三种任务形态：

| 实现 | 对应 GlueType | 任务来源 | 位置 |
| --- | --- | --- | --- |
| `MethodJobHandler` | `BEAN` | Spring Bean 上的 `@XxlJob` 方法，反射调用 | `MethodJobHandler.java:26-33` |
| `GlueJobHandler` | `GLUE_GROOVY` | 控制台里现写的 Groovy 源码，运行时编译 | `GlueJobHandler.java:33` |
| `ScriptJobHandler` | `GLUE_SHELL` 等 | 脚本落盘后 `ScriptUtil.execToFile` | `ScriptJobHandler.java:48` |

`MethodJobHandler#execute` 有一处很有意思的兼容处理：如果目标方法带参数，就传一组 `null` 进去（`MethodJobHandler.java:29`），并注释说明「method-param can not be primitive-types」。这是为了兼容 2.x 时代 `execute(String param)` 的老签名——现在参数应该用 `XxlJobHelper.getJobParam()` 取。

## 主流程一：两侧启动

```text
【调度中心】Spring 容器 refresh
   └─ XxlJobAdminBootstrap#afterPropertiesSet          (:47)
        adminConfig = this
        └─ doStart()                                    (:83)
             1. jobTriggerPoolHelper.start()   ← 必须最先，后面两个依赖它
             2. jobRegistryHelper.start()      ← 30s 周期，刷执行器地址 + 本地缓存
             3. jobFailAlarmMonitorHelper.start()  ← 10s 周期，重试 + 告警
             4. jobCompleteHelper.start()      ← 60s 周期，捞 10min 丢失结果
             5. jobLogReportHelper.start()     ← 报表 + 过期日志清理
             6. jobScheduleHelper.start()      ← 起 scheduleThread + ringThread

【执行器】SmartInitializingSingleton 回调
   └─ XxlJobSpringExecutor#afterSingletonsInstantiated  (:50)
        ├─ scanJobHandlerMethod(ctx)                    (:80)  扫 @XxlJob
        ├─ GlueFactory.refreshInstance(1)               (:56)
        └─ super.start()                                (XxlJobExecutor.java:128)
             ├─ XxlJobFileAppender.initLogPath()        建 gluesource/ callbacklogs/
             ├─ initAdminBizList()                      admin 地址 + "/api" → 代理
             ├─ jobLogFileCleanThreadHelper.start()     每天清一次过期日志目录
             ├─ triggerCallbackThreadHelper.start()     回调队列 + 磁盘重试线程
             └─ startEmbedServer()
                  └─ EmbedServer#start   Netty bind(port)
                       └─ bind 成功后才 executorRegistryThreadHelper.start()  (:98)
```

**注册必须在 bind 之后**（`EmbedServer.java:93-98`）：先监听端口再上报地址，否则调度中心可能在端口还没就绪时就把任务打过来。这是一个「注册时序」的经典正确写法——**先能服务，再宣告能服务**。

停机顺序则严格倒序（`XxlJobAdminBootstrap.java:114-134`），并且 `JobScheduleHelper#stop` 会检测时间轮非空时额外等 10 秒（`JobScheduleHelper.java:346-352`），执行器侧对称地等 5 秒（`Const.java:39`、`XxlJobExecutor.java:181`）。

### 执行器的 `@XxlJob` 扫描

`scanJobHandlerMethod` 有两处避坑设计，是 v3.3.0 才加的：

```text
getBeanNamesForType(Object.class, false, false)   ← allowEagerInit=false
  └─ for each beanName:
       ├─ BeanDefinition 里包名匹配 excludedPackage → skip      (:114)
       ├─ BeanDefinition.isLazyInit() → skip                    (:120)
       ├─ getType(beanName, false) == null → skip               (:131)
       └─ MethodIntrospector.selectMethods(clazz, @XxlJob)      (:139)
            └─ registryJobHandler(xxlJob, bean, method)         (:159)
```

`allowEagerInit=false` + 跳过 `@Lazy` Bean，是为了**避免扫描本身把不该初始化的 Bean 提前实例化**。默认排除包是 `"org.springframework.,spring."`（`XxlJobSpringExecutor.java:37`），可用 `xxl.job.executor.excludedpackage` 扩展。

## 主流程二：一次调度的完整时序

```text
scheduleThread   ringThread   fastPool    JobTrigger   EmbedServer  JobThread   callbackQueue
     │               │            │            │             │           │            │
 ①  ├─ FOR UPDATE 抢 xxl_job_lock                                                     
 ②  ├─ scheduleJobQuery(now+5s, preReadCount)                                          
 ③  ├─ 按 nextTime 三分支：misfire / 直发 / 推环                                        
     ├──push(ringSecond)──►│                                                           
 ④  ├─ scheduleBatchUpdate(批 100 条 CASE WHEN)                                        
 ⑤  └─ commit → 释放锁                                                                 
                 │                                                                     
 ⑥              ├─ 对齐整秒醒来，取 [now, now-1, now-2] 三刻度并 distinct               
                 ├──trigger(jobId)──►│                                                 
 ⑦                                   ├──►│ loadById + 分片扇出                          
 ⑧                                        ├ insert xxl_job_log → 拿 logId              
 ⑨                                        ├ route(triggerParam, group) 选址            
 ⑩                                        ├──POST /trigger──────►│                     
                                          │                       ├ 阻塞策略判定        
                                          │                       ├──push queue──►│    
                                          │◄──Response.ofSuccess──┤               │    
 ⑪                                        └ update trigger_code/trigger_msg        │    
                                                                                   │    
 ⑫                                                                     handler.execute()
 ⑬                                                                     ├──CallbackData──►│
 ⑭  ◄──────────── POST /api/callback（攒批 ≤50 或 1ms）───────────────────────────────┤
 ⑮  JobCompleteHelper#doCallback → JobCompleter#complete → 触发子任务 + update handle_code
```

逐步的源码坐标：

| 步 | 动作 | 坐标 |
| --- | --- | --- |
| ① | `SELECT * FROM xxl_job_lock WHERE lock_name='schedule_lock' FOR UPDATE` | `XxlJobLockMapper.xml:6-10`，调用点 `JobScheduleHelper.java:81` |
| ② | 预读未来 5 秒、上限 `(fastMax+slowMax)*10` 条 | `JobScheduleHelper.java:67` `:85` |
| ③ | 三分支：过期 >5s / 已到期 / 未来 5s 内 | `JobScheduleHelper.java:92` `:102` `:127` |
| ④ | 批量合并更新，`CASE id WHEN ... THEN` | `JobScheduleHelper.java:148-153`，SQL 见 `XxlJobInfoMapper.xml:243-273` |
| ⑤ | `transactionManager.commit` 放在 `finally` | `JobScheduleHelper.java:167` |
| ⑥ | 时间轮取三个刻度 + `distinct` | `JobScheduleHelper.java:219-231` |
| ⑦ | 分片广播时按注册节点数扇出 N 次 | `JobTrigger.java:99-104` |
| ⑧ | 先 insert 日志换 `logId`，再组装请求 | `JobTrigger.java:148-163` |
| ⑨ | 路由策略选址（分片广播直接按 index 取） | `JobTrigger.java:171-188` |
| ⑩ | 拿缓存的动态代理客户端发 POST | `JobTrigger.java:262-265`、`XxlJobAdminBootstrap.java:145-175` |
| ⑪ | 回写 `trigger_code` / `trigger_msg` | `JobTrigger.java:238-246` |
| ⑫ | 执行器线程取队列、建 `XxlJobContext`、跑 handler | `JobThread.java:106-162` |
| ⑬ | `finally` 里无条件推回调 | `JobThread.java:200-221` |
| ⑭ | `MessageQueue` 攒批，批量 50 / 间隔 1ms | `TriggerCallbackThreadHelper.java:65-73` |
| ⑮ | 幂等校验 + 子任务触发 + 落库 | `JobCompleteHelper.java:129`、`JobCompleter.java:39-53` |

## 线程全景

这是最值得背下来的一张表——**面试问「xxl-job 有几个线程池」，答案是 10 组**：

| 侧 | 名称 | 类型 | 周期/规格 | 坐标 |
| --- | --- | --- | --- | --- |
| admin | `scheduleThread` | 单线程循环 | 成功 1s / 空转 5s，对齐整秒 | `JobScheduleHelper.java:52` `:181` |
| admin | `ringThread` | 单线程循环 | 严格 1s，对齐整秒 | `JobScheduleHelper.java:199` `:207` |
| admin | `fastTriggerPool` | 线程池 | 10 ~ 300，队列 2000 | `JobTriggerPoolHelper.java:30` |
| admin | `slowTriggerPool` | 线程池 | 10 ~ 200，队列 5000 | `JobTriggerPoolHelper.java:49` |
| admin | `registryOrRemoveThreadPool` | 线程池 | 2 ~ 10，队列 2000，拒绝即 `r.run()` | `JobRegistryHelper.java:51-69` |
| admin | `registryMonitorThread` | `CyclicThread` | 30s | `JobRegistryHelper.java:72` `:141` |
| admin | `callbackThreadPool` | 线程池 | 2 ~ 20，队列 3000，拒绝即 `r.run()` | `JobCompleteHelper.java:37-55` |
| admin | `jobMonitorThread` | `CyclicThread` | 60s，捞 10 分钟前的丢失结果 | `JobCompleteHelper.java:59` `:81` |
| admin | `JobFailAlarmMonitorHelper#monitorThread` | `CyclicThread` | 10s，重试 + 告警 | `JobFailAlarmMonitorHelper.java:35` `:71` |
| admin | `logReportThread` | `CyclicThread` | 60s 聚合近 3 天报表；日志删除每 24h 一次、每批 1000 | `JobLogReportHelper.java:37` `:104-109` `:116` |
| executor | Netty `bossGroup`/`workerGroup` | EventLoop | 默认线程数 | `EmbedServer.java:55-56` |
| executor | `bizThreadPool` | 线程池 | 0 ~ 200，队列 2000，**拒绝直接抛异常** | `EmbedServer.java:57-74` |
| executor | `JobThread` × N | 每 jobId 一条常驻线程 | `poll(3s)`，空转 30 次后自毁 | `JobThread.java:106` `:181` |
| executor | `registryThread` | `CyclicThread` | 30s 心跳 | `ExecutorRegistryThreadHelper.java:48` |
| executor | `MessageQueue` 消费线程 | 攒批消费 | 批 50 / 间隔 1ms | `TriggerCallbackThreadHelper.java:65-73` |
| executor | `retryCallbackThread` | `CyclicThread` | 30s，扫 `callbacklogs/` 重发 | `TriggerCallbackThreadHelper.java:78` `:119` |
| executor | `logFileCleanThread` | `CyclicThread` | 24h | `JobLogFileCleanThreadHelper.java:44` `:94` |

三个线程池的**拒绝策略各不相同**，恰好体现了三种业务定位：

| 池 | 拒绝策略 | 语义 |
| --- | --- | --- |
| `fast/slowTriggerPool` | 只打 error 日志，**任务丢弃** | 调度可以丢，下一周期还会来 |
| `registryOrRemoveThreadPool` / `callbackThreadPool` | `r.run()`，调用线程自己跑 | 注册与回调不能丢，宁可阻塞调用方 |
| `EmbedServer#bizThreadPool` | `throw new RuntimeException` | 执行器过载要**立刻反压**给调度中心，让它记 `trigger_code` 失败并走重试 |

## 扩展点全景

| 扩展点 | 接口/枚举 | 触发时机 | 现有实现 | 能不能加自己的 |
| --- | --- | --- | --- | --- |
| 任务体 | `IJobHandler` | 每次触发 | `MethodJobHandler` `GlueJobHandler` `ScriptJobHandler` | ✅ `XxlJobExecutor#registryJobHandler(name, handler)` 是 public（`:323`） |
| 路由策略 | `ExecutorRouter` | 选址时 | 9 个（+ 分片广播特判） | ❌ 枚举 `ExecutorRouteStrategyEnum` 硬编码，要改源码 |
| 调度类型 | `ScheduleType` | 算下次触发时间 | `CronScheduleType` `FixRateScheduleType` `NoneScheduleType` | ❌ 同上，枚举硬编码 |
| 过期策略 | `MisfireHandler` | 错过 >5s 时 | `MisfireDoNothing` `MisfireFireOnceNow` | ❌ 同上 |
| 告警渠道 | `JobAlarm` | 失败后 | `EmailJobAlarm` | ✅ `JobAlarmer` 用 `getBeansOfType(JobAlarm.class)` 收集全部实现（`JobAlarmer.java:61`），**加个 `@Component` 就生效** |

> **只有两个真扩展点**：`IJobHandler` 和 `JobAlarm`。其余三处都是「策略模式 + 枚举注册表」，枚举是 Java 里最不友好的扩展点——想加一种路由策略必须 fork。这是 xxl-job 和 Dubbo SPI 最大的架构差距。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| 调度中心与执行器时钟不同步 | 任务在预期之外的秒触发，或 misfire 频发 | 时间轮刻度取自调度中心的 `System.currentTimeMillis()`，执行器只是被动接收 | 调度中心集群必须 NTP 对时；执行器时钟不影响触发时刻，只影响日志目录日期 |
| 把 `xxl.job.triggerpool.fast.max` 调小到 50 | 观察不到任何变化 | `getTriggerPoolFastMax()` 在 `<200` 时静默返回 200（`XxlJobAdminBootstrap.java:244`） | 想减小并发只能改源码；想增大直接配就行 |
| 执行器配置 `logretentiondays=1` | 日志永不清理，磁盘涨满 | `<3` 时返回 `-1`，`JobLogFileCleanThreadHelper#start` 直接 `return`（`:37-39`） | 最小设 3 |
| 执行器 `bizThreadPool` 打满 | 调度中心侧看到 `trigger_code` 失败，日志里是 `bizThreadPool is EXHAUSTED!` | 拒绝策略是抛异常（`EmbedServer.java:72`），200 线程 + 2000 队列都满了 | 检查是否有任务在 `EmbedServer` 线程里做重活——`trigger` 只应入队，不应执行 |
| 同一个 `appname` 下混部了不同代码版本 | 某些节点报 `job handler not found` | handler 注册表是**每个执行器进程独立**的，调度中心不知道哪个节点有哪个 handler | 灰度期用「指定地址」触发，或保证同组同版本 |
| admin 单节点部署 + 长 GC | 整段时间的任务全部 misfire | scheduleThread 停摆，恢复后 `nowTime > nextTime + 5s` 走 misfire 分支 | 调度中心至少两节点；关键任务设 `FIRE_ONCE_NOW` |

## 可迁移知识

| 手法 | 在这里的样子 | 换个场景怎么用 |
| --- | --- | --- |
| **先能服务，再宣告能服务** | Netty `bind().sync()` 成功后才启动注册线程（`EmbedServer.java:93-98`） | 任何注册中心接入（Nacos/Eureka/K8s readiness）都应遵守；反过来「先注册后启动」是线上 502 的常见根因 |
| **拒绝策略即业务语义** | 三个池三种拒绝策略，分别表达「可丢 / 不可丢 / 要反压」 | 设计线程池时先问「这个任务丢了会怎样」，答案直接决定 `RejectedExecutionHandler` |
| **静态单例桥接非 Bean 对象** | `XxlJobAdminBootstrap.getInstance()` | 快但有毒。更好的替代是把 Helper 也做成 Bean，或显式构造注入——xxl-job 选它是为了让 Helper 保持「可 new 可测」的表象，实际适得其反 |
| **契约集中在一个模块，双向各实现一半** | `xxl-job-core/openapi` 同时被 admin 和 executor 依赖 | 任何双向通信（网关↔后端、Agent↔Server）都可以这样做，比各自定义 DTO 再手动对齐可靠得多 |
| **两段式状态字段** | `trigger_code`（发出去了吗）+ `handle_code`（跑完了吗） | 任何「异步提交 + 回调确认」的表设计都需要两个状态位，只用一个必然区分不了「没发出去」和「发出去没回来」 |

> **面试锚点**
> - XXL-JOB 里一共有多少条后台线程？调度中心 6 组、执行器 4 组，分别在干什么？
> - 三个线程池为什么用三种不同的拒绝策略？
> - 执行器为什么必须在 Netty `bind()` 成功之后才发注册心跳？反过来会怎样？
> - `xxl_job_log` 为什么需要 `trigger_code` 和 `handle_code` 两个状态字段？
> - XXL-JOB 的扩展点为什么比 Dubbo 少？枚举做策略注册表的代价是什么？

## Related

- [XXL-JOB 总览](/notes/source/java/rpc/xxl-job/)：版本快照、模块地图与读码入口
- [DB 锁与秒级时间轮](/notes/source/java/rpc/xxl-job/time-ring-schedule/)：上文步骤 ①~⑥ 的完整拆解
- [执行器注册与路由策略](/notes/source/java/rpc/xxl-job/registry-and-route/)：步骤 ⑦~⑨ 的完整拆解
- [阻塞策略与失败重试](/notes/source/java/rpc/xxl-job/block-and-retry/)：步骤 ⑩~⑫ 的完整拆解
- [日志回捞与分片广播](/notes/source/java/rpc/xxl-job/log-and-sharding/)：步骤 ⑬~⑮ 的完整拆解
- [面试专题](/notes/source/java/rpc/xxl-job/interview/)
- [Disruptor 整体架构](/notes/source/java/base/disruptor/architecture/)：对照「进程内事件分发」与「跨进程任务分发」的抽象差异
