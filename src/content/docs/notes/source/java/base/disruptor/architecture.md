---
title: 整体架构
description: Disruptor 五层抽象、生产与消费两条主流程、DSL 如何把消费者依赖图翻译成栅栏与 gating 关系。
category: Backend
tags:
  - Source Reading
  - Disruptor
  - Architecture
  - Concurrency
order: 11
updatedDate: 2026-08-14
difficulty: advanced
status: stable
lastReviewed: 2026-08-14
draft: false
sidebar:
  order: 11
---

Disruptor 的架构可以用一句话概括：**用一组互相「看得见」的原子序号，取代队列里的锁和指针**。理解它只需要盯住一件事——每个参与者手里那个 `Sequence` 分别代表什么，以及谁在等谁。

<!-- more -->

## 分层

```text
┌─────────────────────────────────────────────────────────────┐
│ 编排层  com.lmax.disruptor.dsl                               │
│   Disruptor / EventHandlerGroup / ConsumerRepository        │
│   职责：把 handleEventsWith().then() 翻译成栅栏 + gating 关系 │
└─────────────────────────────┬───────────────────────────────┘
                              │ 构造期一次性完成，运行期不参与
┌─────────────────────────────▼───────────────────────────────┐
│ 协调层                                                       │
│   Sequencer   (生产侧：抢序号 / 发布 / 容量判定)              │
│   SequenceBarrier + WaitStrategy (消费侧：能读到哪 / 怎么等)  │
└─────────────────────────────┬───────────────────────────────┘
┌─────────────────────────────▼───────────────────────────────┐
│ 存储层   RingBuffer<E>                                       │
│   预分配数组 entries[]，sequence & indexMask 定位             │
└─────────────────────────────┬───────────────────────────────┘
┌─────────────────────────────▼───────────────────────────────┐
│ 原语层   Sequence                                            │
│   前后各 56 字节填充的 long + VarHandle 显式内存屏障           │
└─────────────────────────────────────────────────────────────┘
```

**关键性质**：编排层只在构造期工作。`Disruptor#start()` 之后，运行期的数据通路上只剩下协调层、存储层、原语层三层，没有任何多余的间接跳转——这是它能做到百纳秒级延迟的结构前提。

## 核心抽象

### Sequence —— 唯一的共享可变状态

整个框架里跨线程可见的可变状态**只有** `Sequence` 里那个 `long value`。它有三种写语义：

| 方法 | 屏障 | 用途 | 位置 |
| --- | --- | --- | --- |
| `set(long)` | `releaseFence` + 普通写（Store/Store） | 发布数据、推进消费进度 | `Sequence.java:100` |
| `setVolatile(long)` | `releaseFence` + 写 + `fullFence`（含 StoreLoad） | 生产者判定容量前强制刷出游标 | `Sequence.java:114` |
| `compareAndSet` / `getAndAdd` | `VarHandle` 原子操作 | 多生产者抢序号 | `Sequence.java:128` / `Sequence.java:160` |

读侧只有一个 `get()`（`Sequence.java:86`）：普通读 + `acquireFence`。**没有 volatile 字段**——`value` 就是个普通 `long`，语义完全由显式屏障给出。这一点是理解 Disruptor 内存模型的钥匙，展开见 [等待策略与内存屏障](/notes/source/java/base/disruptor/wait-strategy/)。

### RingBuffer —— 只负责换算索引

`RingBuffer` 本身几乎没有并发逻辑，它做两件事：构造期把数组填满对象，运行期把序号换算成数组下标。

- 容量校验强制 2 的幂：`Integer.bitCount(bufferSize) != 1` 直接抛异常（`RingBuffer.java:54`）。
- 预分配：`fill()` 用 `EventFactory` 把 `bufferSize` 个对象全部创建好（`RingBuffer.java:64`）。
- 取元素：`entries[BUFFER_PAD + (int) (sequence & indexMask)]`（`RingBuffer.java:72`）。

