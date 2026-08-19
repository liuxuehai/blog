---
title: 执行器注册与路由策略
description: 30/90 秒心跳判死、ON DUPLICATE KEY upsert、地址表的两种来源，以及九种路由策略里哪些在集群下会失效。
category: Backend
tags:
  - Source Reading
  - XXL-JOB
  - Service Registry
  - Load Balance
order: 13
updatedDate: 2026-08-19
difficulty: advanced
status: stable
lastReviewed: 2026-08-19
draft: false
sidebar:
  order: 13
---

时间轮吐出一个 `jobId` 之后，下一个问题是「发给谁」。XXL-JOB 把注册中心直接做进了 MySQL：一张 `xxl_job_registry` 表 + 30 秒心跳 + 90 秒判死，再配九种路由策略挑一个地址。这一篇的重点是**哪些路由策略在调度中心集群部署时会退化**——这是它最容易踩、也最少被文章提到的坑。

<!-- more -->

## 先给答案：路由策略解决的是“任务该交给谁”，不是“任务能不能成功”

执行器注册表只提供候选节点，真正的路由还要结合负载、分片、故障和任务语义。随机、轮询、故障转移、忙碌转移和分片广播，分别对应不同的优先级：平均分布、尽快成功、避开故障、避开拥塞，或让所有节点共同参与。

因此路由策略不能脱离任务语义单独评价。一个需要本地缓存的任务不能随意故障转移；一个必须全量处理数据的任务不能误用单点路由；一个追求吞吐的任务也不一定适合“永远选空闲节点”。选择策略前先判断任务是否幂等、是否有状态、是否允许重复执行，再谈负载均衡。


## 问题背景

执行器是无状态的业务应用，会随时扩缩容。调度中心必须知道：

1. 现在有哪些执行器活着（**发现**）
2. 某个 `appname` 对应哪几个地址（**分组**）
3. 这次触发该挑哪一个（**路由**）

用 Nacos/Eureka 能解决前两个，但会给「开箱即用」的定位增加一个中间件。XXL-JOB 的选择是：**注册表就是一张表，心跳就是一条 upsert，判死就是一条带时间条件的 DELETE。**

## 设计概览

```text
【执行器】registryThread（CyclicThread, 30s）
    │  RegistryRequest("EXECUTOR", appname, "http://ip:port/")
    ├──POST /api/registry──────────────────────────────────┐
    │  遍历 adminBizList，任一成功即 break                   │
    │                                                       ▼
    │                                     【调度中心】OpenApiController#api
    │                                        ├ 校验 accessToken + appname（查本地缓存）
    │                                        └ AdminBizImpl#registry
    │                                             └ JobRegistryHelper#registry
    │                                                  └ 丢进 registryOrRemoveThreadPool（异步）
    │                                                       └ INSERT ... ON DUPLICATE KEY UPDATE update_time
    │                                                                            │
    │                                                                            ▼
    │                                                              ┌──── xxl_job_registry ────┐
    │                                                              │ EXECUTOR | app | addr | t │
    │                                                              └───────────────────────────┘
    │                                                                            ▲
    └── 停机时 POST /api/registryRemove ──► DELETE 该行                           │
                                                                                 │
       registryMonitorThread（CyclicThread, 30s）───────────────────────────────┘
          ① DELETE FROM xxl_job_registry WHERE update_time < now - 90s
          ② SELECT 全部存活行 → 按 appname 聚合成 List<address> → 排序 → join(",")
          ③ UPDATE xxl_job_group SET address_list = ...  （仅 address_type = 0 的组）
          ④ 重建 appname2GroupCache / id2GroupCache 本地缓存
```

## 实现拆解

### 1. 执行器侧：一条 30 秒心跳线程

```java
registryThread = new CyclicThread("ExecutorRegistryThread#registryThread", true, () -> {
    RegistryRequest registryParam = new RegistryRequest(
        RegistTypeEnum.EXECUTOR.name(), xxlJobExecutor.getAppname(), xxlJobExecutor.getAddress());
    for (AdminBiz adminBiz : xxlJobExecutor.getAdminBizList()) {
        Response<String> registryResult = adminBiz.registry(registryParam);
        if (registryResult != null && registryResult.isSuccess()) {
            break;                                        // 任一成功即停
        }
    }
}, Const.BEAT_TIMEOUT * 1000L, true);                     // ExecutorRegistryThreadHelper.java:48-69
```

