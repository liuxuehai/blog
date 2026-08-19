---
title: 环形队列与序号栅栏
description: 2 的幂取模、wrapPoint 覆盖判定、gating 序号与 cachedValue 缓存优化、批量读取的完整推导。
category: Backend
tags:
  - Source Reading
  - Disruptor
  - Ring Buffer
  - Lock-Free
order: 12
updatedDate: 2026-08-19
difficulty: advanced
status: stable
lastReviewed: 2026-08-19
draft: false
sidebar:
  order: 12
---

环形队列本身没什么稀奇，难点在于**在没有锁的前提下判断「这一格能不能写」**。Disruptor 的答案是一个叫 `wrapPoint` 的减法，和一个叫 `cachedValue` 的缓存——这两行代码撑起了整个生产侧。

<!-- more -->

## 先给答案：RingBuffer 解决的是“固定内存里的有序复用”

环形队列的关键不在于把数组首尾相连，而在于用递增序号同时表达三件事：生产者想写到哪里、消费者已经读到哪里、某个槽位是否可以安全复用。物理下标只是 `sequence & (bufferSize - 1)` 的结果，真正决定安全性的始终是序号之间的距离。

因此“判满”不能简单理解为数组下标追上了头部。生产者必须确认自己不会覆盖最慢消费者尚未读取的数据；消费者也必须等到目标序号已经发布。RingBuffer 用 gating sequences 把这两个边界显式化，换来了无锁、定长和低 GC，但也接受了容量固定、慢消费者会反向限制生产者的代价。


## 问题背景

有界环形数组的核心约束只有一条：**序号 `s` 与序号 `s + bufferSize` 映射到同一个物理槽位**。所以在写 `s + bufferSize` 之前，必须确认 `s` 上那条数据已经被所有消费者读完了。

传统队列用一个 `count` 字段 + 锁来表达这件事。Disruptor 不能用锁，也不想用一个所有线程都在写的 `count`（那是伪共享的重灾区），于是改成：**每个参与者只写自己的序号，只读别人的序号**。判满变成一次纯读的比较。

## 槽位定位：为什么必须是 2 的幂

```java
// RingBuffer.java:50-61
if (bufferSize < 1) { throw new IllegalArgumentException("bufferSize must not be less than 1"); }
if (Integer.bitCount(bufferSize) != 1) { throw new IllegalArgumentException("bufferSize must be a power of 2"); }

this.indexMask = bufferSize - 1;
this.entries = (E[]) new Object[bufferSize + 2 * BUFFER_PAD];
fill(eventFactory);
```

```java
// RingBuffer.java:72
protected final E elementAt(final long sequence) {
    return entries[BUFFER_PAD + (int) (sequence & indexMask)];
}
```

`sequence & indexMask` 等价于 `sequence % bufferSize`，但取模是一条几十周期的整数除法，位与是一条周期指令。在每个事件都要执行一次的热路径上，这个差别是可观测的。

**代价**：容量不能自由设定。框架提供 `Util.ceilingNextPowerOfTwo`（`util/Util.java:36`，注释标明出自 *Hacker's Delight* 第 3 章）帮调用方向上取整，但 `RingBuffer` 构造函数本身**不会自动取整**——传 1000 直接抛异常，必须自己传 1024。

同一个「2 的幂」前提还被 `MultiProducerSequencer` 复用：`indexShift = Util.log2(bufferSize)`（`MultiProducerSequencer.java:59`），用移位求「绕了几圈」。

### 数组两端的 128 字节

`BUFFER_PAD = 32`（`RingBuffer.java:35`），数组实际长度是 `bufferSize + 64`，真实数据从下标 32 开始。

```text
entries[]  ┌────────┬──────────────────────────┬────────┐
           │ 32 空槽 │  bufferSize 个预分配对象   │ 32 空槽 │
           └────────┴──────────────────────────┴────────┘
             ↑                                    ↑
        隔开数组头部与其他堆对象共享缓存行     隔开数组尾部
```

