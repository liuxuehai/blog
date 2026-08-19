---
title: 接口注册与代理
description: 从 @EnableFeignClients 到 FeignClientFactoryBean，再到 JDK 代理目标的注册和实例化过程。
category: Backend
tags: [Source Reading, Spring Cloud OpenFeign, Proxy, Spring]
order: 62
updatedDate: 2026-08-19
difficulty: advanced
status: stable
lastReviewed: 2026-08-19
draft: false
sidebar:
  order: 62
---

`@FeignClient` 的关键设计是注册一个带状态的 `FactoryBean`，而不是把接口本身直接当作组件。这样代理创建可以延迟到容器真正需要它时，并能读取客户端专属配置。

<!-- more -->

## 先给答案：FactoryBean 把“配置阶段的客户端定义”和“运行阶段的代理对象”分开

扫描阶段只需要登记接口、服务名和配置来源，不应立即发起网络请求；FactoryBean 在容器需要对象时创建真正的代理。这样客户端接口可以像普通 Bean 一样参与依赖注入，同时把目标地址、编码器和容错策略延迟到构建阶段组合。

`getObject()` 返回代理而不是 FactoryBean 本身，是 Spring 工厂语义的关键。排查客户端没注册时要区分扫描不到接口、FactoryBean 没创建、代理创建失败和调用阶段找不到实例。


## 注册链

```text
@EnableFeignClients
  └─► @Import(FeignClientsRegistrar)
       └─► scan candidate interfaces
            └─► registerFeignClient
                 └─► BeanDefinition(FeignClientFactoryBean)
                      └─► getObject()
                           └─► Feign.Builder.target()
```

`EnableFeignClients` 的注解定义直接导入注册器，见 `EnableFeignClients:41`。注册器在 `registerBeanDefinitions:152-154` 进入 `registerFeignClients:172`，扫描结果必须是接口，否则注册阶段失败。

## 为什么使用 FactoryBean

**替代方案**：在扫描阶段立即 `Proxy.newProxyInstance` 并注册代理。

**为什么不行**：代理需要 `Encoder`、`Decoder`、`Contract`、`Client` 和客户端属性，这些对象可能来自尚未创建的自动配置或子上下文。立即创建会把 Bean 注册时序和依赖解析时序耦合。

**源码证据**：`FeignClientsRegistrar#registerFeignClient:209-312` 注册的是 `FeignClientFactoryBean`；真正创建对象发生在 `FeignClientFactoryBean#getObject:460`。

## `getObject()` 的分叉

```text
getObject()
  ├─ context = FeignClientFactory
  ├─ builder = feign(context)
  ├─ url present? ──► HardCodedTarget
  └─ service name only? ─► LoadBalancer Client / Targeter
```

`FeignClientFactoryBean#getObject:460-518` 先取得 `FeignClientFactory`，再构建 Builder。`loadBalance:432-449` 负责检查 `Client` 是否存在并把最终代理交给 `Targeter`。URL 解析集中在 `resolveTarget:538-568`，避免注册器直接承担运行时路由决策。

## 代理目标与配置键

`name` 是服务发现和默认客户端标识，`contextId` 是子上下文和 Bean 名称隔离键。注册器在 `registerFeignClient:222-312` 将两者写入工厂 Bean；同一服务名可以通过不同 `contextId` 得到两套独立代理配置。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| `@FeignClient` 放在 class 上 | 注册异常 | OpenFeign 契约要求接口 | 让声明类型为 interface |
| fallback 不是接口实现 | 启动或第一次创建时报类型错误 | `validateFallback` 检查实现关系 | fallback 实现客户端接口 |
| 同一接口多次扫描 | Bean 名冲突 | 注册器按 name/contextId 生成定义 | 显式指定唯一 `contextId` |
| 过早调用代理 | 自定义配置未生效 | `FactoryBean` 依赖的子上下文尚未就绪 | 在容器初始化完成后使用 |

## 可迁移知识

`FactoryBean` 适合封装“声明式定义到运行时对象”的转换：例如数据库代理、RPC Stub、消息模板和按租户创建的 SDK。关键是把定义属性留在 BeanDefinition，把昂贵或依赖完整上下文的构建推迟到 `getObject()`。

> **面试锚点**
> - `@FeignClient` 为什么注册 `FactoryBean` 而不是代理对象？
> - `name`、`contextId`、`url` 分别影响什么？
> - OpenFeign 如何保证代理创建时能拿到客户端配置？

## Related

- [整体架构](/notes/source/java/spring/spring-cloud-openfeign/architecture/)
- [客户端配置隔离](/notes/source/java/spring/spring-cloud-openfeign/client-context/)
- [Spring Framework Bean 生命周期](/notes/source/java/spring/spring-framework/bean-lifecycle/)
