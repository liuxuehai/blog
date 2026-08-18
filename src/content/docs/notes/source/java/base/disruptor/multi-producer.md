---
title: 多生产者协调
description: getAndAdd 抢序号为什么取代了 CAS 循环、availableBuffer 位图的轮次编码、getHighestPublishedSequence 存在的理由。
category: Backend
tags:
  - Source Reading
  - Disruptor
  - CAS
  - Concurrency
order: 15
updatedDate: 2026-08-14
difficulty: advanced
status: stable
lastReviewed: 2026-08-14
draft: false
sidebar:
  order: 15
---

`SingleProducerSequencer` 干净得像单线程代码，因为它本来就是。一旦允许多个线程同时发布，「抢到序号」和「数据写完了」就不再是同一件事——`MultiProducerSequencer` 的全部复杂度都来自弥合这条裂缝。

<!-- more -->

## 问题背景：乱序发布

单生产者场景下，序号的分配和发布天然有序：

```text
单生产者：  claim 5 → write 5 → publish 5 → claim 6 → write 6 → publish 6
            cursor 单调递增，cursor 的值 == 「可读上界」
```

多生产者场景下，两个动作被不同线程执行，**顺序会交错**：

```text
线程 A：  claim 5 ─────── write 5 (慢) ─────── publish 5
线程 B：      claim 6 ── write 6 (快) ── publish 6
                                          ↑
                          此刻 6 已发布，但 5 还没写完！
```

如果沿用单生产者的做法——用一个 cursor 表示「可读上界」——消费者会看到 cursor = 6，然后去读序号 5 的槽位，读到**上一轮遗留的脏数据**。

所以多生产者必须回答两个问题：**怎么无冲突地抢序号**，以及**怎么判断某个序号真的写完了**。

## 抢序号：从 CAS 循环到 getAndAdd

```java
// MultiProducerSequencer.java:112
public long next(final int n) {
    if (n < 1 || n > bufferSize) { throw new IllegalArgumentException("n must be > 0 and < bufferSize"); }

    long current = cursor.getAndAdd(n);          // ← 一次原子加，无重试

    long nextSequence = current + n;
    long wrapPoint = nextSequence - bufferSize;
    long cachedGatingSequence = gatingSequenceCache.get();

    if (wrapPoint > cachedGatingSequence || cachedGatingSequence > current) {
        long gatingSequence;
        while (wrapPoint > (gatingSequence = Util.getMinimumSequence(gatingSequences, current))) {
            LockSupport.parkNanos(1L);
        }
        gatingSequenceCache.set(gatingSequence);
    }
    return nextSequence;
}
```

3.x 时代这里是一个经典的 CAS 重试循环：读 cursor → 算 next → 检查容量 → `compareAndSet`，失败重来。4.0 换成了单条 `getAndAdd`。

**为什么 getAndAdd 更好**

**替代方案**：保留 `do { current = cursor.get(); ... } while (!cursor.compareAndSet(current, next))`。
**为什么不行**：`compareAndSet` 在 x86 上是 `lock cmpxchg`，**失败要重来**。N 个生产者并发时，每轮只有一个能成功，其余 N-1 个白跑一趟并再次竞争同一条缓存行——竞争越激烈，浪费越呈超线性增长。而 `getAndAdd` 编译成 `lock xadd`，**无条件成功**，每个线程恰好付一次原子操作的钱，没有重试。
**证据**：commit `62dec20`（*Increase MultiProducerSequencer performance on getting next sequence number*，2021-02-28，B Kottink）同时改了两个文件——`MultiProducerSequencer.java` 净减 37 行（CAS 循环消失），`Sequence.java` 净增 11 行（新增 `getAndAdd`，即今天的 `Sequence.java:160`）。这个 commit 的形状本身就说明了改动意图。

**代价**：`getAndAdd` 无法在提交前做容量检查——它是无条件的。所以「容量不够怎么办」被推到了抢号**之后**（`MultiProducerSequencer.java:125-134`）：序号已经归我了，只能原地等消费者跟上。

### 那 tryNext 为什么还留着 CAS 循环