压缩指针下一个引用 4 字节，32 × 4 = 128 字节 = 两条缓存行。目的是防止**数组首尾元素**与堆上相邻对象共享缓存行——数组元素本身是只读的（对象引用创建后不再改写），但数组对象头部的 `length` 字段等仍可能被读，与热点数据挤在一条线上不划算。

> Disruptor 3.x 曾用 `Unsafe` 直接按 `REF_ARRAY_BASE + (i << REF_ELEMENT_SHIFT)` 寻址来绕过数组边界检查。4.0 在「移除 `Unsafe`」的整体改造中（commit `4e44914 Remove use of unsafe from RingBuffer`）改回普通下标访问，但**保留了填充**——历史上还出现过一次「删掉填充」又被回滚的往返（`019c824` → `ed7d265 Revert "Remove unsafe based padding from RingBuffer."`）。

## wrapPoint：判满的全部逻辑

生产侧最关键的方法，`SingleProducerSequencer.java:134`：

```java
public long next(final int n) {
    assert sameThread() : "Accessed by two threads - use ProducerType.MULTI!";
    if (n < 1 || n > bufferSize) { throw new IllegalArgumentException("n must be > 0 and < bufferSize"); }

    long nextValue = this.nextValue;                       // 上次分配到的序号
    long nextSequence = nextValue + n;                     // 本次要分配到的序号
    long wrapPoint = nextSequence - bufferSize;            // ← 核心
    long cachedGatingSequence = this.cachedValue;

    if (wrapPoint > cachedGatingSequence || cachedGatingSequence > nextValue) {
        cursor.setVolatile(nextValue);                     // StoreLoad fence

        long minSequence;
        while (wrapPoint > (minSequence = Util.getMinimumSequence(gatingSequences, nextValue))) {
            LockSupport.parkNanos(1L);
        }
        this.cachedValue = minSequence;
    }

    this.nextValue = nextSequence;
    return nextSequence;
}
```

### wrapPoint 的含义

```text
序号轴（bufferSize = 8）

  ... 12  13  14  15  16  17  18  19  20 ...
       │               │               │
    槽位4           槽位0           槽位4
                                       │
   要写 20，就会覆盖 20-8=12 的数据 ────┘

   wrapPoint = nextSequence - bufferSize = 12
   条件：所有消费者的进度都必须 ≥ 12，才能安全写 20
```

一句话：**`wrapPoint` 是「本次写入会踩掉的那个旧序号」**。安全条件就是 `wrapPoint <= min(所有消费者序号)`。

### 两个判断条件

`if (wrapPoint > cachedGatingSequence || cachedGatingSequence > nextValue)`

| 分支 | 含义 |
| --- | --- |
| `wrapPoint > cachedGatingSequence` | 按缓存的消费进度看，这一格还没被消费完 → 缓存不够用，必须重读真实值 |
| `cachedGatingSequence > nextValue` | 缓存值**超前于**生产进度，逻辑上不可能 → 缓存已失效（例如 `claim(sequence)` 把 `nextValue` 拨回过，见 `SingleProducerSequencer.java:214`），强制重读 |

两个条件都不满足时，直接跳过整个 if 块——**一次跨线程读都不做**，这才是快路径。

### 为什么要缓存 gating 序号

**替代方案**：每次 `next()` 都调 `Util.getMinimumSequence(gatingSequences, ...)` 拿真实的最小消费进度。
**为什么不行**：`getMinimumSequence`（`util/Util.java:61`）要遍历所有消费者的 `Sequence` 并逐个 `get()`。每个 `get()` 都是一次可能触发缓存行失效的跨核读——消费者刚写过自己的序号，生产者读它就得从对方的核心把缓存行拉过来。稳态下环没满，这个读的结果**必然是「够用」**，等于每条消息都付一次跨核通信的钱去确认一件已知的事。
**证据**：`cachedValue` 是普通 `long` 字段而非 `Sequence`（`SingleProducerSequencer.java:53`），因为它**只被生产者线程读写**，不需要任何可见性保证——这一点本身就说明了它的定位：纯粹的本地缓存，用于跳过跨核读。缓存失效时（`wrapPoint > cachedValue`）才回退到真实读，且读到的新值会一直用到下一次绕圈。

