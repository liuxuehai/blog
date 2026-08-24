---
title: 面试专题
description: SkyWalking 高频面试题与源码级回答。
category: Backend
tags: [Source Reading, SkyWalking, Interview]
order: 29
updatedDate: 2026-08-24
difficulty: advanced
status: stable
lastReviewed: 2026-08-24
draft: false
sidebar: { order: 29 }
---

<!-- more -->

## 先给答案：SkyWalking 高频面试题与源码级回答

SkyWalking 高频面试题与源码级回答。 正文沿“高频题 -> 场景题”展开：先确认入口和状态归属，再跟踪控制流或数据流的推进，最后落到对外可观察的结果。

主要失效边界集中在“OAP 接收延迟持续升高怎么排查”这些场景。它们破坏的是容量、顺序、并发或生命周期前提；排查时应先确认状态是否仍由正确对象持有，再核对推进条件和清理路径。

## 高频题

### SkyWalking 如何做到无侵入？

**30 秒版**：Agent 在类加载或重转换时匹配目标框架类，插入拦截器，业务代码无需显式调用追踪 API。

**展开**：`ClassEnhancePluginDefine` 描述类型和方法匹配，`PluginFinder` 找到插件，拦截器调用 `ContextManager`。

**加分项**：插件定义把框架差异隔离在扩展层。

**常见错答**：认为只是运行时采集线程栈。

### TraceSegment 和 Span 有什么关系？

**30 秒版**：segment 是一个服务实例内的本地追踪片段，span 是片段中的具体操作；segment 结束后批量上报。

**展开**：`ContextManager` 管理当前 segment，`AbstractSpan` 管理生命周期和上下文注入。

**加分项**：跨服务后通常形成新的 segment，并通过 reference 连接。

**常见错答**：一个全链路只对应一个本地 segment。

### OAP 为什么采用模块化？

**30 秒版**：receiver、analyzer、storage、query 都是可替换能力，通过 Module/Provider/Service 组装。

**展开**：`ModuleManager` 管生命周期，`CoreModule` 注册核心服务，插件模块实现具体协议和存储。

**加分项**：模块依赖必须显式声明，否则运行时服务查找会失败。

**常见错答**：只改配置就能加载任意模块。

### 为什么写时生成多个模型？

**30 秒版**：trace、服务、拓扑、指标的查询维度不同，写时拆分能降低查询时的计算成本。

**展开**：`TraceAnalyzer` 解析 segment，`DispatcherManager` 分发给多个 dispatcher，再由 DAO 持久化。

**加分项**：代价是高基数和重复写入，需要采样与窗口控制。

**常见错答**：所有数据都只写入一张原始表。

### 异步线程为什么会断链？

**30 秒版**：当前上下文通常依赖线程局部状态，线程切换不会自动携带；需要 capture/continuation 在新线程恢复。

**展开**：span 生命周期必须覆盖异步任务，任务结束后再 stop，避免 segment 提前完成。

**加分项**：上下文传播要区分 active、capture、resume、close。

**常见错答**：只要 TraceId 放进日志 MDC 就完成了链路传播。

## 场景题

### OAP 接收延迟持续升高怎么排查？

先看 receiver 队列和 gRPC handler，再看 analyzer 消费速率、dispatcher 延迟、存储写入和节点负载，最后检查高基数、重试风暴和版本不匹配。

## Related

- [整体架构](/notes/source/java/tools/skywalking/architecture/)
- [分析、聚合与存储](/notes/source/java/tools/skywalking/analysis-storage/)
