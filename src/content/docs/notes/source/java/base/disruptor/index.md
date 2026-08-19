---
title: Disruptor
description: LMAX Disruptor 源码解析总览：无锁环形队列、序号栅栏、伪共享填充、等待策略与多生产者协调。
category: Backend
tags:
  - Source Reading
  - Disruptor
  - Concurrency
  - Lock-Free
order: 1
updatedDate: 2026-08-19
difficulty: advanced
status: stable
lastReviewed: 2026-08-19
draft: false
sidebar:
  order: 1
---

Disruptor 是 LMAX 交易所开源的**单机进程内消息传递框架**，用一个预分配的环形数组 + 一组原子序号替代 `BlockingQueue`，在单线程六百万 TPS 的量级上把入队出队的延迟压到百纳秒级。全部主源码只有 71 个文件，是「代码极少但含金量极高」的典型。

<!-- more -->

## 本册问题地图

不要把 Disruptor 理解成“一个更快的队列”。本册沿着一条事件的生命周期回答问题：

1. **事件放在哪里？** `RingBuffer` 预分配固定槽位，用递增 `Sequence` 映射到物理下标。
2. **生产者怎样避免覆盖未消费数据？** 申请序号时比较 wrap point 与最慢 gating sequence。
3. **多生产者怎样避免把半成品交给消费者？** 抢号与发布分离，`availableBuffer` 记录连续可见边界。
4. **消费者为什么不需要争抢队头？** 每个消费者维护自己的进度，并通过 barrier 表达依赖关系。
5. **低延迟从哪里来，代价是什么？** 固定容量、对象复用、显式内存屏障与可配置等待策略减少锁和分配，但会占用更多内存，并要求业务处理器遵守序号协议。

读完整册后，应当能从“发布一条事件”一直讲到“最慢消费者如何反压生产者”，而不是只记住 RingBuffer、CAS 和伪共享三个名词。


## 版本快照

| 项 | 值 |
| --- | --- |
| 仓库 | `LMAX-Exchange/disruptor` |
| 本地路径 | `E:\source\java\base\disruptor` |
| 分支 | `master` |
| Commit | `c871ca4`（2025-04-02） |
| 最近 tag | `4.0.0` |
| 构建 | Gradle，单模块，最低 JDK 11 |

> 本册所有 `文件:行号` 坐标均基于上述 commit。行号会随上游演进漂移，类名与方法名相对稳定。

## 它解决什么问题

Disruptor 的出发点不是「造一个更快的队列」，而是「**为什么 `ArrayBlockingQueue` 这么慢**」。LMAX 团队拆出四个成本：

| 成本 | `ArrayBlockingQueue` 的做法 | 代价 |
| --- | --- | --- |
| **锁竞争** | 一把 `ReentrantLock` 同时保护入队与出队 | 竞争时线程挂起/唤醒，一次上下文切换约几微秒，比要做的业务还贵 |
| **伪共享** | `takeIndex` / `putIndex` / `count` 是相邻字段 | 生产者写 `putIndex`、消费者写 `takeIndex`，两者大概率落在同一条 64 字节缓存行，互相 invalidate |
| **对象分配** | 每次 `put` 塞进一个新对象，`take` 后成垃圾 | 稳态下持续制造年轻代垃圾，GC 停顿抖动 |
| **无法批量** | 一次 `take()` 只能拿一个元素 | 消费者每处理一个元素就要重新竞争一次 |

Disruptor 的四个对策一一对应：

1. **无锁**：生产者用 CAS/`getAndAdd` 抢序号，消费者只做普通读 + 内存屏障，全程不加锁（`BlockingWaitStrategy` 除外，它是给「省 CPU 优先」场景的退路）。
2. **填充**：所有热点序号对象都被 56 字节前后夹住，独占缓存行（见 [伪共享与缓存行填充](/notes/source/java/base/disruptor/false-sharing/)）。
3. **预分配 + 复用**：环形数组在构造时就用 `EventFactory` 填满对象，之后只覆写字段，稳态零分配（`RingBufferFields#fill` — `RingBuffer.java:64`）。
4. **天然批量**：消费者一次 `waitFor` 可能拿到一整批可读序号，循环处理不再重新协调（`BatchEventProcessor#processEvents` — `BatchEventProcessor.java:144`）。

> 关键认知：Disruptor 快的根因不是「用了 CAS 所以比锁快」，而是**它把协调频率降下来了** —— 消费者一次协调换来一批数据，生产者用缓存的 gating 值避开绝大多数跨线程读。

## 模块地图

单 Gradle 模块，源码集中在 `src/main/java/com/lmax/disruptor/`，共 71 个 `.java`（含 `module-info.java`）。

| 包 | 职责 | 关键类型 |
| --- | --- | --- |
| `com.lmax.disruptor` | 内核：环形缓冲、序号、栅栏、消费者循环、等待策略 | `RingBuffer` `Sequence` `Sequencer` `SequenceBarrier` `BatchEventProcessor` `WaitStrategy` |
| `com.lmax.disruptor.dsl` | 编排 DSL：把「谁消费、谁依赖谁」翻译成栅栏与 gating 关系 | `Disruptor` `EventHandlerGroup` `ConsumerRepository` `ProducerType` |
| `com.lmax.disruptor.util` | 工具：最小序号、log2、线程工厂 | `Util` `DaemonThreadFactory` |

八种等待策略（`BlockingWaitStrategy` / `BusySpinWaitStrategy` / `YieldingWaitStrategy` / `SleepingWaitStrategy` / `TimeoutBlockingWaitStrategy` / `LiteBlockingWaitStrategy` / `LiteTimeoutBlockingWaitStrategy` / `PhasedBackoffWaitStrategy`）全部实现同一个 `WaitStrategy` 接口，是策略模式的干净样本。

