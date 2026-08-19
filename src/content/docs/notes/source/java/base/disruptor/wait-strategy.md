---
title: 等待策略与内存屏障
description: 八种 WaitStrategy 的取舍、两段式等待循环为什么必须存在、releaseFence/acquireFence 如何替代 volatile。
category: Backend
tags:
  - Source Reading
  - Disruptor
  - Memory Model
  - Concurrency
order: 14
updatedDate: 2026-08-19
difficulty: advanced
status: stable
lastReviewed: 2026-08-19
draft: false
sidebar:
  order: 14
---

「消费者发现没数据可读时该干什么」——这个问题在 Disruptor 里被抽成一个只有两个方法的接口，八种实现覆盖了从「烧满 CPU 换纳秒延迟」到「彻底挂起换 CPU」的整条谱线。而支撑它们正确性的，是 `Sequence` 里那几个显式内存屏障。

<!-- more -->

## 先给答案：等待策略是在延迟、CPU 和调度让渡之间做选择

消费者等待的不是“线程什么时候醒”，而是“目标序号什么时候变得可见”。不同策略的差异，是当目标还没到达时，消费者愿意付出什么代价：持续占用 CPU 换极低延迟，主动让出执行权换较低功耗，还是进入阻塞等待换系统资源。

两段 `while` 的意义也因此不同：外层等待目标游标推进，内层在批量消费前重新确认可见上界。少掉任何一层，都可能把“序号已推进”和“数据已完整发布”混为一谈。选择策略前应先回答业务更怕什么：微秒级尾延迟、CPU 抖动，还是线程数量和功耗。


## 接口只有两个方法

```java
// WaitStrategy.java:41
long waitFor(long sequence, Sequence cursor, Sequence dependentSequence, SequenceBarrier barrier)
    throws AlertException, InterruptedException, TimeoutException;

// WaitStrategy.java:47
void signalAllWhenBlocking();
```

- `waitFor`：消费者调，阻塞直到 `sequence` 可读，返回**当前可读的最大序号**（可能远大于请求值，这正是批量的来源）。
- `signalAllWhenBlocking`：生产者在 `publish()` 里调（`SingleProducerSequencer.java:226`），唤醒可能在挂起的消费者。对纯自旋策略是空实现。

四个参数中最容易被忽略的是 `cursor` 和 `dependentSequence` **不是同一个东西**，下一节就是围绕这个差异展开的。

## 两段式等待循环：为什么必须有两个 while

以 `BlockingWaitStrategy` 为例（`BlockingWaitStrategy.java:29`）：

```java
long availableSequence;
if (cursorSequence.get() < sequence) {
    synchronized (mutex) {
        while (cursorSequence.get() < sequence) {     // ← 第一段：挂起等生产者
            barrier.checkAlert();
            mutex.wait();
        }
    }
}

while ((availableSequence = dependentSequence.get()) < sequence) {   // ← 第二段：自旋等上游消费者
    barrier.checkAlert();
    Thread.onSpinWait();
}
return availableSequence;
```

**为什么第二段不能也用 `wait()`**

**替代方案**：把两段合并，统一 `synchronized + wait` 在 `dependentSequence` 上等。
**为什么不行**：`mutex.wait()` 能醒过来，前提是有人调 `notifyAll()`。生产者会调——`publish()` 里紧跟着 `waitStrategy.signalAllWhenBlocking()`。但**上游消费者不会**：它推进进度靠的是 `sequence.set(endOfBatchSequence)`（`BatchEventProcessor.java:173`），一个纯粹的内存写，没有任何唤醒动作。在 `dependentSequence` 上 `wait()` 会永久挂起。
**证据**：`dependentSequence` 的来源在 `ProcessingSequenceBarrier.java:40-47`——没有上游依赖时它**直接指向 `cursorSequence`**，有依赖时才包成 `FixedSequenceGroup`。所以对绝大多数「无依赖消费者」而言，第一段退出时第二段的条件已经成立，循环一次都不进；只有在多级消费链（`handleEventsWith(a).then(b)`）里，第二段才真正开始自旋。

一句话总结：**生产者会喊你，上游消费者不会**。这就是两段式的全部理由。

## 八种策略