| 常量 | 值 | 位置 |
| --- | --- | --- |
| `BEAT_TIMEOUT` | 30 秒 | `Const.java:26` |
| `DEAD_TIMEOUT` | `BEAT_TIMEOUT * 3` = 90 秒 | `Const.java:31` |

**「任一成功即 break」是关键语义**（`:58`）：调度中心集群配了 3 个地址时，心跳只会打到第一个可达的节点上。这没问题——因为注册表在共享的 MySQL 里，任何一个节点写入，全集群都能看到。**调度中心节点之间不需要同步注册信息**，这是把状态外置到 DB 的直接收益。

上报的地址在 `XxlJobExecutor#startEmbedServer` 里确定（`XxlJobExecutor.java:271-279`）：

```java
this.port = this.port > 0 ? this.port : IPTool.getAvailablePort(9999);
this.ip   = isNotBlank(this.ip) ? this.ip : IPTool.getIp();
if (isBlank(this.address)) {
    this.address = "http://{ip_port}/".replace("{ip_port}", IPTool.toAddressString(ip, port));
}
```

三层兜底：显式配 `address` → 显式配 `ip:port` → 自动探测网卡 IP + 从 9999 起找空闲端口。**容器化部署时前两层几乎必须显式配**，否则探测到的会是容器内网 IP，调度中心根本连不上。

### 2. 调度中心侧：异步 upsert

`JobRegistryHelper#registry` 校验完三个字段非空后，直接把 DB 操作丢进线程池就返回成功（`JobRegistryHelper.java:164-194`）：

```java
registryOrRemoveThreadPool.execute(() -> {
    int ret = ...getXxlJobRegistryMapper().registrySaveOrUpdate(
        registryParam.getRegistryGroup(), registryParam.getRegistryKey(),
        registryParam.getRegistryValue(), new Date());              // :178
    if (ret == 1) { freshGroupRegistryInfo(registryParam); }        // :179-182
});
return Response.ofSuccess();                                        // :193
```

SQL 靠唯一索引做幂等（`XxlJobRegistryMapper.xml:42-47`）：

```sql
INSERT INTO xxl_job_registry(registry_group, registry_key, registry_value, update_time)
VALUES(#{registryGroup}, #{registryKey}, #{registryValue}, #{updateTime})
ON DUPLICATE KEY UPDATE update_time = #{updateTime}
```

依赖表上的 `UNIQUE KEY i_g_k_v (registry_group, registry_key, registry_value)`（`doc/db/tables_xxl_job.sql:24-33`）。**一条 SQL 同时表达「首次注册」和「续约」**，比先 UPDATE 再 INSERT 的两段式少一次往返、也没有并发竞争——旧实现就在同一个 XML 文件的注释里（`:49-58`），可以直接对照。

线程池的拒绝策略是 `r.run()`（`JobRegistryHelper.java:66`）：注册请求不能丢，池满就让 Netty 的业务线程自己跑。

> **`freshGroupRegistryInfo` 是个空方法**（`:223-225`），方法体只有一行注释 `// Under consideration, prevent affecting core tables`。也就是说**新执行器注册后，地址不会立刻出现在 `xxl_job_group.address_list` 里**，必须等 `registryMonitorThread` 的下一轮（最长 30 秒）。这是新节点扩容后「为什么还没流量」的直接答案。

### 3. 监控线程：判死 + 聚合 + 刷缓存

`registryMonitorThread` 每 30 秒做四件事（`JobRegistryHelper.java:72-141`）：

```text
① findByAddressType(0)                     只处理「自动注册」的组          :76
② findDead(90s) → removeDead(ids)          物理删除超时行                 :80-83
   SQL: WHERE update_time < DATE_ADD(#{nowTime}, INTERVAL -#{timeout} SECOND)
③ findAll(90s) → HashMap<appname, List<address>>                          :86-103
   → Collections.sort(registryList) → join(",")  → group.setAddressList()  :110-118
④ 全量重建 appname2GroupCache / id2GroupCache                             :123-138
   仅当 GsonTool.toJson(新) != GsonTool.toJson(旧) 才替换引用 + 打 info 日志
```