**效果**：容量 1024 的环，稳态下生产者大约每 1024 条消息才做一次跨核读，其余 1023 次是纯本地比较。

### 那个 `cursor.setVolatile(nextValue)`

源码注释直接写了 `// StoreLoad fence`（`SingleProducerSequencer.java:151`）。它在**进入等待循环之前**执行，作用是保证紧接着对 `gatingSequences` 的读不会读到过期值——`Sequence.setVolatile` 里带了 `VarHandle.fullFence()`（`Sequence.java:118`），这是 Java 里少数能显式表达 StoreLoad 的手段。

副作用同样重要：把生产者当前位置公布出去。否则用 `BlockingWaitStrategy` 的消费者可能看不到生产者的进度，双方互等。

## 消费侧：gating 序号从哪来

生产者要读的 `gatingSequences` 数组挂在 `AbstractSequencer.java:36`：

```java
protected volatile Sequence[] gatingSequences = new Sequence[0];
```

它通过 `addGatingSequences`（`AbstractSequencer.java:81`）动态增删，底层是一个 `AtomicReferenceFieldUpdater` 上的 CAS 复制循环（`SequenceGroups.java:27`）：

```java
do {
    currentSequences = updater.get(holder);
    updatedSequences = copyOf(currentSequences, currentSequences.length + sequencesToAdd.length);
    cursorSequence = cursor.getCursor();
    int index = currentSequences.length;
    for (Sequence sequence : sequencesToAdd) {
        sequence.set(cursorSequence);          // 新消费者从当前游标开始，不重放历史
        updatedSequences[index++] = sequence;
    }
} while (!updater.compareAndSet(holder, currentSequences, updatedSequences));

cursorSequence = cursor.getCursor();
for (Sequence sequence : sequencesToAdd) {
    sequence.set(cursorSequence);              // CAS 成功后再对齐一次
}
```

注意末尾**又设了一次**（`SequenceGroups.java:52-56`）。因为 CAS 循环期间游标可能已经前进，循环内设的值偏旧；新消费者若从旧值起步，会去读那些尚未被它 gating 保护、可能已被覆盖的槽位。这是运行期动态添加消费者时的正确性补丁。

**代价**：新消费者**从当前位置开始消费，看不到历史事件**。Disruptor 不是持久化队列，没有 replay 语义。

## 批量读取：一次协调换一批数据

消费侧的批量在 `BatchEventProcessor.java:156-173`：

```java
final long availableSequence = sequenceBarrier.waitFor(nextSequence);
final long endOfBatchSequence = min(nextSequence + batchLimitOffset, availableSequence);

if (nextSequence <= endOfBatchSequence) {
    eventHandler.onBatchStart(endOfBatchSequence - nextSequence + 1, availableSequence - nextSequence + 1);
}
while (nextSequence <= endOfBatchSequence) {
    event = dataProvider.get(nextSequence);
    eventHandler.onEvent(event, nextSequence, nextSequence == endOfBatchSequence);
    nextSequence++;
}
sequence.set(endOfBatchSequence);              // 整批只推进一次
```

`waitFor` 返回的是**当前可读的最大序号**，不是「下一个」。消费者据此一次吃掉一整批。三个设计点：

