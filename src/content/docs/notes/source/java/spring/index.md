---
title: Spring 生态
description: Spring Framework、Spring Boot、安全、数据访问与云原生组件的源码解析索引。
category: Backend
tags:
  - Source Reading
  - Spring
  - Java
order: 1
updatedDate: 2026-08-15
difficulty: advanced
status: learning
lastReviewed: 2026-08-15
draft: false
sidebar:
  order: 1
---

Spring 生态分组对应 `E:\source\java\spring\`，从 IoC 容器、AOP 与事务底座开始，再向 Boot、Security 和云组件扩展。

<!-- more -->

## 分册

| 仓库 | 主题 | 状态 |
| --- | --- | --- |
| [spring-framework](/notes/source/java/spring/spring-framework/) | IoC 容器、Bean 生命周期、AOP、事务、资源抽象 | ✅ 9 篇 |
| [spring-boot](/notes/source/java/spring/spring-boot/) | 启动、自动装配、条件注解、Actuator | ✅ 9 篇 |
| [spring-security](/notes/source/java/spring/spring-security/) | 过滤器链、认证、授权与上下文传播 | ✅ 7 篇 |
| [spring-cloud-gateway](/notes/source/java/spring/spring-cloud-gateway/) | WebFlux、路由、过滤器、限流熔断 | ✅ 7 篇 |
| [spring-cloud-openfeign](/notes/source/java/spring/spring-cloud-openfeign/) | 客户端代理、契约、编解码与重试 | ✅ 7 篇 |
| [spring-data-redis](/notes/source/java/spring/spring-data-redis/) | 连接工厂、模板、序列化、Pub/Sub 与 Stream | ✅ 9 篇 |
| [spring-cloud-alibaba](/notes/source/java/spring/spring-cloud-alibaba/) | Nacos、Sentinel、RocketMQ、Seata 的 Spring 适配 | ✅ 7 篇 |

## 阅读顺序

先读 Framework 的 `ApplicationContext#refresh()` 与 `DefaultListableBeanFactory`，再读 Boot 如何把外部配置和自动装配接入这条基础链路。

## Related

- [Java 源码解析索引](/notes/source/java/)
- [源码解析总览](/notes/source/)
