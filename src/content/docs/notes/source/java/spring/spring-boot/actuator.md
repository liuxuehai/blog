---
title: Actuator 端点模型
description: Endpoint、Operation、EndpointDiscoverer 与 WebEndpointAutoConfiguration 的源码链路。
category: Backend
tags: [Source Reading, Spring Boot, Actuator]
order: 27
updatedDate: 2026-08-15
difficulty: advanced
status: stable
lastReviewed: 2026-08-15
draft: false
sidebar:
  order: 27
---

Actuator 将健康检查、指标、环境和映射信息抽象为端点操作，再由不同适配层暴露为 HTTP、JMX 或其他协议。

<!-- more -->

## 端点发现链路

```text
ApplicationContext beans
        │
        ▼
EndpointDiscoverer.discoverEndpoints
        ├─► find @Endpoint / extension beans
        ├─► create Operation invokers
        ├─► apply filters and access rules
        └─► WebEndpointDiscoverer
                └─► HTTP mapping
```

## 实现拆解

- `EndpointDiscoverer` 位于 `module/spring-boot-actuator/src/main/java/org/springframework/boot/actuate/endpoint/annotation/EndpointDiscoverer.java:74`。
- 构造器在 `:98` 接收应用上下文、参数映射器和过滤器。
- 发现入口 `discoverEndpoints()` 在 `:140`。
- 是否可调用的判断位于 `:216` 附近，结合访问级别和过滤器。
- 端点 Bean 元数据由内部 `EndpointBean` 保存，见 `:465`。
- 扩展端点由 `ExtensionBean` 表示，见 `:539`。
- `WebEndpointAutoConfiguration` 在 `module/spring-boot-actuator-autoconfigure/src/main/java/org/springframework/boot/actuate/autoconfigure/endpoint/web/WebEndpointAutoConfiguration.java:68`。
- 该配置在 `:92` 创建 `WebEndpointDiscoverer`，再由 Web 层映射到 HTTP。

## 为什么先抽象 Operation 再适配协议

**替代方案**：每个端点直接写一个 MVC Controller。
**为什么不行**：JMX、HTTP 和测试会复制同一套发现、权限和参数转换逻辑，端点无法保持协议无关。
**证据**：`EndpointDiscoverer` 先产生 `Operation`，`WebEndpointDiscoverer` 只负责 Web 暴露，适配层与领域操作分离。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| 暴露全部端点 | 敏感信息泄露 | 端点默认访问面过宽 | 明确 include/exclude 与鉴权 |
| 自定义端点参数无法转换 | 请求返回 400 | 参数映射器缺少转换器 | 注册 endpoint converter |
| 端点 Bean 未被发现 | URL 不存在 | 未注册为 Bean 或条件未命中 | 检查自动配置和组件注册 |

## 可迁移知识

先设计协议无关的能力模型，再提供多个传输适配器，可以同时支持管理面、命令行和远程 API，并减少安全策略重复。

> **面试锚点**
> - Actuator 端点和普通 Controller 的核心差异是什么？
> - `EndpointDiscoverer` 做了哪些工作？
> - 如何限制生产环境的端点暴露面？

## Related

- [条件注解与评估报告](/notes/source/java/spring/spring-boot/conditions/)
- [内嵌 Web Server](/notes/source/java/spring/spring-boot/web-server/)
- [Spring Framework AOP 代理](/notes/source/java/spring/spring-framework/aop-proxy/)