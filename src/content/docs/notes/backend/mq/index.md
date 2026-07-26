---
title: 消息队列
description: 主流消息队列（RabbitMQ、Kafka、RocketMQ、Pulsar）核心对比、选型逻辑与工程实践。
category: Backend
tags:
  - Message Queue
  - Distributed Systems
  - Architecture
sidebar:
  order: 55
---

消息队列是分布式系统中用于**解耦、异步、削峰**的核心组件。选型没有绝对的"最好"，只有"最合适"——核心是根据业务场景对性能、可靠性、功能、运维成本四个维度的不同权重进行取舍。

<!-- more -->

## 四大 MQ 核心对比

| 特性 | RabbitMQ | Apache Kafka | Apache RocketMQ | Apache Pulsar |
|------|----------|-------------|-----------------|---------------|
| **核心定位** | 轻量级、通用消息中间件 | 分布式流处理平台 | 金融级、高可靠消息中间件 | 云原生、分层架构的流存储 |
| **开发语言** | Erlang | Scala/Java | Java | Java |
| **单机吞吐量** | **万级** QPS | **十万/百万级** QPS | **十万级** QPS | **百万级** QPS |
| **消息模型** | Push/Pull 双模式 | Pull 模式 | Pull 模式 | Push/Pull 双模式 |
| **消息延迟** | 微秒级 | 毫秒级 | 毫秒级 | 毫秒级 |
| **核心优势** | 功能丰富、复杂路由、管理界面完善 | 极致吞吐量、生态成熟、事实标准 | 高可靠、事务消息、顺序消息、功能全面 | 计算存储分离、弹性好、多租户、跨地域复制 |
| **主要缺点** | 吞吐量相对较低、Erlang 排查有门槛 | 功能相对简单、不支持重试、Partition 过多影响性能 | 生态和社区相对 Kafka 稍弱 | 架构复杂、部署运维成本高 |
| **适用场景** | 中小型系统、微服务解耦、异步任务 | 日志收集、用户行为追踪、实时数据管道 | 电商交易、订单/支付系统、金融场景 | 大型多云/跨机房架构、IoT 场景 |

## 消息模型对比

| 模型 | 说明 | 使用者 |
|------|------|--------|
| **队列（Queue）** | 点对点，一条消息只被一个消费者消费 | RabbitMQ |
| **发布订阅（Pub/Sub）** | 一条消息被所有订阅者消费 | 所有 MQ |
| **消费组（Consumer Group）** | 同组内竞争消费，不同组独立消费 | Kafka、RocketMQ、Pulsar |
| **Exchange 路由** | 通过 Binding Key 灵活路由到不同队列 | RabbitMQ |

## 选型决策树

```text
需要消息队列？
  ├─ 日志收集、大数据管道、极致吞吐 → Kafka
  ├─ 金融交易、订单支付、强一致 → RocketMQ
  ├─ 中小系统、微服务解耦、功能丰富 → RabbitMQ
  └─ 多云架构、跨地域、多租户 → Pulsar
```

## 通用能力对比

| 能力 | RabbitMQ | Kafka | RocketMQ | Pulsar |
|------|----------|-------|----------|--------|
| **事务消息** | 支持 | 支持（幂等） | 支持（原生） | 支持 |
| **顺序消息** | 不保证 | Partition 内有序 | 支持（全局/分区） | 支持 |
| **延迟消息** | 插件支持 | 不支持（需外部实现） | 原生支持（18 个级别） | 原生支持 |
| **消息回溯** | 不支持 | 支持（按 offset/时间） | 支持（按时间） | 支持（按时间） |
| **死信队列** | 原生支持 | 不支持 | 支持 | 支持 |
| **消息重试** | 支持 | 不支持（需自行实现） | 支持（自动重试） | 支持 |
| **消息堆积** | 一般（内存优先） | 极强（磁盘顺序写） | 强（磁盘） | 极强（BookKeeper） |
| **多租户** | 不支持 | 不支持 | Namespace 隔离 | 原生支持 |

## 知识库结构

- [RabbitMQ](/notes/backend/mq/rabbitmq/)：AMQP 协议、Exchange 路由、确认机制、集群镜像队列
- [Apache Kafka](/notes/backend/mq/kafka/)：Partition 设计、零拷贝、Consumer Group、Exactly-Once 语义
- [Apache RocketMQ](/notes/backend/mq/rocketmq/)：事务消息、顺序消息、延迟消息、Tag/Key 过滤
- [Apache Pulsar](/notes/backend/mq/pulsar/)：计算存储分离、BookKeeper、Segment 存储、多租户

## 面试话术

> 消息队列的选型没有绝对的"最好"，只有"最合适"。核心是根据业务场景对性能、可靠性、功能、运维成本四个维度的不同权重进行取舍。
>
> 如果是一个高并发、大数据量的日志处理系统，我会选择 Kafka；如果是金融或电商的核心交易链路，需要强事务和顺序保证，RocketMQ 是更稳妥的选择；对于中型企业的内部微服务，RabbitMQ 功能完善且易于上手；如果是全新的云原生项目，且团队有足够的技术实力，Pulsar 值得作为考察对象。

## Related

- [Seata 分布式事务](/notes/backend/seata/)：事务消息与分布式事务的配合
- [Sentinel 流量治理](/notes/backend/sentinel/)：MQ 消费者的限流保护
- [Java 微服务架构治理实践](/notes/backend/java-microservice-architecture-governance/)：事件驱动架构
- [DDD 领域驱动设计](/notes/ddd/)：领域事件与消息队列
