---
title: 面试专题
description: Disruptor 高频面试题、高难追问、线上场景题与源码级加分答法。
category: Backend
tags:
  - Source Reading
  - Disruptor
  - Interview
  - Concurrency
order: 19
updatedDate: 2026-08-14
difficulty: advanced
status: stable
lastReviewed: 2026-08-14
draft: false
sidebar:
  order: 19
---

Disruptor 是并发面试里性价比最高的项目：代码量小到可以真读完，考点密度却极高——缓存行、内存屏障、CAS 与 FAA、无锁数据结构、批量摊薄，一个项目全覆盖。面试官问它，本质是在验证「你是否真的进去读过」。

<!-- more -->

## 高频题

### Disruptor 比 ArrayBlockingQueue 快在哪？

**30 秒版**：四点。一是无锁——生产者用原子操作抢序号，消费者只做普通读加内存屏障，避开了锁竞争带来的线程挂起唤醒；二是消除伪共享——所有热点序号前后各填 56 字节，独占缓存行；三是预分配复用——环形数组构造期就把对象填满，之后只覆写字段，稳态零分配；四是天然批量——消费者一次等待可以拿到一整批可读序号。

**展开**：更本质的一句话是**它降低了协调频率**，而不只是把锁换成 CAS。生产者用 `cachedValue` 缓存消费者进度（`SingleProducerSequencer.java:53`），容量 1024 的环稳态下大约每 1024 条消息才做一次跨核读；消费者整批处理完才 `sequence.set(endOfBatchSequence)` 一次（`BatchEventProcessor.java:173`），把 N 次跨核写压成 1 次。`ArrayBlockingQueue` 每次 `put`/`take` 都要抢同一把锁、写同一个 `count`，协调频率是每条消息一次。

**加分项**：`ArrayBlockingQueue` 的 `takeIndex`、`putIndex`、`count` 是三个相邻字段，生产者写 `putIndex`、消费者写 `takeIndex`，两者大概率落在同一条缓存行上——这是它性能上限的一个物理成因，跟锁无关。

**常见错答**：只说「用了 CAS 所以比锁快」。CAS 在高竞争下会退化成忙等重试，未必比锁快；Disruptor 快的关键在于把需要协调的次数降下来了。

---

### RingBuffer 的容量为什么必须是 2 的幂？

**30 秒版**：为了用 `sequence & (bufferSize - 1)` 替代 `sequence % bufferSize`。取模是几十个周期的整数除法，位与是一条周期指令，而这个换算在每个事件上都要做一次。

**展开**：构造函数用 `Integer.bitCount(bufferSize) != 1` 强制校验（`RingBuffer.java:54`），不满足直接抛异常——注意它**不会自动向上取整**，传 1000 就是报错，得自己用 `Util.ceilingNextPowerOfTwo`（`util/Util.java:36`）处理。同一个前提还被多生产者复用：`indexShift = Util.log2(bufferSize)`（`MultiProducerSequencer.java:59`），用右移求「绕了第几圈」。

**加分项**：`Util.ceilingNextPowerOfTwo` 的实现是 `1 << (Integer.SIZE - Integer.numberOfLeadingZeros(x - 1))`，注释里标了出处是 *Hacker's Delight* 第 3 章。同样的「2 的幂 + 掩码」组合出现在 `HashMap`、`ThreadLocalMap`、JCTools 队列里，是一个通用手法。

**常见错答**：说「为了方便扩容」——环形队列容量固定，根本不扩容。

---

### 什么是伪共享？Disruptor 怎么解决？

**30 秒版**：CPU 缓存以 64 字节的缓存行为单位失效。两个逻辑上无关的变量若落在同一条缓存行，一个核写其中一个，另一个核上整条行的副本就作废，对方下次读得重新加载。Disruptor 的解法是在热点字段前后各填 56 字节，让它独占一条缓存行。

**展开**：填充必须写成继承结构：`LhsPadding → Value → RhsPadding → Sequence`（`Sequence.java:7/19/24/44`）。因为 **JVM 不保证同一个类内的字段按声明顺序排列**，会按类型宽度重排；唯一可靠的保证是「超类字段排在子类字段之前」。56 这个数字是 64 − 8：要让任意一条包含 `value` 的缓存行里除它之外全是填充，两侧各需要至少 56 字节。

