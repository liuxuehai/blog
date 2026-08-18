---
title: 整体架构
description: OpenFeign 从自动配置、接口注册到代理调用的分层与两条主流程。
category: Backend
tags: [Source Reading, Spring Cloud OpenFeign, Architecture]
order: 61
updatedDate: 2026-08-15
difficulty: advanced
status: stable
lastReviewed: 2026-08-15
draft: false
sidebar:
  order: 61
---

OpenFeign 的核心不是“生成一个代理”这么简单，而是把客户端配置、接口契约和运行时请求拆到可替换的 Spring 扩展点中。

<!-- more -->

## 分层

```text
应用接口
  └─ @FeignClient
      └─ FeignClientsRegistrar
          └─ FeignClientFactoryBean
              ├─ FeignClientFactory / NamedContextFactory
              ├─ SpringMvcContract
              ├─ Encoder / Decoder / ErrorDecoder
              ├─ Client: LoadBalancer -> HTTP client
              └─ Targeter: 普通代理或熔断代理
```

| 层 | 职责 | 核心抽象 | 关键源码 |
| --- | --- | --- | --- |
| 注册层 | 扫描接口并注册 BeanDefinition | `ImportBeanDefinitionRegistrar` | `FeignClientsRegistrar:71` |
| 配置层 | 维护全局与客户端专属 Bean | `NamedContextFactory` | `FeignClientFactory:40` |
| 契约层 | 把注解方法解析为请求元数据 | `Contract` | `SpringMvcContract:98` |
| 构建层 | 组装 Builder、能力和目标地址 | `FactoryBean` | `FeignClientFactoryBean:81` |
| 执行层 | 发送 HTTP 并处理服务治理 | `Client`、`InvocationHandler` | `FeignBlockingLoadBalancerClient:57` |

## 核心抽象

- `FeignClientsRegistrar`：在配置类导入阶段发现 `@FeignClient`，为接口注册 `FeignClientFactoryBean`。
- `FeignClientFactory`：继承 `NamedContextFactory<FeignClientSpecification>`，让 `contextId` 成为配置隔离边界。
- `FeignClientFactoryBean`：延迟取得工厂，组装 Builder，解析目标并委托 `Targeter`。
- `Targeter`：把“如何结束构建”抽象出来，普通模式调用 `feign.target`，熔断模式替换 InvocationHandler。

## 主流程一：启动

```text
@Configuration
    │ @EnableFeignClients
    ▼
FeignClientsRegistrar
    │ scan / validate interface
    ▼
BeanDefinition(FeignClientFactoryBean)
    │ FeignAutoConfiguration
    ▼
FeignClientFactory + client child context
    │ getObject on injection
    ▼
Feign.Builder + Contract + Codec + Client + Targeter
```

1. `EnableFeignClients` 通过 `@Import(FeignClientsRegistrar.class)` 接入 Spring 注册阶段，见 `EnableFeignClients:41`。
2. `FeignClientsRegistrar#registerFeignClients` 扫描候选接口并在 `registerFeignClient` 中校验类型，见 `FeignClientsRegistrar:172-218`。
3. `FeignAutoConfiguration#feignContext` 创建 `FeignClientFactory` 并注入客户端规格，见 `FeignAutoConfiguration:102-107`。
4. 真正需要接口实例时，`FeignClientFactoryBean#getObject` 取得 `FeignClientFactory` 并开始 Builder 组装，见 `FeignClientFactoryBean:460-518`。

## 主流程二：请求处理

```text
proxy.method(args)
  └─► Feign InvocationHandler
       └─► Contract metadata -> RequestTemplate
            └─► Client.execute
                 ├─► LoadBalancer.choose(serviceId)
                 ├─► delegate HTTP client
                 └─► Decoder -> return value
```

- 契约在创建代理时解析，不在每次调用时重复扫描注解：`SpringMvcContract#parseAndValidateMetadata:205`。
- 服务名 URL 由 `resolveTarget` 处理，带服务名而无固定 URL 时交给负载均衡客户端，见 `FeignClientFactoryBean:432-449`、`:538-568`。
- 负载均衡客户端选择实例后重写请求 URL，再委托底层 Feign `Client`，见 `FeignBlockingLoadBalancerClient#execute:79-135`。
- 响应返回后由 `SpringDecoder#decode:52-62` 对接 `HttpMessageConverter`。

## 扩展点全景

| 扩展点 | 接口 | 触发时机 | 典型用途 |
| --- | --- | --- | --- |
| 客户端扫描 | `@EnableFeignClients` | 配置类解析 | 指定 basePackages 或 clients |
| 方法契约 | `Contract` | Builder 创建 | 支持 Spring MVC 注解 |
| 请求编码 | `Encoder` | 发出请求前 | JSON、表单、文件 |
| 响应解码 | `Decoder` | 收到响应后 | JSON、`ResponseEntity` |
| 请求拦截 | `RequestInterceptor` | 模板转请求时 | Token、租户头 |
| 构建增强 | `Capability` | Builder 组装 | 缓存、Micrometer |
| 目标策略 | `Targeter` | 代理收尾 | 熔断、fallback |

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| 客户端名重复 | 配置互相覆盖 | `name` 与 `contextId` 边界混用 | 为不同配置显式设置不同 `contextId` |
| 固定 URL 与服务名并存 | 请求绕过服务发现 | `resolveTarget` 优先使用 URL | 明确选择直连或负载均衡模式 |
| 代理创建过早 | 缺少自定义 Codec | 子上下文尚未完成 | 避免在配置类静态初始化阶段主动取代理 |

## 可迁移知识

把“注册定义”和“运行时实例化”分开，是插件系统、RPC 客户端和多租户组件的通用做法；把 `contextId` 作为隔离键，则可复用到每租户连接池、每数据源方言和每下游服务的独立配置。

> **面试锚点**
> - 启动时注册的到底是接口实例还是 `FactoryBean`？
> - 为什么契约解析适合在代理构建阶段完成？
> - `Targeter` 抽象解决了普通代理和熔断代理的什么差异？

## Related

- [接口注册与代理](/notes/source/java/spring/spring-cloud-openfeign/client-registration/)
- [客户端配置隔离](/notes/source/java/spring/spring-cloud-openfeign/client-context/)
- [Spring Boot 自动装配](/notes/source/java/spring/spring-boot/)