**判死时间是 90 秒 = 心跳周期 × 3**，标准的「三次心跳容错」。最坏情况下一个已经宕掉的执行器会在注册表里存活 90 秒，期间仍会被路由选中——所以路由层还需要 `FAILOVER` 这类探测式策略兜底。

第 ③ 步的 `Collections.sort(registryList)`（`:111`）容易被当成无意义代码，其实很重要：**地址列表必须有确定顺序**，否则 `FIRST` / `LAST` / 一致性哈希这些依赖下标或顺序的策略会在每轮刷新后跳变。

第 ④ 步的「JSON 比对后才替换」（`:133-137`）是一个廉价的变更检测：避免每 30 秒都打一条 info 日志、也避免无谓地丢弃已有的 Map 引用。

### 4. 两种地址来源

| `address_type` | 来源 | 由谁维护 |
| --- | --- | --- |
| `0` 自动注册 | `xxl_job_registry` 聚合而来 | `registryMonitorThread` 每 30s 覆写 |
| `1` 手动录入 | 控制台里人工填的固定地址 | 完全不受注册线程影响（`findByAddressType(0)` 过滤掉了） |

最终 `XxlJobGroup#getRegistryList()` 只是把 `address_list` 按逗号切开（`XxlJobGroup.java:27-33`），两种来源在路由层完全等价。

单次触发还能临时覆盖地址——`JobTrigger#trigger` 里如果传了 `addressList` 参数，会就地把 group 改成手动模式（`JobTrigger.java:83-86`）：

```java
if (StringTool.isNotBlank(addressList)) {
    group.setAddressType(1);
    group.setAddressList(addressList.trim());
}
```

这是控制台「指定地址执行」和 OpenAPI `triggerJob(addressList=...)` 的实现，灰度验证时很有用。注意它改的是**内存里的临时对象**，不落库。

### 5. 优雅下线

`ExecutorRegistryThreadHelper#stop` 先停心跳线程，再主动发一次 `registryRemove`（`:76-89`），admin 侧执行 `registryDelete` 物理删行（`JobRegistryHelper.java:212`）。**正常停机时地址会立刻消失，不用等 90 秒**——前提是走了 `DisposableBean#destroy`。`kill -9` 就只能靠超时判死。

## 九种路由策略

`ExecutorRouteStrategyEnum` 里注册了 10 个枚举值，其中 9 个有 `ExecutorRouter` 实现，`SHARDING_BROADCAST` 的 router 是 `null`（`ExecutorRouteStrategyEnum.java:20`）——它在 `JobTrigger` 里被特判走另一条路，见[日志回捞与分片广播](/notes/source/java/rpc/xxl-job/log-and-sharding/)。

```text
                 ┌─ 无状态 ─────────────────────────────────────┐
                 │  FIRST     get(0)                            │  集群一致 ✅
                 │  LAST      get(size-1)                       │  集群一致 ✅
                 │  RANDOM    get(random)                       │  集群一致 ✅（本就随机）
                 ├─ 有状态（admin 进程内存）───────────────────┤
                 │  ROUND     jobId → AtomicInteger 计数        │  集群下退化 ⚠️
                 │  LRU       jobId → LinkedHashMap(accessOrder)│  集群下退化 ⚠️
                 │  LFU       jobId → HashMap<addr, count>      │  集群下退化 ⚠️
                 ├─ 确定性映射 ────────────────────────────────┤
                 │  CONSISTENT_HASH  md5(jobId) → 哈希环        │  集群一致 ✅
                 ├─ 探测式 ────────────────────────────────────┤
                 │  FAILOVER  逐个 beat()，首个成功者            │  集群一致 ✅
                 │  BUSYOVER  逐个 idleBeat()，首个空闲者        │  集群一致 ✅
                 └──────────────────────────────────────────────┘
```

### 无状态三兄弟

