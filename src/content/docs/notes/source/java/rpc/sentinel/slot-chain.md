---
title: Slot 链与调用入口
description: 从 SphU、CtSph 到 ProcessorSlotChain，追踪 Sentinel 一次 entry/exit 的完整生命周期。
category: Backend
tags: [Source Reading, Sentinel, Slot Chain]
order: 42
updatedDate: 2026-08-20
difficulty: advanced
status: stable
lastReviewed: 2026-08-20
draft: false
sidebar: { order: 42 }
---

`entry` 不是一次简单的计数，而是把资源包装成 `ResourceWrapper`，找到资源共享的 Slot 链，再让每个 Slot 通过 `fireEntry` 递归推进。异常会沿链返回，`exit` 再沿反方向完成统计和熔断反馈。

## 先给答案：Slot 链把一次调用变成有顺序的保护检查

进入资源时创建 Entry 和上下文，随后依次经过统计、热点参数、流控、熔断和系统保护 Slot；任一 Slot 拒绝就立即失败，全部通过才执行真实业务。退出时沿相反方向释放 Entry、更新耗时和异常统计。

顺序不是装饰：统计必须先记录，流控和熔断才能使用数据；异常退出若跳过 `exit`，线程复用时可能遗留上下文，后续请求会被错误关联。新增 Slot 也应明确它读取哪个统计量、在哪一步拒绝、如何回滚状态。

## 调用链

```text
SphU.entry("order")
  -> CtSph.entry(resource, count, args)
  -> ContextUtil.getContext / 默认 Context
  -> lookProcessChain(resource)
  -> chain.entry(...)
       StatisticSlot
        -> AuthoritySlot
         -> SystemSlot
          -> FlowSlot
           -> DegradeSlot
            -> next/null
  -> Entry
  -> 业务代码
  -> Entry.exit()
```

## 资源与链缓存

`CtSph` 用 `ResourceWrapper` 作为 `chainMap` 的 key。第一次访问资源时在锁内 double-check，创建链后复制旧 Map 并整体替换引用。读路径无锁，写路径低频且保持发布后的 Map 不变，适合大量并发读。

`SlotChainProvider` 只解析一次 `SlotChainBuilder`，默认实现由 `@Spi(isDefault = true)` 标记。默认 builder 再读取所有 `ProcessorSlot`，按 SPI 顺序串成 `DefaultProcessorSlotChain`。

## entry / exit 语义

```text
entry 成功: 逐层向后执行，最后返回 Entry
entry 阻断: 当前 Slot 抛 BlockException，前面已执行的 Slot 通过异常路径记录状态
业务异常: Entry 保存 error，exit 时统计为 exception
exit: StatisticSlot 完成时间、RT、成功/异常，DegradeSlot 接收结果
```

异步入口的关键区别是：通过 Slot 链后才初始化异步上下文，并从当前线程 Context 移除当前 Entry，避免后台执行期间污染调用线程栈。

## 为什么这么设计

**替代方案一：** 用一个巨大 `checkAllRules` 方法。**问题：** 策略顺序、扩展和异常传播难以隔离。**选择：** 链式 Slot 让每个治理维度只关心自己的输入输出。

**替代方案二：** 每个资源一套独立规则对象和检查器。**问题：** 链对象、规则对象和生命周期会重复膨胀。**选择：** 链按资源共享，规则由 Manager 按资源查找。

**替代方案三：** 用可变共享 Map 原地更新链缓存。**问题：** 并发读可能看到中间状态。**选择：** 构造新 Map 后 volatile 发布，读取路径保持简单。

## 源码坐标索引

- `SphU#entry` — `sentinel-core/src/main/java/com/alibaba/csp/sentinel/SphU.java:43`
- `CtSph#entry` — `sentinel-core/src/main/java/com/alibaba/csp/sentinel/CtSph.java:175`
- `CtSph#entryWithPriority` — `sentinel-core/src/main/java/com/alibaba/csp/sentinel/CtSph.java:117`
- `CtSph#lookProcessChain` — `sentinel-core/src/main/java/com/alibaba/csp/sentinel/CtSph.java:194`
- `CtSph#asyncEntryInternal` — `sentinel-core/src/main/java/com/alibaba/csp/sentinel/CtSph.java:112`
- `SlotChainProvider#newSlotChain` — `sentinel-core/src/main/java/com/alibaba/csp/sentinel/slotchain/SlotChainProvider.java:38`
- `DefaultSlotChainBuilder#build` — `sentinel-core/src/main/java/com/alibaba/csp/sentinel/slots/DefaultSlotChainBuilder.java:39`
- `StatisticSlot#exit` — `sentinel-core/src/main/java/com/alibaba/csp/sentinel/slots/statistic/StatisticSlot.java:126`
- `DegradeSlot#exit` — `sentinel-core/src/main/java/com/alibaba/csp/sentinel/slots/block/degrade/DegradeSlot.java:61`

## 边界与踩坑

- `NullContext`、全局开关关闭或链数量超限时会返回不做规则检查的 Entry，不能据此判断“没有配置规则”。
- 阻断时 `Entry.exit` 会被调用以清理已经建立的上下文；业务代码不应在 `entry` 抛异常后再次无条件 exit 同一个 Entry。
- 异步调用必须使用异步 Entry 的生命周期，不能把普通 Entry 跨线程传递。

## 可迁移知识

高并发热路径常用“不可变快照 + 低频构造 + 高频无锁读取”。链式处理还要求每个节点定义清晰的异常和回滚语义，否则前置统计会泄漏。

> **面试锚点**：`CtSph` 为什么按资源缓存链？阻断异常如何穿过 Slot 链？异步 Entry 为什么要清理当前线程上下文？

## Related

- [整体架构](/notes/source/java/rpc/sentinel/architecture/)
- [统计节点与时间窗口](/notes/source/java/rpc/sentinel/statistic-node/)
- [Sentinel 概念笔记](/notes/backend/sentinel/)
