---
title: 秒杀系统设计
description: 秒杀业务的完整架构设计——库存扣减、防超卖、流量控制、降级熔断与分布式事务。
category: Backend
tags:
  - Flash Sale
  - High Concurrency
  - Architecture
  - Redis
  - RocketMQ
order: 56
updatedDate: 2026-07-26
difficulty: advanced
status: stable
lastReviewed: 2026-07-26
draft: false
sidebar:
  order: 56
---

秒杀是典型的高并发场景——瞬间流量暴增、库存有限、要求不超卖不漏单。核心思路是**层层拦截流量、Redis 原子扣减、MQ 异步下单**。

<!-- more -->

## 整体架构

```text
用户 → CDN/静态化 → 网关限流 → 秒杀服务 → Redis Lua 扣减
                                              ↓
                                        RocketMQ 异步
                                              ↓
                                        订单服务 → 支付服务
```

| 模块 | 职责 |
|------|------|
| **秒杀网关服务** | 统一流量入口，鉴权、限流、黑名单 |
| **秒杀服务** | 核心秒杀逻辑，Redis 扣减 |
| **库存服务** | 库存管理，DB 持久化 |
| **订单服务** | 订单创建与管理 |
| **支付服务** | 支付处理 |

技术栈：Nacos（注册中心）、RocketMQ（异步消息）、Redis（缓存扣减）、MySQL（持久化）。

## 核心技术点

### 1. 库存扣减与防超卖

Redis 存储库存，使用 **Lua 脚本**保证原子性：

```lua
-- 秒杀 Lua 脚本
local stock = tonumber(redis.call('GET', KEYS[1]))
if stock == nil then
    return -1  -- 库存未初始化
end
if stock <= 0 then
    return 0   -- 库存不足
end
-- 判断是否重复下单
local userId = ARGV[1]
local exists = redis.call('SISMEMBER', KEYS[2], userId)
if exists == 1 then
    return -2  -- 重复下单
end
-- 扣减库存 + 记录用户
redis.call('DECR', KEYS[1])
redis.call('SADD', KEYS[2], userId)
return 1  -- 扣减成功
```

```java
// Java 调用
String script = "..."; // 上面的 Lua 脚本
Long result = redisTemplate.execute(
    new DefaultRedisScript<>(script, Long.class),
    List.of("goods:stock:" + goodsId, "goods:bought:" + goodsId),
    userId
);
```

| 返回值 | 含义 |
|--------|------|
| `1` | 扣减成功，进入下单流程 |
| `0` | 库存不足，秒杀结束 |
| `-1` | 库存未初始化 |
| `-2` | 重复下单 |

**Redis 高可用：** 主从架构，主节点处理扣减，从节点处理读请求。部署优化：Redis 节点与秒杀服务节点同机房部署，减少跨机房延迟。

### 2. 防重复下单

- 预先生成订单 ID，用户下单时携带
- 订单 ID 用于**幂等控制**
- 订单 ID 生成：JVM 缓存预生成 + 定时任务 + 低于阈值自动触发

```java
// 预生成订单 ID 池
@Component
public class OrderIdGenerator {
    private final Queue<String> idPool = new ConcurrentLinkedQueue<>();

    @PostConstruct
    public void init() {
        fillPool();
    }

    @Scheduled(fixedRate = 60000)
    public void scheduledFill() {
        if (idPool.size() < 1000) {
            fillPool();
        }
    }

    private void fillPool() {
        for (int i = 0; i < 10000; i++) {
            idPool.offer(generateId());
        }
    }

    public String nextId() {
        String id = idPool.poll();
        if (idPool.size() < 500) {
            CompletableFuture.runAsync(this::fillPool);
        }
        return id;
    }
}
```

### 3. 逐层限流

| 层级 | 手段 | 拦截比例 |
|------|------|----------|
| **前端** | 静态页面 CDN 缓存、按钮防抖 | 90%+ 无效请求 |
| **网关** | 验证码、黑名单、API 限流 | 大部分非法请求 |
| **服务** | 本地缓存预判、Sentinel 限流 | 剩余无效请求 |
| **Redis** | Lua 脚本原子扣减 | 最后一道关 |

### 4. 静态页面预缓存

商品详情页、下单页、库存扣减页——所有静态信息缓存在前端：

- 商品图片、标题、价格等不变信息走 CDN
- 库存数量通过 WebSocket 或定时轮询更新
- 秒杀开始前页面只读缓存，不请求后端

