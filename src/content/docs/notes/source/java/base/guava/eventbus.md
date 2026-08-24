---
title: EventBus
description: EventBus 的反射注册、类型匹配、线程分派与异常处理边界。
category: Backend
tags: [Source Reading, Guava, EventBus, Reflection]
order: 64
updatedDate: 2026-08-24
difficulty: intermediate
status: stable
lastReviewed: 2026-08-24
draft: false
sidebar:
  order: 64
---

EventBus 把生产者与订阅者的直接引用改成运行时注册关系。它的实现很短，但反射、类型层次遍历、重入保护和异常隔离共同决定行为边界。

<!-- more -->

## 先给答案：EventBus 把生产者与订阅者的直接引用改成运行时注册关系

EventBus 把生产者与订阅者的直接引用改成运行时注册关系。它的实现很短，但反射、类型层次遍历、重入保护和异常隔离共同决定行为边界。 理解EventBus时，要先确认入口与状态归属，再跟踪控制流或数据流的推进顺序，最后落到对外可观察的结果。

主要失效边界集中在“没有订阅者、订阅方法阻塞、代码被 ProGuard/R8 裁剪”这些场景。它们破坏的是容量、顺序、并发或生命周期前提；排查时应先确认状态是否仍由正确对象持有，再核对推进条件和清理路径。

主要失效边界集中在“没有订阅者、订阅方法阻塞、代码被 ProGuard/R8 裁剪”这些场景。它们破坏的是容量、顺序、并发或生命周期前提；排查时应先确认状态是否仍由正确对象持有，再核对推进条件和清理路径。

```text
register(listener) -> scan @Subscribe -> event type -> Subscriber set
post(event)        -> assignable types -> Dispatcher -> invoke
```

## 实现拆解

`EventBus` 在 `EventBus.java:153`；注册与发布入口分别在 `EventBus.java:235`、`:259`。默认构造器选择 direct executor 和 per-thread dispatcher。

真正的反射扫描由 `SubscriberRegistry` 完成，类定义位于 `SubscriberRegistry.java:55`；它还要遍历父类和接口，以实现可赋值类型匹配，查询入口见 `SubscriberRegistry.java:117`。

`Dispatcher` 是抽象分派器（`Dispatcher.java:35`），per-thread 队列实现从 `:74` 开始，legacy queue 实现从 `:158` 开始，立即分派实现从 `:182` 开始。`AsyncEventBus` 只替换执行器，事件模型仍是注册表加分派器。

订阅者调用异常进入 `SubscriberExceptionHandler`，而不是直接向 `post` 调用者传播；这让总线能继续处理后续订阅者，但也隐藏了失败。

### 为什么默认使用线程本地队列

**替代方案**：递归地立即调用订阅者。
**为什么不行**：订阅者再次 `post` 时会产生深递归和难以预测的重入顺序。
**证据**：`Dispatcher.PerThreadQueuedDispatcher#dispatch`（`Dispatcher.java:99`）先把事件和订阅者放入线程本地队列，再循环消费；嵌套发布因此转成队列顺序。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| 没有订阅者 | 事件包装为 `DeadEvent` 再发布 | 总线提供二次观察机会 | 注册 dead-event 监控 |
| 订阅方法阻塞 | `post` 调用线程被拖住 | 默认执行器是 direct executor | 使用 `AsyncEventBus` |
| 代码被 ProGuard/R8 裁剪 | 订阅方法找不到 | 注册依赖反射和注解 | 配置保留规则或改用显式接口 |
| 需要背压或批处理 | 总线无法控制消费速度 | EventBus 没有流量控制协议 | 使用 Reactor、RxJava 或消息系统 |

## 可迁移知识

反射注册适合低频、插件化、进程内通知；高频路径应在启动期生成索引或使用显式接口。线程本地队列是处理重入的通用手法，但必须定义异常、取消和队列上限。

> **面试锚点**
> - EventBus 如何匹配父类和接口订阅者？
> - 为什么默认 dispatcher 不是简单递归调用？
> - `AsyncEventBus` 改变了什么，没改变什么？

## Related

- [整体架构](/notes/source/java/base/guava/architecture/)
- [Spring 事件机制](/notes/source/java/spring/spring-framework/architecture/)