```java
// MultiProducerSequencer.java:152
public long tryNext(final int n) throws InsufficientCapacityException {
    if (n < 1) { throw new IllegalArgumentException("n must be > 0"); }
    long current, next;
    do {
        current = cursor.get();
        next = current + n;
        if (!hasAvailableCapacity(gatingSequences, n, current)) {
            throw InsufficientCapacityException.INSTANCE;
        }
    } while (!cursor.compareAndSet(current, next));
    return next;
}
```

因为 `tryNext` 的语义是「**没容量就不占坑**，直接抛异常」。`getAndAdd` 一旦执行序号就已经被占走，无法回退——回退会在序号空间里留一个永远不会被发布的空洞，消费者卡在那里等一条永远不来的消息。

只有 CAS 能表达「先看清楚再决定要不要提交」。这是 `next` 和 `tryNext` 采用不同原子操作的根本原因，也是理解「CAS 和 FAA 各自适用什么」的一个好例子：

| 原子操作 | 能否失败 | 能否前置条件判断 | 竞争下的表现 |
| --- | --- | --- | --- |
| `getAndAdd` / FAA | 否 | 否 | 恒定成本，无重试 |
| `compareAndSet` / CAS | 是 | **是** | 竞争越高重试越多 |

### cursor 语义的改变

这个改动带来一个必须记牢的差异：

| | `SingleProducerSequencer` | `MultiProducerSequencer` |
| --- | --- | --- |
| `cursor` 何时更新 | `publish()` 里（`SingleProducerSequencer.java:225`） | `next()` 里（`MultiProducerSequencer.java:119`） |
| `cursor` 的含义 | **可读上界** | **已分配上界**（可能有空洞未发布） |
| `getCursor()` 能否直接当可读位置用 | 能 | **不能** |

类注释对此有明确警告（`MultiProducerSequencer.java:30-32`）：多生产者下要拿可读位置必须走 `getHighestPublishedSequence`。

另一个细节：`gatingSequenceCache` 是一个 `Sequence`（`MultiProducerSequencer.java:38`），而单生产者版是普通 `long cachedValue`（`SingleProducerSequencer.java:53`）。因为前者被多个生产者线程共享，需要可见性保证和缓存行填充；后者是线程私有的纯本地缓存。

## availableBuffer：怎么知道一条消息真的写完了

```java
// MultiProducerSequencer.java:42 / :55-59
private final int[] availableBuffer;
availableBuffer = new int[bufferSize];
Arrays.fill(availableBuffer, -1);
indexMask  = bufferSize - 1;
indexShift = Util.log2(bufferSize);
```

每个槽位一个 `int`，存的**不是布尔值，而是「这条数据属于第几圈」**：

```java
// MultiProducerSequencer.java:265-273
private int calculateAvailabilityFlag(final long sequence) { return (int) (sequence >>> indexShift); }
private int calculateIndex(final long sequence)            { return ((int) sequence) & indexMask; }
```

`sequence >>> indexShift` 就是 `sequence / bufferSize`，即绕环的圈数。

```text
bufferSize = 8, indexShift = 3

序号   0..7   →  圈 0，槽位 0..7   → availableBuffer[i] = 0
序号   8..15  →  圈 1，槽位 0..7   → availableBuffer[i] = 1
序号  16..23  →  圈 2，槽位 0..7   → availableBuffer[i] = 2

发布序号 17：index = 17 & 7 = 1，flag = 17 >>> 3 = 2
             availableBuffer[1] = 2
判定序号 17：availableBuffer[1] == 2 ?  → 是，可读
判定序号  9：availableBuffer[1] == 1 ?  → 否（已是 2），是上一圈的陈旧值
```

**为什么存圈数而不是布尔标志**

**替代方案**：`boolean[] published`，发布时置 `true`。
**为什么不行**：槽位会被复用。第二圈写同一个槽位前，必须先把上一圈的 `true` 清成 `false`，否则消费者会把上一圈的残留当成本圈已发布。而「清标志」这个动作没有安全的执行者——生产者清了还没写就是空窗，消费者清就要额外写共享内存，把好不容易做成单向的数据流又变成双向。
**证据**：源码里有一段 19 行的注释专门解释这套编码（`MultiProducerSequencer.java:211-229`），核心句是「*The upper portion of the sequence becomes the value to check for availability. ie: it tells us how many times around the ring buffer we've been*」。写入圈数是**自失效**的：写下圈 2 的瞬间，圈 1 的判定自动失败，不需要任何清理动作。初始值填 `-1`（`MultiProducerSequencer.java:56`）保证第 0 圈之前一切都不可读。

