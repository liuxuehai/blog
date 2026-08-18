---
title: 面试专题
description: Spring Framework 源码面试题：refresh、Bean 生命周期、三级缓存、AOP、事务与资源抽象。
category: Backend
tags:
  - Source Reading
  - Spring Framework
  - Interview
order: 19
updatedDate: 2026-08-15
difficulty: advanced
status: stable
lastReviewed: 2026-08-15
draft: false
sidebar:
  order: 19
---

Spring 面试的区分度在于能否把注解行为还原成容器时序、缓存结构和代理调用链。

<!-- more -->

## 高频题

### `refresh()` 做了什么？

**30 秒版**：它先准备环境并取得 BeanFactory，再执行定义级后置处理器、注册实例级后置处理器，初始化事件和消息设施，最后预实例化非懒加载单例并发布刷新完成状态。

**展开**：入口是 `AbstractApplicationContext.java:582`，BFPP 在 `:795`，BPP 在 `:812`，单例预实例化在 `:943`。

**加分项**：处理器注册必须早于 `preInstantiateSingletons()`，否则已创建对象无法经过完整扩展链。

**常见错答**：把 `refresh()` 说成只加载 XML 或扫描注解。

### 三级缓存为什么是三级？

**30 秒版**：一级存成品，二级存已生成的早期引用，三级存能按需生成早期引用的工厂。三级让 AOP 有机会在循环依赖注入前返回代理，而不是固定原始对象。

**展开**：`DefaultSingletonBeanRegistry.java:159`、`:183`、`:208` 对应三层的写入和读取；`AbstractAutowireCapableBeanFactory.java:596` 放入 factory。

**加分项**：构造器循环依赖没有实例可提前暴露，因此三级缓存也无能为力。

**常见错答**：说三级缓存分别是“创建中、创建完、销毁中”。

### Spring AOP 为什么会失效？

**30 秒版**：代理只拦截经过代理对象的调用，同类 self-invocation 直接调用目标对象，不会进入拦截器链。private/final 方法和代理类型选择也会形成边界。

**展开**：`AbstractAutoProxyCreator.java:285` 在初始化后包装，`:321` 筛选并创建代理，`:440` 组装 `ProxyFactory`。

**加分项**：循环依赖时会走 `getEarlyBeanReference()`，要保证 early 和最终暴露对象的代理语义一致。

**常见错答**：认为类上有 `@Transactional` 就能拦截类内所有调用。

### `@Transactional` 如何决定提交还是回滚？

**30 秒版**：`TransactionInterceptor` 解析方法事务属性，创建事务后执行目标；正常返回提交，异常按 rollback 规则决定回滚，最后清理线程上下文。

**展开**：`TransactionInterceptor.java:119` 适配调用，`TransactionAspectSupport.java:333` 完成主流程。

**加分项**：响应式事务根据 reactive 返回类型选择适配器，不能简单套用 ThreadLocal 模型。

**常见错答**：认为所有异常都会自动回滚。

## 高难追问

### 为什么 BeanFactoryPostProcessor 不能随意取 Bean？

它运行在 Bean 实例化前，取业务 Bean 会触发提前创建，使部分 BPP、代理或依赖定义尚未就绪。BFPP 应修改 BeanDefinition，而不是把实例创建混入定义阶段。

### 为什么 `classpath*:` 可能返回多个同名资源？

它会遍历多个 ClassLoader 来源和 jar/目录，设计目标是收集全部匹配资源，而不是选出单一文件。调用方必须定义合并顺序和去重策略。

### prototype 为什么没有完整销毁回调？

容器不缓存 prototype 实例，也就无法在关闭时枚举所有实例。若实例持有资源，调用方或自定义 scope 必须承担释放责任。

## 场景题

### 启动很慢，如何定位？

先区分 `refresh()` 阶段和单个 Bean 初始化阶段，再检查扫描范围、非懒加载单例、工厂方法、远程连接和 BPP。重点观察 `finishBeanFactoryInitialization()` 到 `preInstantiateSingletons()` 的耗时。

### 线上出现“事务不生效”，如何排查？

确认调用对象是否为代理、方法是否可被当前代理策略拦截、调用是否为 self-invocation，再确认事务属性解析和管理器绑定。不要先假设是数据库提交问题。

## 反向问面试官

- 你们使用 JDK 代理还是类代理，是否允许 self-invocation 依赖事务？
- 测试上下文缓存和 `@DirtiesContext` 的使用边界是什么？

## Related

- [整体架构](/notes/source/java/spring/spring-framework/architecture/)
- [三级缓存与循环依赖](/notes/source/java/spring/spring-framework/circular-dependency/)
- [AOP 代理创建](/notes/source/java/spring/spring-framework/aop-proxy/)
- [事务拦截器](/notes/source/java/spring/spring-framework/transaction/)