```java
// ExecutorRouteFirst.java:15
return Response.ofSuccess(jobGroup.getRegistryList().get(0));
// ExecutorRouteLast.java:15
return Response.ofSuccess(list.get(list.size() - 1));
// ExecutorRouteRandom.java:21
String address = addressList.get(localRandom.nextInt(addressList.size()));
```

`FIRST` / `LAST` 之所以能稳定命中同一台，正是因为上文那句 `Collections.sort()`。

### 有状态三兄弟：集群下的陷阱

三者的状态都存在 **admin 进程的静态 Map** 里：

| 策略 | 状态结构 | 位置 |
| --- | --- | --- |
| `ROUND` | `ConcurrentMap<Integer, AtomicInteger>` jobId → 计数 | `ExecutorRouteRound.java:19` |
| `LRU` | `ConcurrentMap<Integer, LinkedHashMap<String,String>>` | `ExecutorRouteLRU.java:28` |
| `LFU` | `ConcurrentMap<Integer, HashMap<String,Integer>>` jobId → (地址 → 次数) | `ExecutorRouteLFU.java:26` |

三者共用同一套「防膨胀」套路：

```java
// 24 小时全量清空一次
if (System.currentTimeMillis() > CACHE_VALID_TIME) {
    jobLRUMap.clear();
    CACHE_VALID_TIME = System.currentTimeMillis() + 1000*60*60*24;   // ExecutorRouteLRU.java:34-37
}
// 计数溢出保护 + 首次随机化
if (count == null || count.get() > 1000000) {
    count = new AtomicInteger(new Random().nextInt(100));            // ExecutorRouteRound.java:30-32
}
```

`new Random().nextInt(...)` 的初始化不是随手写的，源码注释写明了目的：「**初始化时主动 Random 一次，缓解首次压力**」（`ExecutorRouteRound.java:31`、`ExecutorRouteLFU.java:47`）。否则所有任务的轮询都从 0 开始，第一次触发会全部打到 `addressList.get(0)`。

LRU 的实现是 `LinkedHashMap` 的教科书用法（`ExecutorRouteLRU.java:47`）：

```java
lruItem = new LinkedHashMap<>(16, 0.75f, true);   // accessOrder = true
...
String eldestKey = lruItem.entrySet().iterator().next().getKey();   // 迭代器第一个 = 最久未访问
return lruItem.get(eldestKey);                                      // :71-72  ← get() 又把它移到末尾
```

`accessOrder=true` 让 `get()` 自动把元素移到链表尾部，于是「迭代器的第一个」永远是最久未被选中的地址。**取出即刷新**，一行 `get()` 同时完成了「选择」和「更新 LRU 顺序」两件事。源码注释还顺带提了 `removeEldestEntry` 的用法，是很好的知识点锚。

LFU 则是全量排序取最小（`ExecutorRouteLFU.java:64-68`）：

```java
List<Map.Entry<String,Integer>> lfuItemList = new ArrayList<>(lfuItemMap.entrySet());
lfuItemList.sort(Map.Entry.comparingByValue());     // 升序，取最小
Map.Entry<String,Integer> addressItem = lfuItemList.get(0);
addressItem.setValue(addressItem.getValue() + 1);   // 选中即加一
```

地址数通常是个位数，`O(n log n)` 完全可接受——但如果一个执行器组有几百个节点，这里每次触发都要排一次序。

### 一致性哈希

```java
private static final int VIRTUAL_NODE_NUM = 100;                    // :24
TreeMap<Long, String> addressRing = new TreeMap<>();
for (String address : addressList)
    for (int i = 0; i < VIRTUAL_NODE_NUM; i++)
        addressRing.put(hash("SHARD-" + address + "-NODE-" + i), address);   // :69-75
long jobHash = hash(String.valueOf(jobId));                         // :78
Map.Entry<Long,String> ceilingEntry = addressRing.ceilingEntry(jobHash);     // :81
return ceilingEntry != null ? ceilingEntry.getValue() : addressRing.firstEntry().getValue();  // :91
```

`hash()` 用 MD5 摘要的前 4 字节拼成 32 位无符号数（`:49-54`），注释解释了为什么不用 `String#hashCode`：「**String 的 hashCode 可能重复，需要进一步扩大 hashCode 的取值范围**」（`:19`）。虚拟节点 100 个则是为了「解决不均衡问题」（`:18`）。