所有的「能不能写」「写到哪了」判断都委托给它持有的 `Sequencer`。

### Sequencer —— 生产侧的全部智慧

两个实现，接口相同、策略截然不同：

| | `SingleProducerSequencer` | `MultiProducerSequencer` |
| --- | --- | --- |
| 抢序号 | 普通字段自增，无原子操作（`SingleProducerSequencer.java:162`） | `cursor.getAndAdd(n)`（`MultiProducerSequencer.java:119`） |
| gating 缓存 | 普通 `long cachedValue`（`SingleProducerSequencer.java:53`） | `Sequence gatingSequenceCache`（`MultiProducerSequencer.java:38`） |
| 发布 | `cursor.set(sequence)`（`SingleProducerSequencer.java:225`） | 写 `availableBuffer` 位图（`MultiProducerSequencer.java:230`） |
| `cursor` 语义 | **发布后**才更新 → cursor 即「可读上界」 | **抢号时**就更新 → cursor 只是「已分配上界」，不代表可读 |

最后一行是两者最容易混淆、也最容易被面试追问的差异，详见 [多生产者协调](/notes/source/java/base/disruptor/multi-producer/)。

### SequenceBarrier —— 消费者的唯一提问入口

```java
// ProcessingSequenceBarrier.java:51
public long waitFor(final long sequence) throws ... {
    checkAlert();
    long availableSequence = waitStrategy.waitFor(sequence, cursorSequence, dependentSequence, this);
    if (availableSequence < sequence) {
        return availableSequence;                                  // 超时策略可能返回更小值
    }
    return sequencer.getHighestPublishedSequence(sequence, availableSequence);
}
```

三行代码承担三件事：中断检查、委托等待、**多生产者场景下的可读性补偿**。构造时如果没有上游依赖，`dependentSequence` 直接指向 `cursorSequence`；有依赖则包成 `FixedSequenceGroup`（`ProcessingSequenceBarrier.java:40-47`）——消费链的拓扑就是靠这一处分支表达的。

### BatchEventProcessor —— 消费者主循环

一个 `BatchEventProcessor` 绑一个线程、一个 `EventHandler`、一个 `Sequence`。核心循环在 `BatchEventProcessor.java:144`，形状见下一节。

## 主流程一：生产者发布一条事件

```text
Producer                SingleProducerSequencer          RingBuffer        Sequence(cursor)
   │                              │                          │                  │
   │ ringBuffer.next()            │                          │                  │
   ├─────────────────────────────►│ next(1)  :134            │                  │
   │                              │ wrapPoint = seq+1-size   │                  │
   │                              │ if wrapPoint > cached ──►│                  │
   │                              │   cursor.setVolatile()   │  StoreLoad 屏障  │
   │                              │   自旋 parkNanos(1) 等   │                  │
   │                              │   最慢消费者推进          │                  │
   │                              │ nextValue = seq          │                  │
   │◄─────────────────────────────┤ return seq               │                  │
   │                                                         │                  │
   │ event = ringBuffer.get(seq)  ──────────────────────────►│ elementAt() :72  │
   │ 直接改写 event 字段（不 new 对象）                        │                  │
   │                                                         │                  │
   │ ringBuffer.publish(seq)                                 │                  │
   ├────────────────────────────►│ publish() :223            │                  │
   │                             │  cursor.set(seq) ─────────┼─────────────────►│ Store/Store
   │                             │  waitStrategy.signalAll() │                  │
```

三段式的 `next / get / publish` 必须写在 `try-finally` 里：

```java
long seq = ringBuffer.next();
try {
    ringBuffer.get(seq).setValue(x);   // 复用槽位对象
} finally {
    ringBuffer.publish(seq);           // 漏了这一句，整个环永久卡死
}
```

原因见下面「边界与踩坑」。

## 主流程二：消费者处理一批事件