| 策略 | 等待手法 | CPU | 延迟 | 适用 |
| --- | --- | --- | --- | --- |
| `BusySpinWaitStrategy` | 纯 `Thread.onSpinWait()` 死循环（`BusySpinWaitStrategy.java:33`） | 100% 占满 | **最低**，纳秒级 | 消费者线程数 < 物理核数且能绑核；交易撮合 |
| `YieldingWaitStrategy` | 自旋 100 次后 `Thread.yield()`（`YieldingWaitStrategy.java:28`） | 100%，但让出调度 | 极低 | 线程数 ≈ 核数，愿意用满 CPU 换延迟 |
| `SleepingWaitStrategy` | 三阶段：忙循环 → `yield` → `parkNanos(100)`（`SleepingWaitStrategy.java:92-104`） | 低 | 中等，有抖动 | 通用默认；异步日志这类不苛求延迟的场景 |
| `BlockingWaitStrategy` | `synchronized` + `wait/notifyAll` | **最低** | 最高，含唤醒开销 | CPU 紧张、吞吐优先 |
| `LiteBlockingWaitStrategy` | 同上，但加 `signalNeeded` 标志位 | 最低 | 略优于 `Blocking` | 同上，且生产者热路径敏感 |
| `TimeoutBlockingWaitStrategy` | `wait(timeout)`，超时抛 `TimeoutException` | 最低 | 高 | 需要周期性 `onTimeout` 回调（心跳、定时 flush） |
| `LiteTimeoutBlockingWaitStrategy` | 前两者的组合 | 最低 | 高 | 同上 |
| `PhasedBackoffWaitStrategy` | 自旋 → yield → 委托给 fallback 策略 | 自适应 | 自适应 | 流量波动大、忙闲交替明显 |

### SleepingWaitStrategy 的三阶段

```java
// SleepingWaitStrategy.java:33-35
private static final int SPIN_THRESHOLD = 100;
private static final int DEFAULT_RETRIES = 200;
private static final long DEFAULT_SLEEP = 100;   // 纳秒

// SleepingWaitStrategy.java:92-104
if (counter > SPIN_THRESHOLD)      { return counter - 1; }        // 200→101：纯计数忙循环
else if (counter > 0)              { Thread.yield(); return counter - 1; }  // 100→1：让出 CPU
else                               { LockSupport.parkNanos(sleepTimeNs); }  // 0：真正休眠
```

注意第一阶段**连 `Thread.onSpinWait()` 都没调**，只是单纯递减——赌的是「数据马上就来」，连 PAUSE 指令的成本都想省掉。三阶段退避的思路和 `synchronized` 的偏向锁→轻量级锁→重量级锁升级同源：**先假设竞争短暂，失败了再逐级加码**。

### LiteBlockingWaitStrategy 省的是什么

```java
// LiteBlockingWaitStrategy.java:42  （消费者侧，进入等待前置位）
signalNeeded.getAndSet(true);

// LiteBlockingWaitStrategy.java:68  （生产者侧，发布时）
if (signalNeeded.getAndSet(false)) {
    synchronized (mutex) { mutex.notifyAll(); }
}
```

普通 `BlockingWaitStrategy` 的生产者**每次 publish 都要抢一次 `mutex`**（`BlockingWaitStrategy.java:55`），即使根本没有消费者在等。Lite 版用一个 `AtomicBoolean` 把它变成：无人等待时只做一次 CAS，跳过整个同步块。

代价是多一个原子操作和更复杂的双重检查（`LiteBlockingWaitStrategy.java:44` 在置位后又查了一次游标，防止「置位与生产者检查」之间的竞态导致漏唤醒）。

### PhasedBackoff 的两个坑

```java
// PhasedBackoffWaitStrategy.java:47
this.yieldTimeoutNanos = spinTimeoutNanos + units.toNanos(yieldTimeout);
```

`yieldTimeout` 是**累加**到 `spinTimeout` 之上的，不是独立的第二段时长。传 `(1ms, 1ms)` 意味着「自旋 1ms，然后 yield 到第 2ms，之后走 fallback」，不是「自旋 1ms + yield 1ms + ...」——虽然结果一样，但读参数时容易误解为绝对时刻还是相对时长。

另一个是 `SPIN_TRIES = 10000`（`PhasedBackoffWaitStrategy.java:28`）：**每一万次循环才读一次 `System.nanoTime()`**。因为 `nanoTime()` 本身要几十纳秒，每次都调会污染它想测量的东西。这是「测量成本不能超过被测对象」的经典处理。

## 内存屏障：为什么可以不用 volatile