`ceilingEntry(jobHash)` 取环上顺时针第一个不小于 `jobHash` 的节点；取不到说明 `jobHash` 超过了环上最大值，回绕到 `firstEntry()`——这就是「环」的闭合处。

> v3.4.0 Release Notes 第 4 条：「**一致性哈希路由算法优化，重构哈希环逻辑提升代码简洁性**」。旧版用 `tailMap(jobHash)` 再取 `firstKey()`，代码还留在注释里（`:85-88`），新版换成一句 `ceilingEntry` 语义更直白。

**注意：哈希环是每次 route 都重建的**（`:69-75`）——`addressList` 只有几个元素，建 `100 × N` 个 TreeMap 条目的成本可以接受，但换来的好处是**完全无状态**，天然对集群友好。这是拿 CPU 换正确性的典型交易。

### 探测式两兄弟

```java
// FAILOVER：找第一个心跳通的                    ExecutorRouteFailover.java:24-47
for (String address : addressList) {
    beatResult = getExecutorBiz(address, jobGroup).beat();
    if (beatResult.isSuccess()) return beatResult.setData(address);
}
// BUSYOVER：找第一个不忙的                      ExecutorRouteBusyover.java:24-46
for (String address : addressList) {
    idleBeatResult = getExecutorBiz(address, jobGroup).idleBeat(new IdleBeatRequest(jobId));
    if (idleBeatResult.isSuccess()) return idleBeatResult.setData(address);
}
```

执行器侧的两个探针语义完全不同：

| 探针 | 实现 | 判定 |
| --- | --- | --- |
| `beat()` | 直接 `return Response.ofSuccess()`（`ExecutorBizImpl.java:28-30`） | 只证明**进程活着且端口通**，不关心负载 |
| `idleBeat(jobId)` | 查 `jobThreadRepository.get(jobId)`，`isRunningOrHasQueue()` 为真就返回失败（`ExecutorBizImpl.java:33-46`） | 证明**这个 jobId 在这台机器上既没在跑、队列也是空的** |

`idleBeat` 判定的是**单个 jobId 的忙闲**，不是机器整体负载——因为 `JobThread` 是按 jobId 划分的（见[阻塞策略与失败重试](/notes/source/java/rpc/xxl-job/block-and-retry/)）。所以 `BUSYOVER` 的准确名字应该是「避开正在跑这个任务的节点」。

两者的代价是**路由阶段引入了 N 次同步 HTTP 往返**：最坏情况下 N 台机器全不可达，要串行等 `N × 3` 秒（`xxl.job.timeout=3`），而这一整段耗时都算在触发线程里——正是 `JobTriggerPoolHelper` 那个 500ms 慢池阈值要对付的场景。

### 客户端复用

九种策略都通过 `XxlJobAdminBootstrap.getExecutorBiz(address, group)` 拿客户端（`:145-175`），内部有一层缓存：

```java
String cacheKey = address + "|" + accessToken + "|" + appname;      // :155
ExecutorBiz executorBiz = executorBizRepository.get(cacheKey);
if (executorBiz != null) return executorBiz;
executorBiz = HttpTool.createClient().url(address).timeout(...).header(...).proxy(ExecutorBiz.class);
executorBizRepository.put(cacheKey, executorBiz);
if (executorBizRepository.size() > EXECUTOR_BIZ_CACHE_MAX_SIZE) {   // 1000
    executorBizRepository.clear();                                  // :171-173  ← 全清，不是 LRU
}
```

超过 1000 条**整表清空**而不是淘汰最久未用的。粗暴但足够：地址数远小于 1000 时永不触发；真触发了也只是下次调用重建代理，无正确性影响。

## 关键取舍

### 为什么注册表放 MySQL，而不是内存 + 集群同步