```text
BatchEventProcessor#processEvents  (BatchEventProcessor.java:144)

 nextSequence = sequence.get() + 1
 ┌──────────────────────────────────────────────────────────────┐
 │ availableSequence = barrier.waitFor(nextSequence)      :156   │
 │        └─► waitStrategy 自旋/yield/park 直到有数据             │
 │                                                              │
 │ endOfBatch = min(nextSequence + batchLimitOffset,             │
 │                  availableSequence)                    :157   │
 │        └─► maxBatchSize 截断，防止一批过大饿死其他工作          │
 │                                                              │
 │ handler.onBatchStart(batchSize, queueDepth)            :161   │
 │                                                              │
 │ while (nextSequence <= endOfBatch)                     :164   │
 │     event = dataProvider.get(nextSequence)                    │
 │     handler.onEvent(event, seq, seq == endOfBatch)     :167   │
 │     nextSequence++                                            │
 │                                                              │
 │ sequence.set(endOfBatch)   ← 整批处理完才推进一次        :173   │
 └──────────────────────────────────────────────────────────────┘
```

三个值得注意的细节：

1. **序号一批只推进一次**（`:173`）。不是每处理一个事件就 `set` 一次——那会把一次跨线程写变成 N 次。这是「降低协调频率」思想在消费侧的体现。
2. **`endOfBatch` 标志透传给业务**（`:167`）。批处理型 handler（写文件、发网络包）应当在 `endOfBatch == true` 时才 flush，这是 Disruptor 提供的天然攒批点。
3. **异常不中断循环**（`:191-196`）。捕获 `Throwable` → 交给 `ExceptionHandler` → **仍然推进序号并继续**。设计意图是「一条坏消息不能卡死整条流水线」，代价是需要业务自己保证 `ExceptionHandler` 不吞掉致命错误。

## DSL 如何编排依赖图

`Disruptor` DSL 的全部价值是把这样一句话：

```java
disruptor.handleEventsWith(journalHandler, replicationHandler)
         .then(businessHandler);
```

翻译成一张正确的栅栏 + gating 图：

```text
                    ┌──────────────► journalHandler.sequence ──┐
producer ─cursor──► │                                          ├──► businessHandler.sequence
                    └──────────────► replicationHandler.sequence┘          │
                                                                           │
        生产者的 gatingSequences 只包含 ────────────────────────────────────┘
        「链尾」序号（businessHandler），不包含前两个
```

实现落在 `updateGatingSequencesForNextInChain`（`dsl/Disruptor.java:567`）：

```java
ringBuffer.addGatingSequences(processorSequences);     // 新建的这批加入 gating
for (final Sequence barrierSequence : barrierSequences) {
    ringBuffer.removeGatingSequence(barrierSequence);  // 它们的上游从 gating 移除
}
consumerRepository.unMarkEventProcessorsAsEndOfChain(barrierSequences);
```

**为什么只让链尾 gating 生产者**

**替代方案**：把所有消费者的序号都加入 `gatingSequences`。
**为什么不行**：正确性上没错（生产者会等最慢的），但每次 `Util.getMinimumSequence` 都要遍历全部消费者序号（`util/Util.java:61`），而链尾消费者按定义永远 ≤ 它的上游。多遍历的那些序号对最小值毫无贡献，纯属浪费——在生产者热路径上，这是每次判满都要付的成本。
**证据**：`removeGatingSequence` 的调用点正是在「为下一环建好栅栏之后」，即上游刚被证明有下游依赖的那一刻。

## 扩展点全景

| 扩展点 | 接口 | 触发时机 | 典型用途 |
| --- | --- | --- | --- |
| 事件工厂 | `EventFactory<E>` | 构造期，每个槽位一次 | 定义复用对象的初始形态 |
| 事件处理 | `EventHandler<T>` | 每个事件一次 | 业务逻辑 |
| 批开始 | `EventHandlerBase#onBatchStart` | 每批一次 | 预分配、开事务 |
| 生命周期 | `onStart` / `onShutdown` | 线程起停各一次 | 绑核、初始化 ThreadLocal |
| 超时 | `onTimeout` | 超时型等待策略触发 | 心跳、定期 flush |
| 异常 | `ExceptionHandler<T>` | 处理抛异常时 | 告警、死信 |
| 等待策略 | `WaitStrategy` | 消费者无数据时 | 延迟/CPU 取舍 |
| 批回退 | `BatchRewindStrategy` | 抛 `RewindableException` | 整批重试（4.0 新增） |

