---
title: Java
description: Java 生态 32 个开源仓库的源码解析索引：Spring、消息中间件、RPC、存储、网络与基础库、诊断工具。
category: Backend
tags:
  - Source Reading
  - Java
order: 1
updatedDate: 2026-08-16
difficulty: advanced
status: learning
lastReviewed: 2026-08-16
draft: false
sidebar:
  order: 1
---

Java 部分共 32 个仓库，按 `E:\source\java\` 下的分组组织，与源码目录一一对应。

<!-- more -->

## 分组

| 分组 | 仓库数 | 内容 | 状态 |
| --- | --- | --- | --- |
| [网络与基础库](/notes/source/java/base/) | 9 | netty · tomcat · zookeeper · guava · jackson-databind · fastjson2 · hutool · caffeine · disruptor | 5/9 |
| [Spring 生态](/notes/source/java/spring/) | 7 | spring-framework · spring-boot · spring-security · spring-cloud-gateway · spring-cloud-openfeign · spring-data-redis · spring-cloud-alibaba | 7/7 |
| [存储与 ORM](/notes/source/java/storage/) | 7 | mybatis-3 · mybatis-plus · shardingsphere · druid · redisson · jedis · hikaricp | 7/7 |
| [RPC 与微服务](/notes/source/java/rpc/) | 5 | dubbo · nacos · sentinel · seata · xxl-job | 5/5 |
| [消息中间件](/notes/source/java/mq/) | 2 | rocketmq · kafka | 2/2 |
| [诊断工具](/notes/source/java/tools/) | 2 | arthas · skywalking | 2/2 |

未完成分组的入口会在其第一册落地后开放。

## 阅读顺序建议

先小后大，先数据结构后框架：

1. **disruptor**（已完成）→ 并发与内存模型的地基，代码量最小
2. **mybatis-3** → 设计模式密度最高，规模适中
3. **netty** → 网络编程内核，后面很多框架的底座
4. **spring-framework** → IoC / AOP / 事务，Java 生态第一必读
5. **rocketmq / dubbo** → 中间件的存储与治理

## Related

- [源码解析总览](/notes/source/)
- [Backend](/notes/backend/)