1. `batchLimitOffset = maxBatchSize - 1`（`BatchEventProcessor.java:63`），4.0 新增的批量上限。没有它，一个落后很多的消费者会一口气处理几十万条，期间既不推进序号也不响应 `halt()`。
2. `onBatchStart` 同时给出 `batchSize` 和 `queueDepth` 两个值——前者是本批实际处理量（已被 `maxBatchSize` 截断），后者是积压总量。4.0 之前只有一个参数且语义是队列深度，changelog 明确记录了这次不兼容改动（`src/docs/asciidoc/en/changelog.adoc:19`）。
3. `sequence.set(endOfBatchSequence)` 整批一次——把 N 次跨核写压缩成 1 次，与生产侧 `cachedValue` 是同一个母题的两面。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| `bufferSize` 传非 2 的幂 | 构造直接抛 `IllegalArgumentException` | `Integer.bitCount != 1`（`RingBuffer.java:54`） | 用 `Util.ceilingNextPowerOfTwo` 自行取整 |
| `next(n)` 的 `n > bufferSize` | 抛 `IllegalArgumentException` | 一次申请超过整环容量，`wrapPoint` 判定无解 | 批量发布时先按 `bufferSize` 分片 |
| 环满后生产者「假死」 | 无异常、无日志、CPU 不高 | `while (wrapPoint > minSequence) LockSupport.parkNanos(1L)`（`SingleProducerSequencer.java:154-157`）无限自旋，且**不受 `WaitStrategy` 控制**（源码里留着 `// TODO: Use waitStrategy to spin?`） | 监控 `remainingCapacity()`（`SingleProducerSequencer.java:201`）；生产端加超时用 `tryNext()` |
| 用 `tryNext()` 却不捕获异常 | `InsufficientCapacityException` 打断业务 | 该异常是**无栈单例** `InsufficientCapacityException.INSTANCE`（`SingleProducerSequencer.java:189`），用于控制流而非错误 | 按「满了就丢弃/降级」处理，别打日志堆栈 |
| 运行期加消费者后发现丢事件 | 新消费者只收到加入之后的事件 | `SequenceGroups.addSequences` 把新序号对齐到当前游标（`SequenceGroups.java:46`） | 需要全量就在 `start()` 前注册好 |
| 消费者卡住导致生产者阻塞 | 整个环停摆 | gating 取的是**最小值**，一个慢消费者拖垮所有人 | 慢消费者单独一条链或改异步；对可丢弃的消费者及时 `removeGatingSequence` |

## 可迁移知识

1. **本地缓存跨线程读的结果**：`cachedValue` 的思路适用于任何「频繁校验一个缓慢变化的远端状态」的场景——限流器缓存令牌数、连接池缓存空闲数，都可以用「乐观本地值 + 失效时重读」把跨核/跨节点通信摊薄到 1/N。
2. **位与替代取模**：容量取 2 的幂 + `& (n-1)` 是 `HashMap`、`ThreadLocalMap`、JCTools 队列、Netty 内存池的共同选择。代价是容量不自由，收益是热路径少一次除法。
3. **减法表达覆盖关系**：`wrapPoint = seq - capacity` 这种「用序号差判断环形冲突」的技巧，比维护一个 `size` 计数器更适合无锁场景——因为它把「多写一个共享变量」变成了「多做一次本地减法」。
4. **批量摊薄同步成本**：一次 `waitFor` 换一批数据、一次 `set` 提交一批进度。同样的模式出现在 Kafka `max.poll.records`、JDBC `addBatch`、Netty 的 flush 合并。

> **面试锚点**
> - `wrapPoint` 是怎么算出来的？为什么这个减法就能判断会不会覆盖未消费数据？
> - `cachedValue` 缓存的是什么？为什么它是普通 `long` 而不是 `Sequence`？
> - 为什么 `bufferSize` 必须是 2 的幂？不满足会怎样？
> - 环满时生产者在做什么？为什么这时候 `WaitStrategy` 不起作用？
> - 运行期动态加一个消费者，它能读到之前的事件吗？源码在哪保证的？

## Related

- [整体架构](/notes/source/java/base/disruptor/architecture/)：gating 序号在依赖图里的位置
- [多生产者协调](/notes/source/java/base/disruptor/multi-producer/)：多生产者下 `wrapPoint` 判定的变化
- [伪共享与缓存行填充](/notes/source/java/base/disruptor/false-sharing/)：`BUFFER_PAD` 与 `Sequence` 填充的完整推导
- [Disruptor 总览](/notes/source/java/base/disruptor/)