**替代方案**：调度中心各节点在内存里维护注册表，节点之间用 gossip / Distro 协议同步（Nacos 的做法）。
**为什么不行**：调度中心本来就是一个「必须有 DB」的应用——任务定义、日志、报表全在 MySQL。为注册表单独引入一套集群同步协议，等于给一个已有共享存储的系统再造一套弱一致存储，收益（少一次 DB 写）远小于成本（一致性 bug、脑裂处理、运维复杂度）。
**证据**：整个注册链路的代码量说明问题——执行器侧 109 行、admin 侧 244 行，**没有任何一行处理节点间同步**。心跳「任一 admin 成功即 break」（`ExecutorRegistryThreadHelper.java:58`）之所以成立，正是因为写进了共享 DB。

### 为什么 ROUND / LRU / LFU 明知集群下会失效还保留

**问题**：三者的状态在 admin 进程内存里。调度中心部署 3 个节点时，某个 jobId 的轮询计数在三个节点上各算各的——实际效果退化成「三条独立的轮询序列叠加」，负载不再均匀，LRU/LFU 的「最久未用 / 最少使用」判断也只反映本节点视角。
**为什么不修**：修的代价是把计数状态外置（Redis 或 DB），那就等于给每次路由加一次网络往返，而路由本身要求极低延迟。
**替代方案**：需要集群下确定性时用 `CONSISTENT_HASH`（无状态、纯函数）；需要真实负载感知时用 `BUSYOVER`（探测真实状态）。**这两个策略的存在，本身就是对前三个策略局限性的补偿。**
**结论**：这不是 bug，是「本地近似 vs 分布式精确」的显式取舍——但文档里没写，只能从代码里读出来。

### 为什么 `freshGroupRegistryInfo` 被留成空方法

方法体里只有一行注释：`// Under consideration, prevent affecting core tables`（`JobRegistryHelper.java:224`）。

**它原本要做的**：执行器首次注册成功（`ret == 1`）时，立刻把新地址刷进 `xxl_job_group.address_list`，让扩容的节点马上能接到任务。
**为什么放弃**：`xxl_job_group` 是核心表，被 `JobTrigger` 每次触发都要 `load` 一次（`JobTrigger.java:80`）。注册是高频操作（N 个执行器 × 每 30 秒），如果每次首注册都去 UPDATE 这张热表，容易和触发路径的读产生锁竞争。
**代价**：扩容后最长 30 秒才有流量。作者选择了**牺牲扩容实时性，换取核心表的写入平稳**——对一个「分钟级调度」的系统来说，这个交易是划算的。

## 参数与调优

| 参数 | 默认值 | 含义 | 什么时候要改 |
| --- | --- | --- | --- |
| `Const.BEAT_TIMEOUT` | 30 秒（硬编码） | 心跳周期 = 注册监控周期 | 不可配。改要同时改两侧 jar |
| `Const.DEAD_TIMEOUT` | 90 秒（= 30 × 3） | 判死阈值 | 同上 |
| `xxl.job.executor.ip` | 空（自动探测） | 上报的 IP | **容器/多网卡环境必须显式配**，否则上报内网 IP |
| `xxl.job.executor.port` | 样例配 9999；留空则从 9999 起找空闲 | 内嵌 Netty 端口 | 需要固定端口做安全组放行时配 |
| `xxl.job.executor.address` | 空 | 直接指定完整注册地址 | 有反向代理/NodePort 时用，优先级最高 |
| `xxl.job.executor.accessToken` | `default_token` | 双向鉴权令牌 | 3.x 起为空会直接启动失败（`XxlJobExecutor.java:143-145`），生产必须改掉默认值 |
| `xxl.job.executor.excludedpackage` | 空 | 追加 `@XxlJob` 扫描排除包 | 大型应用里跳过明显无任务的包，减少扫描开销 |
| `EXECUTOR_BIZ_CACHE_MAX_SIZE` | 1000（硬编码） | 客户端代理缓存上限 | 不可配 |
| `VIRTUAL_NODE_NUM` | 100（硬编码） | 一致性哈希虚拟节点数 | 不可配 |

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| 容器化部署未配 `address` | 注册成功，但触发全部超时 | 自动探测到容器内网 IP，调度中心路由不到 | 显式配 `xxl.job.executor.address` 为 Service/NodePort 可达地址 |
| 扩容新执行器 | 30 秒内不接任何任务 | `freshGroupRegistryInfo` 是空方法，要等监控线程刷 `address_list` | 接受它；或缩短观察期时用「指定地址」手动触发验证 |
| `kill -9` 停执行器 | 90 秒内仍被路由选中，触发全部失败 | 没走 `registryRemove`，只能超时判死 | 用 `SIGTERM`；路由策略配 `FAILOVER` 兜底 |
| 调度中心集群 + `ROUND` 策略 | 负载不均，某台执行器明显偏多 | 轮询计数是各 admin 节点的进程内状态 | 换 `CONSISTENT_HASH` 或 `BUSYOVER` |
| 用 `LFU` 且执行器数很多 | 触发耗时上升，慢池被打满 | 每次路由都要对全量地址排序 | 地址数 > 数十时改用 `CONSISTENT_HASH` |
| `FAILOVER` + 大批执行器全挂 | 单次触发耗时 `N × 3` 秒，调度整体变慢 | 串行 `beat()` 探测，每个都要等超时 | 保证执行器组规模可控；配合慢池分流已能兜住 |
| 同一 `appname` 配了不同 `accessToken` | 部分节点注册被拒 | admin 侧按 appname 查 group 再比对 token（`OpenApiController.java:62-65`） | 同组统一配置 |
| 一致性哈希下缩容一台 | 只有该节点承担的任务被重新分配 | 这正是一致性哈希的目的 | 无需处理，但注意任务与节点的绑定关系会变，本地缓存类任务要考虑冷启动 |