`Sequence` 里那个 `long value` **不是 volatile 字段**（`Sequence.java:21`）。可见性完全由显式屏障提供：

```java
// Sequence.java:100  —— 写
public void set(final long value) {
    VarHandle.releaseFence();     // ← 屏障在写之前
    this.value = value;
}

// Sequence.java:86   —— 读
public long get() {
    long value = this.value;
    VarHandle.acquireFence();     // ← 屏障在读之后
    return value;
}
```

### 这对屏障保证了什么

```text
生产者线程                              消费者线程
─────────────────────────            ─────────────────────────
event.setValue(x)         ①
event.setFlag(y)          ②
                                          
releaseFence()            ③  ← ①②不能重排到 ③ 之后
cursor.value = seq        ④              value = cursor.value    ⑤
                                         acquireFence()          ⑥  ← ⑦⑧不能重排到 ⑥ 之前
                                         event = ringBuffer.get(seq)  ⑦
                                         read event.getValue()        ⑧

  ③ 的 release 保证：消费者一旦在 ⑤ 读到新 seq，①② 的写必然已可见
  ⑥ 的 acquire 保证：⑦⑧ 的读不会被提前到 ⑤ 之前，读不到旧数据
```

这就是标准的 **release/acquire 配对**——和 `volatile` 写/读的效果在这个场景下等价，但**代价不同**。

### 为什么不直接用 volatile

**替代方案**：`private volatile long value;`，读写都用普通语句。
**为什么不行**：`volatile` 写在 x86 上会被编译成带 `lock` 前缀的指令（通常是 `lock addl $0,(%rsp)` 或 `xchg`），它附带一个 **StoreLoad** 屏障，开销约几十个时钟周期。但发布路径**只需要 Store/Store**——保证「先写事件内容，再写序号」的顺序即可，完全不需要 StoreLoad。x86 的内存模型（TSO）本来就保证 Store/Store 有序，所以 `releaseFence()` 在 x86 上**编译成零条指令**；而在 ARM 这类弱内存模型上，JIT 会老实生成 `dmb ishst`。
**证据**：这套写法是逐步演进出来的，commit 记录很清楚：

| commit | 说明 |
| --- | --- |
| `fa7120e` | *Use simple volatile read for Sequence instead of UNSAFE* |
| `f6d4bf9` | *Use the manual memory-barrier version of Sequence in the main code* |
| `1d5d5db` | *The release fence should be before the store of value in sequence. We are intending a store/store barrier between this write and any previous store (i.e. ringbuffer entry changes)* |
| `2760550` | *Add needed release fence before the store of volatile value in sequence. **To get the same behaviour as volatile using memory barrier directly a full fence is not enough*** |

最后一条尤其值得读：**只在写之后加 `fullFence()` 是不够的**，必须在写**之前**加 `releaseFence()`。因为屏障约束的是「屏障两侧的指令不能跨越它重排」——要挡住「事件内容的写被重排到序号写之后」，屏障必须夹在两者中间。

### 三种写语义的分工

| 方法 | 组合 | 语义 | 谁在用 |
| --- | --- | --- | --- |
| `set` | `releaseFence` + 普通写 | Store/Store | 发布事件、推进消费进度（热路径，最省） |
| `setVolatile` | `releaseFence` + 写 + `fullFence` | 完整 volatile 写，含 StoreLoad | 生产者判满前刷游标（`SingleProducerSequencer.java:151`），冷路径 |
| `compareAndSet` / `getAndAdd` | `VarHandle` 原子操作 | 完整屏障 + 原子性 | 多生产者抢序号 |

**只在需要的地方付费**——这是整个 `Sequence` 设计的核心原则。

## Thread.onSpinWait()

所有自旋循环里都是 `Thread.onSpinWait()`（JDK 9+），它会发出 x86 的 `PAUSE` 指令或 ARM 的 `YIELD`。作用有三：提示 CPU 当前处于自旋、降低流水线上的内存序推测惩罚、在超线程场景下让出执行资源给同核的另一个硬件线程。

Disruptor 4.0 因此把自己造的 `ThreadHints.onSpinWait()` 标记为废弃（`src/docs/asciidoc/en/changelog.adoc:23`）——那是 JDK 8 时代用 `MethodHandle` 反射查找该方法的兼容层，4.0 把最低版本提到 JDK 11 后就没必要了。

