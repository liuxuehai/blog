---
title: 缓存穿透、击穿、雪崩与 Hotkey 实战
description: 缓存三大问题的根因、治理方案选型，以及京东 hotkey 热点探测框架的落地实践。
category: Backend
tags:
  - Redis
  - Cache
  - Distributed Systems
  - Performance
order: 52
updatedDate: 2024-12-03
difficulty: advanced
status: stable
lastReviewed: 2025-05-20
draft: false
sidebar:
  order: 52
---

三个问题本质上都是缓存失效导致请求直达数据库，区别在于失效的"姿势"不同。

<!-- more -->

## 三者对比

| 问题 | 根因 | 特征 |
|------|------|------|
| **穿透** | key 在缓存和数据库里**都不存在** | 每次都打 DB，是安全问题 |
| **击穿** | 一个**热 key** 在缓存里**刚好过期** | 瞬间高并发全打 DB |
| **雪崩** | **一大片 key** 同时过期，或 Redis 整个挂了 | 请求全打 DB |

## 缓存穿透

核心特征是查的东西压根不存在，缓存永远不会生效。

治理穿透有三条路，按落地难易度递增：

1. **参数校验 + 黑名单**：在网关或 Service 入口对参数做格式校验，把非法 key 直接挡掉
2. **缓存空值（Cache Null）**：数据库查不到时，往 Redis 写一个 nil 占位值，TTL 设短（比如 60 秒）
3. **布隆过滤器（Bloom Filter）**：在缓存之前加一层"存在性判断"，将数据库中真实存在的 key 预先放入布隆过滤器

> 建议：参数校验必做，缓存空值做兜底；非法 key 种类多到浪费内存时才上布隆过滤器。

**布隆过滤器**：概率型数据结构，用位数组 + 多个哈希函数判断元素是否在集合中。特点：有误判（假阳性），不支持删除。需要删除可用**布谷鸟过滤器（Cuckoo Filter）**，Redis 的 RedisBloom 模块中有实现。

## 缓存击穿

关键词是"热 key"和"刚好过期"。和穿透的差别：穿透是"压根不存在"，击穿是"存在但缓存没了"。

### 方案一：互斥锁——只让一个线程去重建

第一个线程发现 miss 后先抢分布式锁（Redis 的 SET NX PX），抢到的去查 DB 重建缓存；抢不到的休眠重试。注意做**双重检查**。

```java
String value = redis.get(key);
if (value == null) {
    RLock lock = redisson.getLock("lock:" + key);
    if (lock.tryLock(3, 10, TimeUnit.SECONDS)) {
        try {
            value = redis.get(key); // 双重检查
            if (value == null) {
                value = db.query(key);
                redis.set(key, value, 30, TimeUnit.MINUTES);
            }
        } finally {
            lock.unlock();
        }
    } else {
        Thread.sleep(50);
        return get(key); // 重试
    }
}
```

代价是线程阻塞等待，吞吐略降；好处是强一致。

### 方案二：逻辑过期——不设 TTL，自己埋过期时间

热 key 永不设 Redis TTL，过期时间作为字段写进 value。没过期直接返回；过期了，第一个发现的线程抢锁，异步起新线程重建缓存，自己和其他线程直接返回旧数据。

适用场景：商品详情、热帖等能容忍短暂脏数据的场景。金融账户、库存等强一致场景不适合。

### 互斥锁 vs 逻辑过期

| 维度 | 互斥锁 | 逻辑过期 |
|------|--------|----------|
| 一致性 | 强一致 | 短暂脏数据 |
| 性能 | 线程阻塞，吞吐略降 | 无等待，吞吐高 |
| 实现复杂度 | 中（处理死锁、重试） | 高（异步线程、value 嵌字段） |
| 适用场景 | 交易、账户、库存 | 商品详情、热帖、首页推荐 |

## 缓存雪崩

雪崩的特征是"批量失效"或"Redis 整体不可用"。

**诱因一：大量 key 同时过期**

- 给 TTL 加随机偏移：`TTL = base + random(0, 300s)`
- 对热点 key 做缓存预热
- 不常变的数据不设 TTL，靠异步任务更新或淘汰

**诱因二：Redis 整体宕机**

- Redis 集群（Cluster）或哨兵（Sentinel）保证可用性
- 服务端用 Hystrix/Sentinel 做限流、熔断、降级
- 多级缓存（本地 Caffeine + Redis + DB）做兜底

