---
title: XXL-JOB
description: XXL-JOB 源码解析总览：自研调度组件、DB 悲观锁 + 秒级时间轮、执行器注册与九种路由、阻塞策略与失败重试、日志回捞与分片广播。
category: Backend
tags:
  - Source Reading
  - XXL-JOB
  - Distributed Scheduling
  - Time Ring
order: 1
updatedDate: 2026-08-15
difficulty: advanced
status: stable
lastReviewed: 2026-08-15
draft: false
sidebar:
  order: 1
---

XXL-JOB 是一个**中心化的分布式任务调度平台**：调度中心（admin）负责「什么时候该跑」，执行器（executor）负责「跑什么」，两侧靠一条极薄的 HTTP 协议连接。它的价值不在功能多，而在于**用最少的机制把「不重不漏」这件事做到生产可用**——一张 DB 行锁表 + 一个 60 刻度的秒级时间轮，就替换掉了整个 Quartz。

<!-- more -->

## 版本快照

| 项 | 值 |
| --- | --- |
| 仓库 | `xuxueli/xxl-job` |
| 本地路径 | `E:\source\java\rpc\xxl-job` |
| 分支 | `master` |
| Commit | `e74c784f`（2026-07-22） |
| 最近 tag | `3.4.2`（`pom.xml` 里 version 为 `3.5.0-SNAPSHOT`） |
| 构建 | Maven 多模块，`maven.compiler.source=17` |
| 关键依赖 | Spring Boot `4.1.0` · Spring `7.0.8` · Netty `4.2.15.Final` · `xxl-tool 2.5.0` · `xxl-sso 2.4.0` · Gson `2.14.0` |

> 本册所有 `文件:行号` 坐标均基于上述 commit。行号会随上游演进漂移，类名与方法名相对稳定。

**⚠️ 这一版和网上流传的 2.x 解析文章差异很大**，读之前先对齐这五处改名，否则按老文章去源码里找类会全部落空：

| 维度 | 2.x（大多数文章写的） | 3.4.x（本册） |
| --- | --- | --- |
| admin 包路径 | `com.xxl.job.admin.core.*` | `com.xxl.job.admin.business.scheduler.*` |
| 全局配置单例 | `XxlJobAdminConfig` | `XxlJobAdminBootstrap`（`InitializingBean` + `DisposableBean`） |
| 通信层 | 自研 `XxlJobRemotingUtil` 手写 HTTP | `xxl-tool` 的 `HttpTool.createClient()...proxy(Interface.class)` 动态代理，老实现整体挪进 `util/deprecated/` |
| 返回值 | `ReturnT<T>`（`code`/`msg`/`content`） | `Response<T>`（`isSuccess()`/`getData()`），`ReturnT` 同样进了 `deprecated` |
| 后台登录 | 自研 cookie 登录 | 接入 `xxl-sso` |

`util/deprecated/` 这个包本身就是一份很好的**架构演进考古现场**：`XxlJobRemotingUtil` / `ReturnT` / `IpUtil` / `GsonTool` / `ShardingUtil` 全在里面，能直接对比「自己写」和「抽成公共库」两个版本。

## 它解决什么问题

XXL-JOB 的起点是**「Quartz 不好用」**，官方文档第 5.4.1 节把理由写得很直白：

| Quartz 的问题 | 具体代价 | XXL-JOB 的对策 |
| --- | --- | --- |
| 任务需要持久化成 `QuartzJobBean` 落到 11 张表里 | 系统侵入性极强，改任务要动数据库 | 自研调度组件，只保留 8 张业务表，任务是普通 Spring Bean 上的一个 `@XxlJob` 方法 |
| 调度逻辑和业务代码耦合在同一进程 | 任务变重时**调度器本身**被拖慢 | 调度中心与执行器彻底进程分离，调度中心只发 HTTP，不跑业务 |
| 集群下「抢占式」拿 DB 锁，抢到的节点独自跑全部任务 | 节点负载悬殊 | 抢锁只用于**分配触发时刻**，真正的执行由执行器集群「协同分配式」承担 |
| 通过 API 管理任务，无可视化 | 改 cron 要发版 | Web 控制台 + OpenAPI |