**加分项**：4.0 把填充从 `long p1..p7` 改成了 56 个独立的 `byte`。commit `bd5d7d8` 的原文写着「to fit with JDK 15 memory layout changes」并附了 Shipilev 那篇 *Objects Inside Out* 里 "hierarchy tower padding trick collapse in JDK 15" 一节的链接——JDK 15 重写了字段布局算法（JDK-8237767），会把子类字段塞进超类布局的空洞，byte 粒度填充不留空洞才能挡住。

**常见错答**：说「用 `@Contended` 就行了」。Disruptor 作为类库不能用：JDK 9+ 它在 `jdk.internal.vm.annotation` 下不可见，且要求使用方加 `-XX:-RestrictContended` 和 `--add-exports`——类库没资格要求使用方改 JVM 参数，忘了加就静默失去全部收益。

---

### 有哪些等待策略？生产上怎么选？

**30 秒版**：八种，本质是「CPU 换延迟」的滑块。`BusySpin` 纯自旋，延迟最低但吃满一核；`Yielding` 自旋 100 次后 yield；`Sleeping` 三阶段退避，是通用默认；`Blocking` 用 `wait/notify`，最省 CPU 但延迟最高；再加 `LiteBlocking`、两个 `Timeout` 版本和自适应的 `PhasedBackoff`。

**展开**：选型看两个约束。第一，**消费者线程数是否小于可用物理核数**——不满足就别碰自旋类，否则消费者互相抢核，上下文切换风暴。第二，**是否跑在容器里**——K8s 设了 CPU limit 的话，忙等会把 quota 空转掉，触发 cgroup 限流后延迟不降反升。金融撮合这类能独占核的场景用 `BusySpin`，普通业务和异步日志用 `Sleeping` 或 `Blocking`。

**加分项**：需要周期性心跳或定时 flush 时选 `TimeoutBlockingWaitStrategy`，它超时会抛 `TimeoutException`，`BatchEventProcessor` 捕获后回调 `onTimeout`（`BatchEventProcessor.java:180-183`）——但默认实现是空的，不覆写等于白配。

**常见错答**：认为 `BusySpin` 在任何场景都最快。线程数超过核数或在受限容器里，它是最慢的那个。

---

### Disruptor 里有几种 Sequence？分别代表什么？

**30 秒版**：三类。生产者的 `cursor`（挂在 `AbstractSequencer.java:35`）；每个消费者自己的 `sequence`（`BatchEventProcessor.java:43`）；生产者持有的 `gatingSequences` 数组（`AbstractSequencer.java:36`），是它需要等待的那些消费者序号的集合。

**展开**：数据流是单向的：生产者写自己的 cursor、读 gating 序号；消费者写自己的 sequence、读 cursor 或上游 sequence。**没有任何一个变量被双向写**——这是整个无锁设计成立的前提。

**加分项**：`gatingSequences` 里只放**消费链链尾**的序号，不放中间节点。实现在 `updateGatingSequencesForNextInChain`（`dsl/Disruptor.java:567`）：新建一批消费者后把它们加进 gating，同时把它们的上游从 gating 移除。原因是链尾按定义永远小于等于上游，多遍历的序号对 `Util.getMinimumSequence` 求最小值毫无贡献，纯粹是生产者热路径上的浪费。

**常见错答**：说「RingBuffer 有一个读指针一个写指针」——那是普通环形队列的模型。Disruptor 没有共享的读指针，每个消费者有自己独立的序号。

---

### 单生产者和多生产者有什么区别？

**30 秒版**：单生产者的 `next()` 就是普通字段自增，零原子操作；多生产者用 `cursor.getAndAdd(n)` 抢号。更关键的是 cursor 语义变了——单生产者的 cursor 在 `publish()` 时更新，等于「可读上界」；多生产者的 cursor 在 `next()` 时就更新，只是「已分配上界」，中间可能有还没写完的空洞。

**展开**：所以多生产者需要一个额外的 `availableBuffer` 位图记录每个槽位的发布状态，消费者拿到 `waitFor` 的返回值后还得调 `getHighestPublishedSequence`（`ProcessingSequenceBarrier.java:63`）从下界往上扫，遇到第一个未发布的序号就停。单生产者版的同名方法是直接 return（`SingleProducerSequencer.java:249-252`），O(1)。

**加分项**：多线程误配成 `ProducerType.SINGLE` 会**静默数据损坏**，因为 `nextValue++` 不是原子的。4.0 加了 `assert sameThread()`（`SingleProducerSequencer.java:136`），内部拿一个 `HashMap<SingleProducerSequencer, Thread>` 记首次发布线程——但 `assert` 只在 `-ea` 下生效，生产环境不报。所以压测务必带 `-ea` 跑一轮。