## 核心流程：Redis 预扣减 + 异步下单

这是秒杀系统的推荐方案——**Redis 作为库存的唯一真实源**，MQ 异步创建订单：

```text
1. 用户请求 → 网关限流 → 秒杀服务
2. Lua 脚本原子扣减 Redis 库存
   ├─ 成功 → 生成 Token + 有效期存入 Redis
   └─ 失败 → 返回"已售罄"
3. 秒杀服务发送延迟消息到 RocketMQ（携带 Token）
4. 订单服务消费消息
   ├─ 验证 Token 有效性
   ├─ 创建数据库订单（不是扣减库存）
   └─ 删除已使用的 Token
5. 补偿 Job 定时扫描
   ├─ "Token 存在但无订单" → 回滚 Redis 库存 + 通知用户失败
   └─ 保证最终一致性
```

**强一致保证：**

- 用户收到成功响应 = 确认库存已预留（感知上的强一致）
- 系统正确性由 Redis + 补偿机制保证
- 避免了分布式事务框架的性能开销

## 降级与熔断

当 Redis 不可达（网络分区、交换机故障）：

```text
网关层 → 立即拦截大部分流量，返回"活动太火爆"
       → 路由 1% 流量到数据库悲观锁兜底路径（低性能但保证一致性）
```

**降级策略：**

| 级别 | 条件 | 行为 |
|------|------|------|
| **正常** | Redis 可用 | Lua 脚本扣减 |
| **降级** | Redis 不可用 | 网关拦截 99% 流量 + DB 悲观锁处理 1% |
| **熔断** | 服务不可用 | 返回静态页面"系统繁忙" |

## 架构权衡：扣减逻辑放在哪里？

### 方案 A：扣减逻辑放在网关

**优点：** 少一跳网络（秒杀服务→Redis），延迟更低，最外层拦截无效请求。

**缺点：**

- **职责混淆**：网关（Spring Cloud Gateway、Nginx）应专注流量治理、路由、鉴权，混入核心业务逻辑会臃肿难维护
- **技术栈限制**：复杂 Lua 脚本在网关（OpenResty）或 Java 代码中调试、测试、部署更复杂
- **数据一致性风险**：网关扣减成功但下游调用失败，需要回滚/同步机制

### 方案 B：网关本地缓存预验证（推荐）

在网关层使用**只读、非破坏性**的预验证：

```text
请求到达网关
  ├─ 本地缓存（Caffeine）库存 = 0 → 立即返回"已售罄"（拦截 99%+ 无效请求）
  └─ 本地缓存库存 > 0 → 放行到秒杀服务
                          └─ Redis Lua 脚本真正扣减（集中式、原子性）
```

- 部署本地缓存（Caffeine）在网关
- 通过 Redis Pub/Sub 或定时任务同步全局库存到本地缓存
- 实际扣减仍在后端秒杀服务通过 Redis Lua 脚本完成
- 保持业务逻辑集中和原子性

## 订单数据分片

| 策略 | 说明 |
|------|------|
| **按 user_uid 分片** | 用户订单查询高频，分片后减少单表压力 |
| **3 个月以上数据归档** | 在线数据库只保留近期数据 |
| **归档存储** | HBase、对象存储，通过统一查询路由层透明访问 |

## 面试话术

> 秒杀系统的核心是层层拦截流量。前端静态化和 CDN 拦截 90% 的请求，网关限流和验证码拦截非法请求，本地缓存预判拦截已售罄的请求。真正的库存扣减通过 Redis Lua 脚本保证原子性，扣减成功后通过 RocketMQ 异步创建订单。Redis 作为库存的唯一真实源，配合补偿 Job 保证最终一致性，避免了分布式事务框架的性能开销。当 Redis 不可用时，降级到网关拦截大部分流量 + DB 悲观锁处理少量请求的兜底路径。

## Related

- [缓存穿透、击穿、雪崩与 Hotkey 实战](/notes/backend/cache-penetration-breakdown-avalanche/)：秒杀场景的缓存预热与热点保护
- [Sentinel 流量治理](/notes/backend/sentinel/)：秒杀场景的限流与熔断
- [Apache RocketMQ](/notes/backend/mq/rocketmq/)：异步下单与延迟消息
- [Seata 分布式事务](/notes/backend/seata/)：如果需要强一致的替代方案