> 顺带一个代码观察：`TimeoutBlockingWaitStrategy` 的第二段循环里只有 `barrier.checkAlert()`，**没有 `Thread.onSpinWait()`**（`TimeoutBlockingWaitStrategy.java:56-59`），与其他策略不一致。功能上无害（这段循环极少被执行到），但属于遗留的不统一。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| 容器/K8s 里用 `BusySpin` | CPU limit 被打满触发限流，延迟反而暴涨 | 忙等把整个 quota 消耗在空转上，cgroup 限流后线程被强制暂停 | 容器环境默认用 `BlockingWaitStrategy` 或 `SleepingWaitStrategy`；确需低延迟则申请独占核 |
| 消费者线程数 > 物理核数还用 `Yielding` | 上下文切换风暴，吞吐骤降 | 每个消费者都在满负荷自旋，互相抢核 | 消费者数量必须 ≤ 可用核数才谈得上自旋策略 |
| 用 `TimeoutBlockingWaitStrategy` 但没实现 `onTimeout` | 超时被当异常吞掉 | `BatchEventProcessor` 捕获 `TimeoutException` 后调 `notifyTimeout`（`BatchEventProcessor.java:180-183`），默认实现为空 | 覆写 `EventHandlerBase#onTimeout` 做心跳/flush |
| 多级消费链 + `BlockingWaitStrategy`，下游延迟高 | 下游在第二段 `Thread.onSpinWait()` 里空转 | 上游消费者推进序号不发信号 | 深链路慎用长链；或让下游用自旋类策略，反正它本来就要自旋 |
| 自己实现 `WaitStrategy` 忘了 `checkAlert()` | `shutdown()` / `halt()` 卡死 | `halt()` 靠 `barrier.alert()` 置位 + 等待策略主动检查来打断（`BatchEventProcessor.java:77-81`） | 任何循环内都必须调 `barrier.checkAlert()` |
| 认为 `Sequence` 是 `AtomicLong` 的等价物 | 误用 `set()` 期待 volatile 语义 | `set()` 只有 Store/Store，**没有 StoreLoad**，后续读可能看到旧值 | 需要完整 volatile 语义时用 `setVolatile()` |

## 可迁移知识

1. **release/acquire 配对是无锁编程的最小正确单元**。写侧 `releaseFence` 在存储前，读侧 `acquireFence` 在载入后——这个顺序不能记反，`2760550` 那条 commit 就是踩过之后补的。C++ 的 `memory_order_release/acquire`、Rust 的 `Ordering::Release/Acquire` 是同一套语义。
2. **只买需要的屏障**。x86 上 Store/Store 免费而 StoreLoad 昂贵，把 `volatile` 无脑用在热路径上等于每次都为不需要的 StoreLoad 付费。判断依据是「我到底要挡住哪种重排」。
3. **退避阶梯**：自旋 → yield → park，是 `synchronized` 锁升级、`ConcurrentHashMap` 扩容协助、连接池获取连接的共同形态。参数（自旋次数、阈值）应当可配，因为最优值强依赖硬件与负载。
4. **采样代替每次测量**：`PhasedBackoff` 每 10000 次才读一次 `nanoTime()`。任何「在热循环里判断是否超时」的代码都该这么写。
5. **策略模式的教科书用法**：一个接口两个方法、八个 `final` 实现、无状态或极少状态、通过构造参数注入。想学策略模式，读这八个类比读任何教程都快。

> **面试锚点**
> - `BlockingWaitStrategy.waitFor` 为什么有两个 while 循环？第二个能不能也用 `wait()`？
> - `Sequence.value` 是 volatile 的吗？不是的话可见性靠什么保证？
> - 为什么 `releaseFence()` 必须放在写**之前**而不是之后？
> - 什么场景下 `BusySpinWaitStrategy` 反而更慢？
> - `LiteBlockingWaitStrategy` 比 `BlockingWaitStrategy` 省了什么？
> - 自定义 `WaitStrategy` 时最容易漏掉的一步是什么？（`barrier.checkAlert()`）

## Related

- [伪共享与缓存行填充](/notes/source/java/base/disruptor/false-sharing/)：同一个 `Sequence` 的另一半故事
- [环形队列与序号栅栏](/notes/source/java/base/disruptor/ring-buffer/)：`waitFor` 返回值如何变成一批数据
- [整体架构](/notes/source/java/base/disruptor/architecture/)：`SequenceBarrier` 在依赖图中的位置
- [Disruptor 总览](/notes/source/java/base/disruptor/)