**常见错答**：说「多生产者只是加了把锁」。全程没有锁，区别在原子操作和发布状态的表示方式。

---

### 为什么说 Disruptor 是零分配的？

**30 秒版**：环形数组在构造期就用 `EventFactory` 把所有槽位填满对象（`RingBuffer.java:64`），运行期只覆写已有对象的字段，不 `new`。稳态下不产生任何年轻代垃圾。

**展开**：这也是它的使用约定来源——必须写成 `next()` 拿序号 → `get(seq)` 拿到**复用的**对象 → 改字段 → `publish(seq)` 的三段式，而不是「new 一个事件塞进去」。

**加分项**：复用是把双刃剑：槽位对象上一轮的引用型字段如果不清理会残留，既可能被读成脏数据，也会让被引用对象无法回收造成内存泄漏。规范做法是在 `onEvent` 结束前显式清空引用字段，或在 `EventTranslator` 里保证全量覆写。

**常见错答**：说「因为用了对象池」。它比对象池更强——对象池仍有借还与并发管理开销，Disruptor 是序号到槽位的静态映射，连借还都不需要。

---

## 高难追问

### `releaseFence()` 为什么必须放在写之前，而不是之后？

**30 秒版**：屏障约束的是「两侧指令不能跨越它重排」。要挡住「事件内容的写被重排到序号写之后」，屏障必须夹在这两者之间——也就是序号写的**前面**。放在后面挡不住任何东西。

**展开**：`Sequence.set` 的实现是 `VarHandle.releaseFence(); this.value = value;`（`Sequence.java:100`）。配对的读侧是 `long value = this.value; VarHandle.acquireFence();`（`Sequence.java:86`）——acquire 在读**之后**，保证后续对事件对象的读不会被提前到读序号之前。一前一后不是随手写的，是 release/acquire 语义的定义要求。

**加分项**：这是踩过坑改出来的。commit `2760550` 的原文：「Add needed release fence before the store of volatile value in sequence. **To get the same behaviour as volatile using memory barrier directly a full fence is not enough**」——只在写后面加 `fullFence()` 不够。前一个 commit `1d5d5db` 说得更具体：「We are intending a store/store barrier between this write and any previous store (i.e. ringbuffer entry changes)」。

**常见错答**：认为「加了屏障就行，位置无所谓」。位置错了等于没加。

---

### `Sequence.value` 不是 volatile，为什么可以这样？

**30 秒版**：因为发布路径只需要 Store/Store 屏障，而 `volatile` 写会带上更贵的 StoreLoad。用显式 fence 可以只买需要的那部分。

**展开**：x86 的 TSO 内存模型本身就保证 Store/Store 有序，所以 `releaseFence()` 在 x86 上**编译成零条指令**；而 `volatile` 写会生成带 `lock` 前缀的指令，附带 StoreLoad 屏障，开销几十个周期。在 ARM 这类弱内存模型上，JIT 会为 `releaseFence()` 老实生成对应屏障指令。一套代码，按架构付费。

**加分项**：`Sequence` 提供了三种写：`set()` 是 releaseFence + 普通写（热路径）；`setVolatile()` 是 releaseFence + 写 + fullFence，语义等价完整 volatile 写（`Sequence.java:114`）；CAS/getAndAdd 是完整屏障。`setVolatile` 只用在一处冷路径——生产者判满前刷游标（`SingleProducerSequencer.java:151`），源码注释直接标了 `// StoreLoad fence`。

**常见错答**：把 `Sequence` 当成 `AtomicLong` 的等价物，用 `set()` 却期待完整 volatile 语义。

---

### `BlockingWaitStrategy.waitFor` 里为什么有两个 while 循环？

**30 秒版**：第一个在 `cursorSequence` 上 `wait()` 等生产者，第二个在 `dependentSequence` 上自旋等上游消费者。第二个不能也用 `wait()`，因为上游消费者推进进度只是一次内存写，不会调 `notifyAll()`，在它上面 `wait()` 会永久挂起。

**展开**：生产者会喊你——`publish()` 里紧跟着 `waitStrategy.signalAllWhenBlocking()`（`SingleProducerSequencer.java:226`）。上游消费者不会——它只做 `sequence.set(endOfBatchSequence)`（`BatchEventProcessor.java:173`）。所以只能自旋。

