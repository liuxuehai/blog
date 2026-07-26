---
title: 工程实践
description: Sentinel 注解方式、动态规则扩展、与 Spring Cloud 集成、Dashboard 使用。
category: Backend
tags:
  - Sentinel
  - Spring Cloud
  - Practice
order: 546
updatedDate: 2026-07-26
difficulty: advanced
status: stable
lastReviewed: 2026-07-26
draft: false
sidebar:
  order: 546
---

Sentinel 的工程实践——从接入方式、规则管理到监控告警的完整链路。

<!-- more -->

## 接入方式

### 1. 原生 API

```java
Entry entry = null;
try {
    entry = SphU.entry("resourceName");
    // 业务逻辑
} catch (BlockException ex) {
    // 限流/降级处理
} finally {
    if (entry != null) {
        entry.exit();
    }
}
```

### 2. 注解方式（推荐）

```java
@SentinelResource(value = "orderService",
    blockHandler = "createOrderBlockHandler",
    fallback = "createOrderFallback")
public OrderVO createOrder(OrderDTO dto) {
    return orderService.create(dto);
}

// 限流处理（BlockException）
public OrderVO createOrderBlockHandler(OrderDTO dto, BlockException ex) {
    return OrderVO.fail("系统繁忙，请稍后重试");
}

// 降级处理（业务异常）
public OrderVO createOrderFallback(OrderDTO dto, Throwable ex) {
    return OrderVO.fail("服务暂时不可用");
}
```

| 属性 | 说明 |
|------|------|
| `value` | 资源名 |
| `blockHandler` | 限流/熔断处理方法（必须在同一个类中，参数需包含 BlockException） |
| `fallback` | 业务降级处理方法（参数需包含 Throwable） |
| `blockHandlerClass` | 限流处理方法所在的类（用于跨类复用） |
| `fallbackClass` | 降级处理方法所在的类 |
| `exceptionsToIgnore` | 不触发 fallback 的异常类型 |

### 3. Spring Cloud 集成

```yaml
# application.yml
spring:
  cloud:
    sentinel:
      transport:
        dashboard: localhost:8080
        port: 8719
      eager: true # 立即初始化
```

```xml
<dependency>
    <groupId>com.alibaba.cloud</groupId>
    <artifactId>spring-cloud-starter-alibaba-sentinel</artifactId>
</dependency>
```

Spring Cloud 集成会自动：

- 为 OpenFeign 调用添加 Sentinel 保护
- 为 RestTemplate 调用添加 Sentinel 保护
- 为 Web 请求添加 Sentinel 保护（URL 作为资源名）

## 动态规则扩展

Sentinel 支持通过外部数据源动态管理规则，无需重启服务。

### 支持的数据源

| 数据源 | 说明 |
|--------|------|
| **文件** | 本地文件监听 |
| **Nacos** | Nacos 配置中心 |
| **ZooKeeper** | ZooKeeper 节点监听 |
| **Apollo** | Apollo 配置中心 |
| **Redis** | Redis 键监听 |
| **Consul** | Consul 配置中心 |

### Nacos 数据源示例

```yaml
spring:
  cloud:
    sentinel:
      datasource:
        flow-rules:
          nacos:
            server-addr: 127.0.0.1:8848
            dataId: ${spring.application.name}-flow-rules
            groupId: SENTINEL_GROUP
            rule-type: flow
        degrade-rules:
          nacos:
            server-addr: 127.0.0.1:8848
            dataId: ${spring.application.name}-degrade-rules
            groupId: SENTINEL_GROUP
            rule-type: degrade
```

### Nacos 中的规则格式

```json
[
  {
    "resource": "orderService",
    "grade": 1,
    "count": 100,
    "strategy": 0,
    "controlBehavior": 0,
    "clusterMode": false
  }
]
```

### 数据源优先级

```text
代码配置 > 动态数据源 > Dashboard 配置
```

> 生产环境推荐使用 Nacos/ZooKeeper 作为数据源，实现规则的集中管理和动态推送。

## Sentinel Dashboard

### 功能

| 功能 | 说明 |
|------|------|
| **实时监控** | 查看资源的 QPS、响应时间、异常数 |
| **流控规则** | 在线配置流量控制规则 |
| **降级规则** | 在线配置熔断降级规则 |
| **热点规则** | 在线配置热点参数限流规则 |
| **系统规则** | 在线配置系统保护规则 |
| **集群规则** | 在线配置集群流控规则 |
| **机器列表** | 查看已接入的应用实例 |

### 启动

```bash
java -Dserver.port=8080 -Dcsp.sentinel.dashboard.server=localhost:8080 \
     -jar sentinel-dashboard.jar
```

### 注意事项

- Dashboard 推送的规则默认保存在内存中，重启会丢失
- 生产环境应使用外部数据源（Nacos/ZooKeeper）持久化规则
- Dashboard 只是管理工具，核心流控逻辑在应用端

## 生产环境建议

| 建议 | 说明 |
|------|------|
| **统一资源名** | 使用有意义的资源名，如 `服务名:方法名` |
| **合理设置阈值** | 根据压测结果设置，不要拍脑袋 |
| **配置降级兜底** | 每个资源都要有 blockHandler 或 fallback |
| **使用动态数据源** | 规则持久化，支持动态推送 |
| **监控告警** | 配置 Dashboard 监控 + 告警通知 |
| **限流日志** | 开启限流日志，便于排查问题 |
| **渐进式接入** | 先接入核心接口，逐步扩展 |

## 与 Seata 的配合

Sentinel 和 Seata 可以配合使用：

```java
@GlobalTransactional
@SentinelResource(value = "createOrder",
    blockHandler = "createOrderBlockHandler")
public void createOrder(OrderDTO dto) {
    // Seata 保证分布式事务
    // Sentinel 保证流量控制和熔断保护
    orderService.create(dto);
    storageService.deduct(dto.getProductId(), dto.getCount());
    accountService.debit(dto.getUserId(), dto.getMoney());
}
```

| 组件 | 职责 |
|------|------|
| **Seata** | 保证分布式事务一致性 |
| **Sentinel** | 保证流量控制和服务容错 |

> Sentinel 关注的是"流量治理"，Seata 关注的是"数据一致性"。两者互补，不冲突。