### 数组元素的内存屏障

```java
// MultiProducerSequencer.java:36
private static final VarHandle AVAILABLE_ARRAY = MethodHandles.arrayElementVarHandle(int[].class);

// MultiProducerSequencer.java:237  发布
AVAILABLE_ARRAY.setRelease(availableBuffer, index, flag);

// MultiProducerSequencer.java:248  判定
return (int) AVAILABLE_ARRAY.getAcquire(availableBuffer, index) == flag;
```

`setRelease` / `getAcquire` 是数组元素粒度的 release/acquire 配对——`setRelease` 保证「先写事件对象，再写可用标志」，`getAcquire` 保证「先读标志，再读事件对象」，与 `Sequence` 的 `set/get` 是同一套语义（见 [等待策略与内存屏障](/notes/source/java/base/disruptor/wait-strategy/)）。

Java 没有 `volatile int[]`（`volatile` 修饰的是数组引用而非元素），`VarHandle` 是 JDK 9+ 表达这件事的标准方式。3.x 用 `Unsafe.putOrderedInt` 实现同样效果，4.0 在 `70b7d22 Replace main MultiProducerSequencer with VarHandle alternative` 中完成替换，且配套加了 jcstress 并发测试来验证可用性判定的正确性（`eab26b3`）。

## getHighestPublishedSequence：补上最后一块

消费者侧的 `waitFor` 拿到的 `availableSequence` 只是「cursor 走到哪了」，多生产者下它可能包含空洞。所以栅栏必须再问一次：

```java
// ProcessingSequenceBarrier.java:63
return sequencer.getHighestPublishedSequence(sequence, availableSequence);
```

```java
// MultiProducerSequencer.java:252
public long getHighestPublishedSequence(final long lowerBound, final long availableSequence) {
    for (long sequence = lowerBound; sequence <= availableSequence; sequence++) {
        if (!isAvailable(sequence)) {
            return sequence - 1;      // 遇到第一个空洞就停
        }
    }
    return availableSequence;
}
```

单生产者版则是纯粹的直通（`SingleProducerSequencer.java:249-252`）：

```java
public long getHighestPublishedSequence(final long lowerBound, final long availableSequence) {
    return availableSequence;
}
```

同一个抽象方法，一个是 O(n) 扫描，一个是 O(1) 直接返回——**多生产者的代价在这里以最直观的形式暴露出来**。

```text
cursor = 10（已分配到 10）
availableBuffer 状态：  5✓ 6✓ 7✓ 8✗ 9✓ 10✓
                                    ↑ 线程 A 还没写完

getHighestPublishedSequence(5, 10) 从 5 扫到 8，发现 8 不可用 → 返回 7
消费者本批只处理 5、6、7；9 和 10 虽然已发布，也必须等 8 补上
```

这就是**队头阻塞**：一个慢生产者会挡住它之后所有已完成的消息。这是多生产者模式下最重要的性能特征。

## 单 vs 多：怎么选

| 维度 | `ProducerType.SINGLE` | `ProducerType.MULTI` |
| --- | --- | --- |
| 抢序号 | 普通字段自增，零原子操作 | 一次 `lock xadd` |
| gating 缓存 | 线程私有 `long` | 共享 `Sequence`（有填充成本） |
| 发布 | `cursor.set()`，一次内存写 | 写 `availableBuffer`，一次 release 写 |
| 消费者定位可读位置 | O(1) | **O(批长度) 扫描** |
| 队头阻塞 | 不存在 | 存在 |
| 用错的后果 | 多线程用 SINGLE：**静默数据损坏** | 单线程用 MULTI：只是慢一点 |

**结论**：单生产者快得多，能用就用。如果业务天然多线程，优先考虑「多个线程先汇聚到一个发布线程」——用一个廉价的 MPSC 队列收口，再单线程发布进 Disruptor，往往比直接开 MULTI 更快。