**加分项**：没有上游依赖时，`dependentSequence` 在构造时**直接指向 `cursorSequence`**（`ProcessingSequenceBarrier.java:40-47`）。所以对绝大多数单级消费者，第一段退出时第二段条件已满足，一次都不进循环；只有配了 `handleEventsWith(a).then(b)` 的多级链，第二段才真正开始自旋。

**常见错答**：说「第二个循环是防止虚假唤醒」——虚假唤醒是第一个循环里 `while` 而非 `if` 的理由，两回事。

---

### `next()` 用 `getAndAdd`，`tryNext()` 却还是 CAS 循环，为什么不统一？

**30 秒版**：因为 `tryNext` 的语义是「没容量就不占坑，直接抛异常」。`getAndAdd` 是无条件的，一旦执行序号就已经被占走，无法回退——回退会在序号空间留下永不发布的空洞，消费者会卡死在那里。只有 CAS 能表达「先看清楚再决定提交」。

**展开**：`next()` 改用 `getAndAdd` 是 4.0 的性能优化（`MultiProducerSequencer.java:119`）：CAS 在竞争下会失败重试，N 个生产者每轮只有一个成功，其余白跑；`getAndAdd` 编译成 `lock xadd`，无条件成功，每个线程恰好付一次原子操作。代价是容量检查只能挪到抢号**之后**（`MultiProducerSequencer.java:125-134`）——序号已经是我的了，只能原地等消费者跟上。`tryNext` 不能接受这个代价，所以保留 CAS（`MultiProducerSequencer.java:162-172`）。

**加分项**：commit `62dec20`（2021-02-28）同时改了两个文件——`MultiProducerSequencer.java` 净减 37 行（CAS 循环消失），`Sequence.java` 净增 11 行（新增 `getAndAdd`，即 `Sequence.java:160`）。这个 commit 的 diff 形状本身就把意图说清楚了。

**常见错答**：说「getAndAdd 就是比 CAS 快，应该全换」。语义不同，`tryNext` 换不了。

---

### `availableBuffer` 为什么存「圈数」而不是布尔标志？

**30 秒版**：因为槽位会被复用。用布尔标志的话，第二圈写同一个槽位前必须先把上一圈的 `true` 清成 `false`，而这个清理动作没有安全的执行者。存圈数是**自失效**的——写下第 2 圈的瞬间，第 1 圈的判定自动失败，不需要任何清理。

**展开**：`flag = sequence >>> indexShift` 就是 `sequence / bufferSize`，即绕环圈数；`index = sequence & indexMask` 是槽位（`MultiProducerSequencer.java:265-273`）。判定就是 `availableBuffer[index] == flag`。数组初始填 `-1`（`MultiProducerSequencer.java:56`），保证第 0 圈之前一切不可读。

**加分项**：源码里有一段 19 行注释专门解释这套编码（`MultiProducerSequencer.java:211-229`），关键句是「*The upper portion of the sequence becomes the value to check for availability. ie: it tells us how many times around the ring buffer we've been*」。这个「用代数替代清理」的模式在 ABA 问题的版本号、epoch-based reclamation、GC card table 的 generation 标记里反复出现。

**常见错答**：说「因为 int 比 boolean 省空间」——恰恰相反，`int[]` 比 `boolean[]` 费空间。

---

### 环满时生产者在做什么？为什么这时 `WaitStrategy` 不起作用？

**30 秒版**：卡在 `while (wrapPoint > minSequence) LockSupport.parkNanos(1L)` 里无限自旋（`SingleProducerSequencer.java:154-157`）。这个循环是硬编码的，**不走 `WaitStrategy`**——`WaitStrategy` 只服务消费者侧的等待。

**展开**：现象是无异常、无日志、CPU 不高，整个环安静地停摆，排查时极具迷惑性。源码里作者自己留了 `// TODO: Use waitStrategy to spin?`，说明这是个已知的不完美之处。多生产者版有同样的循环（`MultiProducerSequencer.java:128-131`）。

**加分项**：可观测手段是 `remainingCapacity()`（`SingleProducerSequencer.java:201`），应当作为指标持续暴露。需要超时语义就用 `tryNext()`，它满时抛 `InsufficientCapacityException.INSTANCE`——注意这是个**无栈单例**，用于控制流，接住后按降级处理，别打堆栈日志。

**常见错答**：说「生产者会阻塞在 `BlockingWaitStrategy` 上」——那是消费者的等待路径。

---

## 场景题

### 线上 Disruptor 突然完全不消费了，怎么排查？