## 可迁移知识

| 手法 | 在这里的样子 | 别处怎么用 |
| --- | --- | --- |
| **唯一索引 + `ON DUPLICATE KEY UPDATE` 做 upsert** | 一条 SQL 表达注册与续约 | 任何「首次插入 / 后续更新」的幂等写。比 `SELECT` 后判断再写少一次往返，且无并发竞争窗口 |
| **心跳周期 × 3 = 判死阈值** | 30s / 90s | 通用的心跳容错比例。允许连丢两次，第三次才判死，在网络抖动与故障发现速度之间取平衡 |
| **地址列表必须排序** | `Collections.sort(registryList)` | 任何依赖下标或顺序的负载均衡（轮询、哈希环）都必须先固定顺序，否则每次刷新都会重排流量 |
| **无状态路由 > 有状态路由** | 一致性哈希每次重建环，换来集群一致 | 负载均衡器多副本部署时，本地计数状态必然发散。要么接受近似，要么用纯函数映射 |
| **两级探针：存活 vs 空闲** | `beat()` 只测端口，`idleBeat()` 测具体任务的忙闲 | 健康检查要分层：liveness（进程活着）和 readiness（能接活）语义不同，混用会导致「活着但接不动」的节点持续被打流量 |
| **有意保留的空方法 + 原因注释** | `freshGroupRegistryInfo` | 比删掉更好——它记录了「这里曾经想做什么、为什么没做」。这类注释是代码考古的路标 |

> **面试锚点**
> - 执行器心跳 30 秒、判死 90 秒，这个 3 倍关系是怎么来的？改成 1 倍会怎样？
> - 调度中心部署 3 个节点时，哪些路由策略会退化？为什么一致性哈希不会？
> - `beat()` 和 `idleBeat()` 分别在探测什么？`BUSYOVER` 判断的是机器负载还是别的？
> - 执行器注册用了什么 SQL 做幂等？为什么不用「先查再写」？
> - 新扩容的执行器为什么要等 30 秒才有流量？源码里哪一处决定了这一点？

## Related

- [整体架构](/notes/source/java/rpc/xxl-job/architecture/)：注册与路由在全局时序里的位置（步骤 ⑦~⑨）
- [DB 锁与秒级时间轮](/notes/source/java/rpc/xxl-job/time-ring-schedule/)：谁在调用路由，以及慢池阈值为什么是 500ms
- [阻塞策略与失败重试](/notes/source/java/rpc/xxl-job/block-and-retry/)：`idleBeat` 依赖的 `JobThread` 模型
- [日志回捞与分片广播](/notes/source/java/rpc/xxl-job/log-and-sharding/)：`SHARDING_BROADCAST` 为什么不走 `ExecutorRouter`
- [面试专题](/notes/source/java/rpc/xxl-job/interview/)