## 五个核心抽象

```text
        ┌──────────────────────────────────────────────┐
        │  RingBuffer<E>   预分配数组 + 索引换算         │
        │    ├─ Sequencer      抢序号 / 发布 / 容量判定  │
        │    │    ├─ SingleProducerSequencer （无 CAS） │
        │    │    └─ MultiProducerSequencer  （getAndAdd + availableBuffer）
        │    └─ Sequence       带填充的原子 long        │
        └──────────────────────────────────────────────┘
                       │ newBarrier()
                       ▼
              SequenceBarrier ──uses──► WaitStrategy
                       │ waitFor()
                       ▼
              BatchEventProcessor ──callback──► EventHandler
```

| 抽象 | 一句话 | 定义处 |
| --- | --- | --- |
| `Sequence` | 带前后填充、支持 CAS 与显式内存屏障的 `long` 计数器 | `Sequence.java:44` |
| `RingBuffer` | 2 的幂容量的预分配数组，`sequence & indexMask` 取槽位 | `RingBuffer.java:84` |
| `Sequencer` | 序号的所有权协调者：谁能写下一格、写完怎么公布 | `AbstractSequencer.java:28` |
| `SequenceBarrier` | 消费者的「能读到哪」查询入口，内部委托 `WaitStrategy` | `ProcessingSequenceBarrier.java:23` |
| `BatchEventProcessor` | 消费者主循环：等待 → 批量回调 → 推进自己的序号 | `BatchEventProcessor.java:30` |

## 读码入口顺序

不要从 `Disruptor` DSL 开始读，它是糖；从数据流开始：

1. **`Sequence.java`（170 行，全文读）** —— 理解填充布局与 `get/set/setVolatile` 三种屏障语义，这是后面一切的地基。
2. **`RingBufferFields`（`RingBuffer.java:33-76`）** —— 看构造期 `fill()` 预分配与 `elementAt` 的 `BUFFER_PAD + (sequence & indexMask)`。
3. **`SingleProducerSequencer#next(int)`（`SingleProducerSequencer.java:134`）** —— 最干净的生产侧逻辑，`wrapPoint` / `cachedValue` 两个变量是全部精华。
4. **`ProcessingSequenceBarrier#waitFor`（`ProcessingSequenceBarrier.java:51`）** —— 消费侧的唯一入口，三行代码串起等待策略与多生产者补偿。
5. **`BatchEventProcessor#processEvents`（`BatchEventProcessor.java:144`）** —— 消费者主循环，看批量、异常、rewind 怎么编排。
6. **`MultiProducerSequencer`（全文）** —— 最后读，因为它是「单生产者假设被打破后」的补丁集合。
7. **`dsl/Disruptor#start`（`dsl/Disruptor.java:358`）** —— 回过头看 DSL 如何把上面的零件接起来。

配合测试读：`src/test/java/com/lmax/disruptor/` 下的 `SequencerTest`、`RingBufferTest` 是最准确的语义说明书。

## 本册目录

- [整体架构](/notes/source/java/base/disruptor/architecture/)：五层抽象、生产与消费两条主流程、DSL 如何编排依赖图
- [环形队列与序号栅栏](/notes/source/java/base/disruptor/ring-buffer/)：2 的幂取模、`wrapPoint` 覆盖判定、gating 序号、批量读取
- [伪共享与缓存行填充](/notes/source/java/base/disruptor/false-sharing/)：继承式填充、JDK 15 布局变更导致的 long→byte 改写、`BUFFER_PAD`
- [等待策略与内存屏障](/notes/source/java/base/disruptor/wait-strategy/)：八种策略取舍、`releaseFence/acquireFence` 为什么能替代 volatile
- [多生产者协调](/notes/source/java/base/disruptor/multi-producer/)：`getAndAdd` 抢序、`availableBuffer` 位图、为什么必须有 `getHighestPublishedSequence`
- [面试专题](/notes/source/java/base/disruptor/interview/)：高频题、高难追问、场景题与源码级加分答法

## 横向对照

| 对象 | 对照点 |
| --- | --- |
| `ArrayBlockingQueue` | 同为有界数组队列。锁 vs 无锁、单元素 vs 批量、每次分配 vs 预分配复用 |
| `java.util.concurrent.LinkedTransferQueue` | 同为无锁队列，但链表节点仍需分配；Disruptor 用固定数组换零分配 |
| Netty `MpscArrayQueue`（JCTools） | 同为 MPSC 环形数组，JCTools 也用填充；差别在 Disruptor 额外提供多消费者依赖编排 |
| RocketMQ CommitLog | 同为「顺序写 + 序号定位」，但落到磁盘 mmap；Disruptor 是内存版的同一思想 |

## 生产中的真实使用者

- **Log4j2 的异步日志**：`AsyncLogger` 默认基于 Disruptor，这是 Log4j2 相比 Logback 异步吞吐优势的主要来源。
- **HBase / Storm / Camel** 的内部事件分发。
- 各类撮合引擎、行情网关：单线程处理 + Disruptor 分发是「LMAX 架构」的标准形态。

## Related

- [整体架构](/notes/source/java/base/disruptor/architecture/)：先看这篇建立全局视图
- [消息中间件](/notes/backend/mq/)：站内已有的 MQ 专题，对照「进程内 vs 跨进程」的队列设计
- [Java 微服务架构治理实践](/notes/backend/java-microservice-architecture-governance/)