> 该决策的原文出自 v2.1.0 Release Notes（2019-07-07）：「**自研调度组件，移除 quartz 依赖：一方面是为了精简系统降低冗余依赖，另一方面是为了提供系统的可控度与稳定性**；触发：单节点周期性触发，运行事件如 delayqueue；调度：集群竞争，负载方式协同处理，**锁竞争 - 更新触发信息 - 推送时间轮 - 锁释放 - 锁竞争**」。最后那一串正是 `JobScheduleHelper#scheduleThread` 至今的循环骨架。

## 模块地图

Maven 三模块，`xxl-job-core` 被 admin 和执行器**双向复用**——这是理解整个项目的关键：它同时装着「调度中心要调用执行器的接口」和「执行器要调用调度中心的接口」，两边各实现一半、各代理一半。

| 模块 | 职责 | 关键包 |
| --- | --- | --- |
| `xxl-job-core` | 双向协议契约 + 执行器全部运行时 | `openapi.executor`（executor 侧接口） `openapi.admin`（admin 侧接口） `thread` `server` `handler` `context` `log` |
| `xxl-job-admin` | 调度中心：Web 控制台 + 6 条后台线程 + 触发链路 | `business.scheduler.thread` `business.scheduler.trigger` `business.scheduler.route` `business.scheduler.type` `business.scheduler.misfire` `business.scheduler.complete` |
| `xxl-job-executor-samples` | 三个接入样例：frameless（裸 main）· springboot · springboot-ai | — |

`core` 里的 `openapi` 包是整个双向通信的**唯一契约面**，只有两个接口共 11 个方法：

| 接口 | 方向 | 方法 | 实现方 | 代理方 |
| --- | --- | --- | --- | --- |
| `ExecutorBiz` | admin → executor | `beat` `idleBeat` `trigger` `kill` `log` | `ExecutorBizImpl`（执行器） | `XxlJobAdminBootstrap#getExecutorBiz` |
| `AdminBiz` | executor → admin | `callback` `registry` `registryRemove` | `AdminBizImpl`（调度中心） | `XxlJobExecutor#initAdminBizList` |
| `AdminJobBiz` | 外部系统 → admin | `addJob` `updateJob` `removeJob` `startJob` `stopJob` `triggerJob` | `AdminJobBizImpl` | OpenAPI 调用方自建 |

两侧都用同一句话生成客户端——`HttpTool.createClient().url(...).header(token).proxy(接口.class)`（`XxlJobAdminBootstrap.java:162` 与 `XxlJobExecutor.java:241`），服务端则各自用一个 `switch(uri)` 分发（`EmbedServer.java:207` 与 `OpenApiController.java:69`）。**没有 RPC 框架，没有序列化协议协商，就是 POST + JSON + 手写路由表。**

## 数据模型

调度状态全部落在 8 张 MySQL 表上，其中真正参与调度热路径的只有 4 张：

| 表 | 作用 | 热路径角色 |
| --- | --- | --- |
| `xxl_job_lock` | 只有一行 `schedule_lock`，`PRIMARY KEY(lock_name)` | 调度线程每轮 `SELECT ... FOR UPDATE` 抢它 |
| `xxl_job_info` | 任务定义 + `trigger_next_time` / `trigger_last_time` / `trigger_status` | 预读扫描与批量回写的对象 |
| `xxl_job_registry` | 执行器心跳，唯一键 `(registry_group, registry_key, registry_value)` | 30s 心跳 upsert，90s 判死 |
| `xxl_job_log` | 每次触发一行，`trigger_code` / `handle_code` 两段状态 | 触发前先 insert 拿 `logId`，回调时 update |

> `xxl_job_log` 的**两段式状态**是理解全局的钥匙：`trigger_code` 记「调度中心有没有把请求发出去」，`handle_code` 记「执行器有没有跑完并回调」。失败重试看前者，结果丢失监控看后者，两个哨兵线程各扫各的。

## 读码入口顺序

不要从 Web 控制台读，那是外壳；从**「一个任务是怎么从数据库变成一次 HTTP 调用」**这条线读：

