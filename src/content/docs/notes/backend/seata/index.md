---
title: Seata 分布式事务
description: Seata 四种事务模式（AT、TCC、Saga、XA）的原理、选型与工程实践。
category: Backend
tags:
  - Seata
  - Distributed Transaction
  - Microservices
  - Java
sidebar:
  order: 53
---

Seata 是一款开源的分布式事务解决方案，提供 AT、TCC、Saga、XA 四种事务模式，覆盖从无侵入自动回滚到高性能手工补偿的全场景。

<!-- more -->

## 核心组件

| 组件 | 角色 | 说明 |
|------|------|------|
| **TC（Transaction Coordinator）** | 事务协调者 | 维护全局事务和分支事务的状态，驱动二阶段提交或回滚 |
| **TM（Transaction Manager）** | 事务管理器 | 发起全局事务，定义全局事务的边界（`@GlobalTransactional`） |
| **RM（Resource Manager）** | 资源管理器 | 管理分支事务资源，注册分支事务，汇报分支状态 |

```text
TM 发起全局事务 → TC 注册并分配 XID
  ↓
各 RM 执行分支事务 → 向 TC 注册分支并汇报状态
  ↓
TC 汇总所有分支 → 全部成功则提交，有失败则回滚
```

## 四种模式速览

| 维度 | AT | TCC | Saga | XA |
|------|-----|-----|------|-----|
| 侵入性 | 低（自动代理） | 高（实现 try/confirm/cancel） | 高（实现正向/补偿） | 低（数据库协议层） |
| 一致性 | 最终一致 | 强一致 | 最终一致 | 强一致 |
| 性能 | 中等 | 高 | 高 | 低（锁持有时间长） |
| 适用场景 | 通用 CRUD | 高性能、资金、库存 | 长事务、跨系统编排 | 强一致、短事务 |
| 回滚方式 | 自动（undo_log） | 手动（cancel） | 手动（补偿操作） | 自动（数据库原生） |
| 隔离性 | 读未提交 | 可串行化 | 无保证 | 读已提交 |

## 选型决策

```text
需要分布式事务？
  ├─ 业务简单、CRUD 为主 → AT
  ├─ 高性能、资金/库存等强一致 → TCC
  ├─ 长事务、跨系统、需要补偿 → Saga
  └─ 强一致、短事务、数据库支持 XA → XA
```

> 实际项目中 AT 使用最多（占 80%+），因为它对业务无侵入；资金、库存等核心链路推荐 TCC；跨系统集成或遗留系统用 Saga。

## 依赖引入

```xml
<dependency>
    <groupId>io.seata</groupId>
    <artifactId>seata-spring-boot-starter</artifactId>
    <version>2.1.0</version>
</dependency>
```

## 基础配置

```yaml
seata:
  enabled: true
  application-id: ${spring.application.name}
  tx-service-group: my_tx_group
  service:
    vgroup-mapping:
      my_tx_group: default
  registry:
    type: nacos
    nacos:
      server-addr: 127.0.0.1:8848
  config:
    type: nacos
    nacos:
      server-addr: 127.0.0.1:8848
```

## 知识库结构

- [AT 模式](/notes/backend/seata/at-mode/)：自动代理、undo_log、脏写检测、全局锁
- [TCC 模式](/notes/backend/seata/tcc-mode/)：Try-Confirm-Cancel、空回滚、幂等、悬挂
- [Saga 模式](/notes/backend/seata/saga-mode/)：状态机驱动、补偿策略、长事务编排
- [XA 模式](/notes/backend/seata/xa-mode/)：两阶段提交、数据库原生协议、强一致与性能权衡

## Related

- [缓存穿透、击穿、雪崩与 Hotkey 实战](/notes/backend/cache-penetration-breakdown-avalanche/)：缓存三大问题与热点探测
- [Java 微服务架构治理实践](/notes/backend/java-microservice-architecture-governance/)：服务边界与一致性
- [DDD 领域驱动设计](/notes/ddd/)：聚合、领域事件与跨聚合事务