4.0 把 `BatchStartAware` / `LifecycleAware` / `SequenceReportingEventHandler` 三个扩展接口全部合并进 `EventHandler` 的 default 方法（见 `src/docs/asciidoc/en/changelog.adoc:12-15`），实现类不再需要 `instanceof` 判断链。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| `next()` 后忘记 `publish()` | 整个环在绕满一圈后**永久阻塞**，无异常无日志 | 生产者停在 `next()` 的 `while (wrapPoint > minSequence)` 自旋（`SingleProducerSequencer.java:154`），而消费者永远等不到那个未发布的序号 | `next/get/publish` 严格写成 `try-finally` |
| 单生产者配置被多线程调用 | 序号错乱、事件被覆盖，**默认无报错** | `SingleProducerSequencer#next` 的自增不是原子的 | 4.0 加了 `assert sameThread()`（`SingleProducerSequencer.java:136`），但**只在 `-ea` 开启时生效**，生产环境不会报。压测务必带 `-ea` 跑一轮 |
| `EventHandler` 里做阻塞 IO | 整条链吞吐塌陷 | 一个 handler 一个线程，阻塞即停摆，且下游依赖它 | 阻塞操作放独立 handler 并利用 `endOfBatch` 攒批；或换用超时等待策略配合异步 |
| 事件对象持有上一轮的引用 | 内存泄漏 / 读到脏数据 | 槽位对象被复用，字段不清理就残留 | `onEvent` 结束前清空引用型字段，或在 `EventTranslator` 里全量覆写 |
| `shutdown()` 时仍有生产者在写 | `shutdown()` 永不返回 | `hasBacklog()` 永远为真（`dsl/Disruptor.java:489`） | 先停生产者，再 `shutdown(timeout, unit)` |

## 可迁移知识

1. **构造期编排、运行期直连**：把所有拓扑决策压到初始化阶段，热路径上只剩数组访问和原子操作。这套思路可直接用于自研的责任链、流水线框架——Netty 的 `ChannelPipeline` 同样是构造期定型。
2. **让最慢者成为唯一约束**：链式依赖只保留链尾作为 gating，是「传递闭包上取最小值」的常见优化，任何多阶段流水线的背压计算都适用。
3. **批量摊薄协调成本**：一次同步换 N 次业务处理。这是 Kafka 消费者 `max.poll.records`、JDBC `addBatch`、Netty `writeAndFlush` 攒批的同一母题。
4. **异常不打断流水线**：把「单条消息失败」与「管道存活」解耦，是所有消息处理框架的必备设计。

> **面试锚点**
> - Disruptor 有几个 `Sequence`？分别代表什么？
> - 为什么生产者的 `gatingSequences` 只放链尾消费者的序号？
> - `BatchEventProcessor` 为什么整批处理完才 `sequence.set()`，而不是每条 set 一次？
> - 忘记 `publish()` 会发生什么？为什么没有任何异常提示？
> - `endOfBatch` 参数的设计意图是什么？

## Related

- [环形队列与序号栅栏](/notes/source/java/base/disruptor/ring-buffer/)：`wrapPoint` 与 gating 的完整推导
- [多生产者协调](/notes/source/java/base/disruptor/multi-producer/)：两种 Sequencer 的 cursor 语义差异
- [等待策略与内存屏障](/notes/source/java/base/disruptor/wait-strategy/)：`waitFor` 背后的八种实现
- [Disruptor 总览](/notes/source/java/base/disruptor/)：版本快照与读码顺序
