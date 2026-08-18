---
title: 客户端配置隔离
description: NamedContextFactory 如何为每个 Feign 客户端创建独立配置空间，以及属性覆盖的优先级边界。
category: Backend
tags: [Source Reading, Spring Cloud OpenFeign, Context, Configuration]
order: 64
updatedDate: 2026-08-15
difficulty: advanced
status: stable
lastReviewed: 2026-08-15
draft: false
sidebar:
  order: 64
---

OpenFeign 没有把所有客户端 Bean 放进同一个应用上下文，而是用 `FeignClientFactory` 为每个客户端维护一个命名子上下文。这是“同一应用中多个下游拥有不同 Codec、超时和拦截器”的基础。

<!-- more -->

## 上下文结构

```text
ApplicationContext
  ├─ FeignClientFactory
  │    ├─ orders-context
  │    │    └─ FeignClientsConfiguration + orders config
  │    └─ users-context
  │         └─ FeignClientsConfiguration + users config
  └─ shared infrastructure
```

`FeignClientFactory:40` 继承 `NamedContextFactory<FeignClientSpecification>`。`FeignAutoConfiguration#feignContext:102-107` 创建工厂并设置 `FeignClientSpecification` 列表；工厂提供 `getInstance` 和 `getInstanceWithoutAncestors`，见 `FeignClientFactory:52-65`。

## 为什么不用全局单例配置

**替代方案**：所有 Feign 客户端共享一组全局 `Encoder`、`Request.Options` 和 `RequestInterceptor`。

**为什么不行**：不同下游常常拥有不同认证、超时、序列化格式和重试边界；全局 Bean 会导致配置相互污染，也无法让同一服务的两套访问策略共存。

**设计取舍**：子上下文增加了 Bean 查找和生命周期复杂度，但换来明确的配置作用域。`FeignClientFactoryBean` 通过 `getInheritedAwareOptional`、`getInstances` 等方法控制是否继承父上下文，见 `FeignClientFactoryBean:402-428`。

## 属性与 Bean 的覆盖

客户端配置通常由两层组成：`FeignClientsConfiguration` 提供默认 Bean，`@FeignClient(configuration=...)` 或属性类提供覆盖。`FeignClientFactoryBean#feign:140-258` 先读取子上下文的 Encoder、Decoder、Contract、Logger、Options 和 Capability，再由属性配置覆盖具体 Builder 设置。

## AOT 约束

当前版本还包含 `FeignChildContextInitializer` 和 `FeignClientBeanFactoryInitializationAotProcessor`，用于在 AOT/native 场景提前生成客户端子上下文初始化代码。运行时依赖反射的接口代理、fallback 和泛型类型必须被运行时提示覆盖，不能只按 JVM 反射路径验证。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| 配置类被主应用扫描 | 默认 Bean 被意外覆盖 | 客户端专属配置进入了父上下文 | 把配置类放到扫描范围外或使用明确 package |
| 多客户端共用 contextId | 超时/拦截器串用 | 子上下文键相同 | 每套配置使用唯一 `contextId` |
| 父上下文 Bean 不可见 | 自定义组件找不到 | 使用了 without ancestors 查找 | 判断组件是否应共享，再选择注册层级 |
| native 镜像缺少提示 | 运行时代理或 fallback 失败 | 动态类型未登记 | 使用项目提供的 AOT 处理链并覆盖自定义类型 |

## 可迁移知识

命名子上下文适用于插件隔离、租户隔离和多数据源系统：父上下文承载共享基础设施，子上下文承载局部策略。隔离键必须稳定且可观测，否则排查“哪个配置生效”会非常困难。

> **面试锚点**
> - `FeignClientFactory` 为什么继承 `NamedContextFactory`？
> - 父上下文 Bean 和客户端子上下文 Bean 如何取舍？
> - `name` 与 `contextId` 哪个决定配置隔离？

## Related

- [整体架构](/notes/source/java/spring/spring-cloud-openfeign/architecture/)
- [接口注册与代理](/notes/source/java/spring/spring-cloud-openfeign/client-registration/)
- [Spring Framework IoC 容器](/notes/source/java/spring/spring-framework/architecture/)