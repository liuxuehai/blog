---
title: Sentinel 适配与规则数据源
description: Sentinel 自动配置、Web 拦截器、规则转换器与初始化时机。
category: Backend
tags: [Source Reading, Spring Cloud Alibaba, Sentinel, Circuit Breaker]
order: 84
updatedDate: 2026-08-19
difficulty: advanced
status: stable
lastReviewed: 2026-08-19
draft: false
sidebar:
  order: 84
---

Sentinel starter 把 Spring Web、配置属性和外部规则源接到 Sentinel 核心，不重新实现滑动窗口、Slot 链或熔断状态机。

<!-- more -->

## 先给答案：Sentinel 适配的任务是把外部规则接入应用调用链，而不是重新实现流控算法

适配层负责自动配置、规则数据源、资源命名和异常转换，把 Sentinel 的 Entry/Slot 保护链接到 Spring MVC、Feign 或 WebFlux 的入口。规则更新还要处理快照、监听和失败回退，不能只在启动时读取一次。

限流、熔断、系统保护和降级响应发生在不同层次；一个请求被拒绝不一定是 QPS 超限，也可能是慢调用比例、并发数或系统负载触发。排查时要记录资源名、规则类型、触发原因和最终异常转换。


## 适配图

```text
properties -> SentinelProperties -> AutoConfiguration
                           -> WebMvc/WebFlux interceptor
                           -> DataSourceHandler -> rules
                           -> CircuitBreakerFactory -> Entry
```

## 自动配置

- `SentinelAutoConfiguration:53` 是核心入口，`55-71` 注册配置和数据源处理器。
- `SentinelProperties:43-44` 绑定统一前缀。
- `SentinelWebAutoConfiguration:50` 受 Web MVC 和类路径条件控制。
- `sentinelWebMvcConfig:75-102` 选择自定义 handler、跳转页或默认处理器。
- `SentinelWebAutoConfiguration:105-108` 注册 MVC configurer。
- WebFlux 对应 `SentinelWebFluxAutoConfiguration:53-91`。

## 规则数据源

- `SentinelDataSourceHandler:51` 实现 `SmartInitializingSingleton`。
- `afterSingletonsInstantiated:78` 在普通单例初始化后读取数据源。
- `NacosDataSourceFactoryBean:35`、`FileRefreshableDataSourceFactoryBean:34` 是具体数据源工厂。
- `SentinelAutoConfiguration:81-153` 注册 JSON/XML 多类规则转换器。

## 熔断适配

`SentinelCircuitBreakerFactory:33` 把 Spring Cloud 的 resource name 转成 Sentinel Entry；配置创建见 `:37-45`，默认行为见 `configureDefault:55`。

## 为什么延迟到所有单例完成

**替代方案**：配置类构造阶段立即创建所有 DataSource。
**为什么不行**：自定义 converter、Nacos manager 或业务规则 Bean 可能尚未注册。
**证据**：`SentinelDataSourceHandler` 实现 `SmartInitializingSingleton`，在 `afterSingletonsInstantiated:78` 安装外部规则。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| MVC 与 WebFlux 同时启用 | 适配重复 | 两套条件同时满足 | 明确应用类型和 starter |
| 规则格式错误 | 刷新失败 | converter 解析失败 | 测试 JSON/XML schema |
| block handler 未生效 | 使用默认错误页 | Bean 类型或条件不匹配 | 检查 handler 接口和条件 |

## 可迁移知识

`SmartInitializingSingleton` 适合依赖所有 Bean 已存在、又不想污染 `@PostConstruct` 的插件初始化。规则转换器按类型注册，是开放封闭原则在配置系统中的落地。

> **面试锚点**
> - Sentinel starter 为什么不实现核心限流算法？
> - `SmartInitializingSingleton` 比构造器初始化晚在哪里？
> - Web MVC 和 WebFlux 适配点有什么差异？

## Related

- [Sentinel 概念笔记](/notes/backend/sentinel/)
- [Spring Security 过滤器链](/notes/source/java/spring/spring-security/filter-chain/)
- [整体架构](/notes/source/java/spring/spring-cloud-alibaba/architecture/)