1. **`XxlJobAdminBootstrap#doStart`（`XxlJobAdminBootstrap.java:83-109`）** —— 6 个 Helper 的启动顺序就是依赖顺序，注释里明确标了 `depend on JobTriggerPoolHelper`。
2. **`JobScheduleHelper#start`（`JobScheduleHelper.java:45-257`）** —— 全项目最核心的 200 行，两个线程（scheduleThread / ringThread）+ 三个分支判定，读懂它 xxl-job 就懂了一半。
3. **`JobTrigger#trigger` → `#processTrigger`（`JobTrigger.java:63` / `:134`）** —— 单次触发的完整装配：分片扇出、写日志拿 id、路由选址、发请求、回写结果。
4. **`ExecutorBizImpl#trigger`（`ExecutorBizImpl.java:49-160`）** —— 执行器侧的入口，阻塞策略与 handler 换绑都在这一个方法里。
5. **`JobThread#run`（`JobThread.java:89-246`）** —— 每个 jobId 一个常驻线程 + 一条 `LinkedBlockingQueue`，串行语义的实现处。
6. **`TriggerCallbackThreadHelper` + `JobCompleteHelper`** —— 结果怎么回来、回不来怎么办（磁盘重试 + 10 分钟丢失兜底）。
7. **最后再读 `route/strategy/` 九个策略类** —— 每个都只有 20~100 行，是很好的「策略模式 + 有状态负载均衡」样本。

配合读：`xxl-job-executor-samples/xxl-job-executor-sample-springboot/src/main/java/com/xxl/job/executor/jobhandler/` 下的样例 handler 是最准确的使用说明书；`doc/db/tables_xxl_job.sql` 是数据模型说明书。

## 本册目录

- [整体架构](/notes/source/java/rpc/xxl-job/architecture/)：admin/executor 双进程分层、6 + 4 条后台线程全景、启动与调度两条主流程、扩展点
- [DB 锁与秒级时间轮](/notes/source/java/rpc/xxl-job/time-ring-schedule/)：`FOR UPDATE` 抢锁、5 秒预读、60 刻度环、三分支判定、批量合并更新、不重不漏的四道防线
- [执行器注册与路由策略](/notes/source/java/rpc/xxl-job/registry-and-route/)：30/90s 心跳判死、`ON DUPLICATE KEY` upsert、九种路由的有状态与无状态之分、一致性哈希的 100 虚拟节点
- [阻塞策略与失败重试](/notes/source/java/rpc/xxl-job/block-and-retry/)：`JobThread` 单线程队列模型、三种阻塞策略、超时 `FutureTask` 的真相、重试链与告警的 CAS 加锁
- [日志回捞与分片广播](/notes/source/java/rpc/xxl-job/log-and-sharding/)：日志按 `logId` 落盘、`fromLineNum` 增量拉取、回调三级降级、分片广播的扇出与重试退化
- [面试专题](/notes/source/java/rpc/xxl-job/interview/)：高频题、高难追问、场景题与源码级加分答法

## 横向对照

| 对象 | 对照点 |
| --- | --- |
| Quartz | 同为 Java 调度框架。Quartz 抢锁后独自执行、任务落表；XXL-JOB 抢锁只为分配时刻，执行下沉到执行器集群 |
| Netty `HashedWheelTimer` | 同为时间轮。Netty 是**多层轮 + tick 精度可调**的通用定时器；XXL-JOB 是**单层 60 槽、刻度写死 1 秒**的极简版，因为它只需要秒级精度 |
| Elastic-Job | 同为分布式调度。Elastic-Job 用 ZooKeeper 做协调与分片，XXL-JOB 用 MySQL 行锁，少一个中间件但多一个 DB 热点 |
| PowerJob | 后来者，Worker 侧支持 MapReduce 式子任务；XXL-JOB 的分片广播是它的简化版 |
| Nacos 注册中心 | 同为「心跳续约 + 超时摘除」。Nacos 是内存注册表 + Distro 协议同步；XXL-JOB 直接把注册表放在 MySQL，靠唯一索引做 upsert |

## Related

- [整体架构](/notes/source/java/rpc/xxl-job/architecture/)：先看这篇建立全局视图
- [RPC 与微服务](/notes/source/java/rpc/)：本分组索引
- [Disruptor](/notes/source/java/base/disruptor/)：同样用「预分配 + 序号」思路，对照进程内队列与跨进程调度的差异
- [Java 微服务架构治理实践](/notes/backend/java-microservice-architecture-governance/)：站内已有的治理层笔记