**排查路径**：

1. **jstack 看消费者线程栈**。停在 `WaitStrategy.waitFor` 说明没数据可读，问题在生产侧；停在业务 `onEvent` 里说明卡在业务逻辑（通常是阻塞 IO 或死锁）。
2. **看生产者线程栈**。停在 `SingleProducerSequencer.next` 的 `LockSupport.parkNanos` 说明**环满了**，回到第 1 步找是谁不消费。
3. **查 `remainingCapacity()`**。持续为 0 印证环满。
4. **查最可疑的根因：漏了 `publish()`**。生产者代码里 `next()` 之后如果没有 `try-finally`，中间任何一次异常都会留下永不发布的序号，消费者永远等不到它。多生产者下更隐蔽——`getHighestPublishedSequence` 遇到空洞即停（`MultiProducerSequencer.java:252`），**后面所有已发布的消息一起被挡住**。
5. **检查 `ExceptionHandler`**。默认的 `FatalExceptionHandler` 会重新抛出，可能已经把消费者线程打死了；此时 `BatchEventProcessor.run()` 的 `finally` 把状态置回 `IDLE`（`BatchEventProcessor.java:128`），线程消失但没人告警。

**根因排序**：漏 `publish()` > 业务 `onEvent` 阻塞 > 消费者线程被异常打死 > 多线程误用 `ProducerType.SINGLE`。

---

### CPU 打满但吞吐上不去，怎么办？

**排查路径**：

1. 先确认等待策略。用了 `BusySpin`/`Yielding` 且**消费者线程数 > 可用物理核数**，就是典型的自旋互抢，换 `Sleeping` 或 `Blocking` 立刻缓解。
2. 确认是否在容器里且设了 CPU limit。忙等会把 quota 空转掉，cgroup 限流后线程被强制暂停，表现为「CPU 满 + 延迟毛刺」。
3. 看是不是消费链太长。多级消费链上，下游消费者在 `BlockingWaitStrategy` 的第二段 `Thread.onSpinWait()` 里自旋（上游不发信号），链越深空转越多。
4. 排除以上后再看业务逻辑本身是否 CPU 密集。

---

### 用 Disruptor 换掉 `LinkedBlockingQueue` 后，p99 延迟反而变差了，可能是什么原因？

**根因候选**：

- **等待策略选错**。默认给了 `BlockingWaitStrategy` 却期待低延迟，唤醒开销比原来的队列还大。
- **多生产者的队头阻塞**。`ProducerType.MULTI` 下一个慢生产者会挡住它之后所有已完成的消息（`getHighestPublishedSequence` 遇空洞即停），这是 `LinkedBlockingQueue` 没有的失败模式。
- **`maxBatchSize` 没设**。一个落后很多的消费者一口气处理几十万条，期间不推进序号也不响应 `halt()`，表现为周期性的长尾。4.0 提供了这个参数（`BatchEventProcessor.java:63`）。
- **环太小**。容量不足时生产者频繁进入 `next()` 的等待分支，`cachedValue` 的优化完全失效，每次都要跨核读 gating 序号。
- **线程数超配**。消费者线程数超过核数，自旋策略下互抢。

**证据链**：jstack 采样看线程停在哪、`remainingCapacity()` 的分布、以及把 `ProducerType` 临时切成 SINGLE（单线程压测）对比 p99——如果切换后毛刺消失，基本可以确认是多生产者的队头阻塞。

---

## 反向问面试官

- 你们的生产者是单线程还是多线程？如果是 MULTI，有没有考虑过用一个前置队列收口成单生产者？
- 用的哪个 `WaitStrategy`？服务跑在容器里吗，CPU limit 设了多少？
- `EventHandler` 里有阻塞 IO 吗？是怎么和低延迟要求共存的？
- 还停在 3.x 还是升到 4.0 了？（4.0 移除了 `WorkerPool`/`WorkProcessor` 和 `Executor` 构造函数，是个不小的破坏性升级）

## Related

- [整体架构](/notes/source/java/base/disruptor/architecture/)
- [环形队列与序号栅栏](/notes/source/java/base/disruptor/ring-buffer/)
- [伪共享与缓存行填充](/notes/source/java/base/disruptor/false-sharing/)
- [等待策略与内存屏障](/notes/source/java/base/disruptor/wait-strategy/)
- [多生产者协调](/notes/source/java/base/disruptor/multi-producer/)
- [Disruptor 总览](/notes/source/java/base/disruptor/)