4.0 为「用错」加了一道防线（`SingleProducerSequencer.java:136`）：

```java
assert sameThread() : "Accessed by two threads - use ProducerType.MULTI!";
```

内部用一个 `HashMap<SingleProducerSequencer, Thread>` 记录首次发布线程（`SingleProducerSequencer.java:273-295`）。但 `assert` **只在 `-ea` 下生效**，生产环境静默无效——压测时务必带上 `-ea` 跑一轮。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| 多线程发布配了 `ProducerType.SINGLE` | 事件丢失/覆盖，**无异常** | `nextValue++` 不是原子的，两个线程拿到同一序号 | 压测加 `-ea` 触发 assert；代码评审重点检查 `ProducerType` |
| 某个生产者线程在 `next()` 与 `publish()` 之间卡住 | 该序号之后的所有消息全部不可读 | `getHighestPublishedSequence` 遇空洞即停 | `next/get/publish` 必须 `try-finally`；生产者内禁止长耗时操作 |
| 生产者在 `next()` 与 `publish()` 之间抛异常且未 publish | 环永久卡死 | 空洞永不填补 | 同上；`finally` 里即使数据不完整也要 publish，靠事件里的标志位表达「这条无效」 |
| 大批量 `publish(lo, hi)` | 逐个写标志，O(n) | `MultiProducerSequencer.java:202-209` 是循环 | 正常代价，注意批不要过大 |
| 期望 `getCursor()` 表示可读位置 | 读到未写完的槽位 | 多生产者下 cursor 是「已分配」 | 用 `getHighestPublishedSequence`，或直接依赖 `SequenceBarrier` |
| 消费者出现明显的延迟毛刺 | p99 抖动 | 队头阻塞：一个慢生产者挡住后续 | 定位慢生产者；或改单生产者收口 |

## 可迁移知识

1. **FAA 与 CAS 的选择依据**：需要「先判断再提交」就必须 CAS；只需要「无条件占号」就用 FAA，它在高竞争下的表现是恒定的而非退化的。`AtomicLong.incrementAndGet`、`LongAdder`、Kafka 的 offset 分配都在这条判断线上。
2. **用「代」/「轮次」替代需要清理的标志位**：写入新一代的值让旧值自动失效，省掉清理步骤和清理者的选择难题。这个模式在 ABA 问题的版本号方案、`ConcurrentHashMap` 的 `sizeCtl`、GC 的 card table generation、以及各种 epoch-based reclamation 里反复出现。
3. **同一抽象的两种实现，代价要暴露给调用方**：`getHighestPublishedSequence` 一个 O(1) 一个 O(n)，接口相同但性能特征完全不同。设计抽象时，把这种差异写进文档比藏起来更负责。
4. **队头阻塞是「保序 + 并行」的固有代价**：TCP、HTTP/1.1 pipelining、Kafka 单分区、这里的多生产者，都是同一个矛盾。要么放弃保序，要么接受阻塞。
5. **收口优于并发**：多线程直接并发写共享结构，往往不如「多线程 → 廉价队列 → 单线程写」。这是 LMAX 架构本身的核心主张，也是 Redis 单线程模型的同一思路。

> **面试锚点**
> - 多生产者下 `cursor` 表示什么？和单生产者有什么区别？
> - `next()` 用 `getAndAdd`，`tryNext()` 用 CAS 循环，为什么不统一？
> - `availableBuffer` 为什么存圈数而不是布尔标志？
> - 为什么必须有 `getHighestPublishedSequence`？它的复杂度是多少？
> - 多线程用了 `ProducerType.SINGLE` 会发生什么？框架有防护吗？
> - 多生产者的队头阻塞怎么产生的？怎么缓解？

## Related

- [环形队列与序号栅栏](/notes/source/java/base/disruptor/ring-buffer/)：单生产者版的 `wrapPoint` 判定
- [等待策略与内存屏障](/notes/source/java/base/disruptor/wait-strategy/)：`setRelease`/`getAcquire` 的语义来源
- [整体架构](/notes/source/java/base/disruptor/architecture/)：两种 Sequencer 在架构中的位置
- [Disruptor 总览](/notes/source/java/base/disruptor/)
