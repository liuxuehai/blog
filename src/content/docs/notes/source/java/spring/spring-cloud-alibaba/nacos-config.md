---
title: Nacos 配置加载
description: Nacos Config Data Resolver、Loader、PropertySource 与动态刷新链路。
category: Backend
tags: [Source Reading, Spring Cloud Alibaba, Nacos, Config Data]
order: 82
updatedDate: 2026-08-19
difficulty: advanced
status: stable
lastReviewed: 2026-08-19
draft: false
sidebar:
  order: 82
---

Nacos 配置适配的关键是把 `nacos:` 位置解析成 Spring Boot Config Data 资源，再按 profile 和优先级进入环境。

<!-- more -->

## 先给答案：配置适配必须把“定位配置”和“加载配置”拆成两阶段

Resolver 根据应用名、group、namespace、profile 等上下文确定配置身份，Loader 再从 Nacos 获取内容并转换成 Spring 可识别的 PropertySource。两阶段分离后，定位规则可以独立于具体加载协议，也便于处理导入顺序和动态刷新。

动态刷新不是简单替换一个 Map：已有 Bean 是否重新绑定、哪些配置支持刷新、刷新失败是否保留旧值，都涉及运行时状态。排查配置不生效时要先确认 dataId/group/namespace，再确认 PropertySource 优先级和刷新事件是否到达。


## 调用链

```text
spring.config.import=nacos:app.yaml
  -> NacosConfigDataLocationResolver
  -> NacosConfigDataResource
  -> NacosConfigDataLoader
  -> ConfigService.getConfig
  -> PropertySource -> Environment
```

## 实现拆解

1. `NacosConfigDataLocationResolver:59` 实现 Boot 位置解析器。
2. `isResolvable:121-135` 识别 `nacos:` 与 `optional:` 形式。
3. `resolve:138-144`、`resolveProfileSpecific:146-163` 将 location 和 profile 展开为资源。
4. `resolve:225-227` 可把 `NacosConfigManager` 注册进 bootstrap registry。
5. `NacosConfigDataLoader:61` 实现资源加载器，`doLoad:75-108` 创建 `ConfigData`。
6. `pullConfig:155-164` 按 dataId/group 拉取配置，异常包装为资源异常。
7. `NacosConfigAutoConfiguration:37-75` 创建属性、manager 和刷新器。
8. `NacosConfigManager:52-72` 同步初始化 ConfigService。

## 为什么使用 Resolver + Loader 两阶段

**替代方案**：自动配置类直接读取 Nacos 并修改 Environment。
**为什么不行**：读取时机晚于 Config Data 的配置解析，无法自然表达 profile、optional 和导入优先级。
**证据**：Resolver 只负责 URI 到资源，Loader 才在 `doLoad:75` 执行 IO。

## 动态刷新

`NacosContextRefresher` 负责监听配置变化并发布刷新事件；初次加载与运行时刷新是两条链路，装配边界见 `NacosConfigAutoConfiguration:70-75`。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| 未加 `optional:` | Nacos 不可用时启动失败 | Loader 将异常视为资源缺失 | 非关键配置使用 optional |
| 多 profile | 覆盖顺序不直观 | Resolver 展开多个资源 | 明确 group、profile、导入顺序 |
| `@Value` 未刷新 | Bean 仍是旧值 | Bean 不支持重绑定 | 使用 `@RefreshScope` 或配置属性 |

## 可迁移知识

两阶段资源解析模式适合文件、密钥中心和远程模板：先把声明转成资源对象，再由 Loader 执行 IO，错误、缓存和 profile 组合可独立测试。

> **面试锚点**
> - Resolver 和 Loader 为什么不能合成一个类？
> - `optional:nacos:` 如何影响异常语义？
> - NacosConfigManager 为什么需要 bootstrap registry？

## Related

- [整体架构](/notes/source/java/spring/spring-cloud-alibaba/architecture/)
- [Spring Boot 配置与启动](/notes/source/java/spring/spring-boot/)
- [SecurityContext 存储与传播](/notes/source/java/spring/spring-security/security-context/)