> 实践经验：TTL 随机化是底线；Redis 集群是中大型项目标配；限流熔断是最后一道闸。

## Hotkey 热点探测

### 为什么需要 hotkey 探测

热 key 的危害：单分片 Redis 的 CPU/网卡打满、集群场景下流量倾斜、跨节点请求放大。京东开源的 hotkey 框架在 618、双 11 大促中每天探测数十亿个 key，worker 集群秒级吞吐量达 1500 万级。

### 整体架构

四个核心组件：

| 组件 | 作用 |
|------|------|
| **Etcd** | 高性能分布式键值存储，存规则配置、worker 地址、探测出的热 key 列表 |
| **Client** | 应用端组件，上报 key 访问信息 |
| **Worker** | 接收上报数据，累加统计，判定热 key |
| **Dashboard** | 管理控制台，配置探测规则 |

工作时序：5 秒内 10 次访问判定为热 key，推送到所有 client 本地缓存（Caffeine）。

### 应用层初始化

```java
@Configuration
@ConfigurationProperties(prefix = "hotkey")
@Data
public class HotKeyConfig {

    private String etcdServer = "http://127.0.0.1:2379";
    private String appName = "app";
    private int caffeineSize = 10000;
    private long pushPeriod = 1000L;

    @Bean
    public void initHotkey() {
        ClientStarter starter = new ClientStarter.Builder()
            .setAppName(appName)
            .setCaffeineSize(caffeineSize)
            .setPushPeriod(pushPeriod)
            .setEtcdServer(etcdServer)
            .build();
        starter.startPipeline();
    }
}
```

### 业务层核心方法

```java
boolean isHot = JdHotKeyStore.isHotKey(key);  // 是否热 key
Object v = JdHotKeyStore.get(key);            // 取本地缓存
JdHotKeyStore.smartSet(key, value);           // 热时才写入本地缓存
Object v2 = JdHotKeyStore.getValue(key);      // isHotKey + get 合体
```

`isHotKey` 会调用 `HotKeyPusher.push` 上报，`get` 只是纯粹的本地 Caffeine 读取。官方推荐先 `isHotKey` 判断、再 `get` 取值。

### 业务代码示例

```java
@GetMapping("/get/vo")
public BaseResponse<QuestionBankVO> getVo(Long id) {
    String key = "bank_detail_" + id;
    if (JdHotKeyStore.isHotKey(key)) {
        Object cached = JdHotKeyStore.get(key);
        if (cached != null) return ResultUtils.success((QuestionBankVO) cached);
    }
    QuestionBankVO vo = bankService.getById(id);
    JdHotKeyStore.smartSet(key, vo);
    return ResultUtils.success(vo);
}
```

### Hotkey 与 Redis 的配合

两种主流方式：

- **方式 A（替换存储）**：不是热 key 就查 Redis；是热 key 时才写 Redis。后续热 key 走 Redis。
- **方式 B（多级缓存）**：hotkey 本地缓存作为最热一层挡在最前，形成 **Caffeine → Redis → DB** 的多级缓存。方式 B 更通用。

### 近过期续命机制

`isHotKey` 源码中有 `isNearExpire` 判断，离过期还有 2 秒内时会再次 push，让 key 有机会被重新设为热 key。持续被访问的热 key 几乎不会真正过期。

```java
public static boolean isHotKey(String key) {
    boolean isHot = isHot(key);
    if (!isHot) {
        HotKeyPusher.push(key, null);            // 不是热 key 才上报
    } else if (isNearExpire(getValueSimple(key))) {
        HotKeyPusher.push(key, null);            // 快过期再续一次
    }
    return isHot;
}
```

## 选型建议

| 业务规模 | 穿透 | 击穿 | 雪崩 | hotkey |
|---------|------|------|------|--------|
| 小型应用 | 参数校验 + 缓存空值 | 互斥锁 | TTL 随机化 | 不必上 |
| 中型应用 | + 布隆过滤器 | 互斥锁/逻辑过期按场景选 | + Redis 哨兵 + 限流 | 可选 |
| 大促型 | + 黑名单 | 互斥锁兜底 + 逻辑过期 | + 集群 + 多级缓存 | 必上 |

> 核心观点：治理缓存三大问题不是堆方案，是按业务阶段选方案。每个方案都有代价（内存、复杂度、一致性损失），选型时问自己"这个代价我能不能接受"。
