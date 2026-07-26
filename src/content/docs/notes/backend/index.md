---
title: Backend
description: 服务端架构、API、数据流与工程实践。
category: Backend
tags:
  - Backend
sidebar:
  order: 5
---

这里整理服务端架构、API 设计、运行时和数据流相关笔记，重点是清晰的边界和可维护实现。

## Current Notes

- [Java 微服务架构治理实践](/notes/backend/java-microservice-architecture-governance/)：服务边界、数据所有权、一致性、幂等与发布治理
- [缓存穿透、击穿、雪崩与 Hotkey 实战](/notes/backend/cache-penetration-breakdown-avalanche/)：缓存三大问题的根因、治理方案选型与京东 hotkey 热点探测
- [Seata 分布式事务](/notes/backend/seata/)：AT / TCC / Saga / XA 四种模式的原理、选型与工程实践
- [Sentinel 流量治理](/notes/backend/sentinel/)：流控规则、熔断降级、热点参数限流、系统保护、集群流控
- [消息队列](/notes/backend/mq/)：RabbitMQ / Kafka / RocketMQ / Pulsar 核心对比与选型
- [秒杀系统设计](/notes/backend/flash-sale/)：库存扣减、防超卖、逐层限流、降级熔断与异步下单

## Focus

- API 设计、错误处理和权限模型
- 服务端模块边界与数据流
- Java、Node.js、边缘运行时和后台任务
- 日志、配置、测试和可观测性

## Planned Notes

- API 返回结构和错误模型
- 服务层与数据访问层边界
- 后台任务与重试策略
- 服务端配置和环境变量管理

## Related

- [Database](/notes/database/)：数据建模和查询
- [Cloudflare](/notes/cloudflare/)：边缘运行时与部署
