---
title: 伪共享与缓存行填充
description: 继承式填充为什么有效、JDK 15 布局变更导致的 long→byte 改写、为什么不用 @Contended。
category: Backend
tags:
  - Source Reading
  - Disruptor
  - False Sharing
  - JVM
order: 13
updatedDate: 2026-08-19
difficulty: advanced
status: stable
lastReviewed: 2026-08-19
draft: false
sidebar:
  order: 13
---

Disruptor 里最不像业务代码的一段，是 `Sequence` 前后各 56 个毫无用处的 `byte` 字段。它们不参与任何计算，唯一的作用是**让 CPU 缓存一致性协议闭嘴**。这一篇解释它为什么必须写成继承结构，以及 4.0 为什么把 `long` 改成了 `byte`。

<!-- more -->

## 先给答案：为什么一个无关字段会拖慢并发程序

伪共享不是“两个线程修改了同一个变量”，而是**两个线程修改不同变量，却共享同一条 CPU Cache Line**。缓存一致性协议以缓存行为失效单位：线程 A 写自己的序号时，可能让线程 B 正在读取的序号缓存失效；结果是逻辑上互不相干的读写，被硬件强行串成了反复同步。

Disruptor 的解法不是给每次读写加锁，而是让高频变化、跨线程观察的序号在物理布局上彼此隔离。代价是对象或数组会多占空间，而且填充只对特定字段布局成立；它优化的是高频共享状态，不是所有对象都应该套用的通用技巧。


## 问题背景：伪共享

CPU 缓存以**缓存行**为单位工作，主流 x86-64 与 ARM64 都是 64 字节。缓存一致性协议（MESI 及其变体）也在缓存行粒度上操作：只要一个核写了某条缓存行里的**任意一个字节**，其他核上这条行的副本全部作废。

于是出现一个反直觉的现象：

```text
                    一条 64 字节缓存行
        ┌────────────────┬────────────────┬─────────┐
        │  producer 的    │  consumer 的   │  其他    │
        │  cursor (8B)   │  sequence (8B) │  字段    │
        └────────────────┴────────────────┴─────────┘
              ↑ Core 0 写           ↑ Core 1 写

  两个核操作的是**完全不同的变量**，但每次写都会让对方的缓存行失效，
  对方下次读必须回到 L3 或内存重新加载 —— 几十到上百周期。
```

这就是**伪共享（False Sharing）**：逻辑上无关的变量，物理上被绑在一起。在 Disruptor 这种「生产者和消费者疯狂读写各自序号」的场景里，它是头号性能杀手。

## 解法：把热点字段单独关进一条缓存行

```java
// Sequence.java:7
class LhsPadding {
    protected byte
        p10, p11, p12, p13, p14, p15, p16, p17,
        p20, p21, p22, p23, p24, p25, p26, p27,
        // ... 共 7 组，56 字节
        p70, p71, p72, p73, p74, p75, p76, p77;
}

// Sequence.java:19
class Value extends LhsPadding {
    protected long value;
}

// Sequence.java:24
class RhsPadding extends Value {
    protected byte
        p90, ... p157;      // 同样 56 字节
}

// Sequence.java:44
public class Sequence extends RhsPadding { ... }
```

内存布局：

```text
偏移  0        12                68      76                132  136
     ┌────────┬─────────────────┬───────┬─────────────────┬────┐
     │ 对象头  │  LhsPadding 56B │ value │  RhsPadding 56B │对齐 │
     └────────┴─────────────────┴───────┴─────────────────┴────┘
                                 └─ 8B ─┘

  任取一条包含 value 的 64 字节缓存行：
  左边最多能覆盖到 value-56，右边最多 value+8+55 —— 全是填充字节。
  结论：value 所在的缓存行里，除了它自己，不存在任何其他有意义的字段。
```

**56 这个数字怎么来的**：一条缓存行 64 字节，要保证「无论 `value` 落在行内哪个位置，同行的其余部分都是填充」，两侧各需要 ≥ 56 字节（64 − 8）。少一个字节都可能让相邻对象的字段挤进来。

## 为什么必须用继承，不能写在同一个类里

**替代方案**：直接在 `Sequence` 里写 `byte p1...p56; long value; byte p57...p112;`。
**为什么不行**：**JVM 不保证同一个类内的字段按声明顺序排列**。HotSpot 的字段布局算法会按类型宽度重排（通常 long/double → int/float → short/char → byte/boolean → 引用），目的是减少对齐空洞。写在同一个类里，`value` 极可能被重排到所有 `byte` 的前面，填充完全失效。
**证据**：JVM 唯一保证的顺序是**超类字段排在子类字段之前**——这是继承布局的固有约束。Disruptor 把 `LhsPadding → Value → RhsPadding → Sequence` 拆成四层，就是在借用这条唯一可靠的保证。commit `fe85c9f Use inheritence based field padding` 记录了这次改造。

同一手法在这个仓库里出现了三次：

| 类 | 填充结构 | 保护的字段 |
| --- | --- | --- |
| `Sequence` | `LhsPadding` → `Value` → `RhsPadding` | `long value`（`Sequence.java:21`） |
| `SingleProducerSequencer` | `SingleProducerSequencerPad` → `SingleProducerSequencerFields` → 本类再补尾部填充 | `nextValue` / `cachedValue`（`SingleProducerSequencer.java:52-53`） |
| `RingBuffer` | `RingBufferPad` → `RingBufferFields` → 本类再补尾部填充 | `indexMask` / `entries` / `bufferSize` / `sequencer`（`RingBuffer.java:37-40`） |

注意后两个的**尾部填充写在最终类自己身上**（`SingleProducerSequencer.java:66-73`、`RingBuffer.java:90-97`）——因为它们是 `final` 类，不会再有子类字段跟在后面，自己声明就够了。

## 4.0 的改动：long → byte

3.x 时代填充字段是 `protected long p1, p2, p3, p4, p5, p6, p7;`（7 × 8 = 56 字节）。4.0 改成了 56 个独立的 `byte`。语义完全一样，字节数完全一样，为什么要改？

commit `bd5d7d8` 的原文给了答案：

> Move false-sharing padding to be in bytes rather than long to fit with JDK 15 memory layout changes.
> see: `https://shipilev.net/jvm/objects-inside-out/#_observation_hierarchy_tower_padding_trick_collapse_in_jdk_15`

**背景**：JDK 15 重写了字段布局算法（JDK-8237767 *Field layout computation overhaul*）。新算法会**把子类字段塞进超类布局留下的空洞**里，以减少对象体积。而「继承塔填充」这个技巧恰恰建立在「超类字段物理上先于子类字段」的假设上——一旦子类的热点字段可以被挪进超类填充区域的空洞，隔离就被破坏了，这就是 Shipilev 那篇文章里说的 *padding trick collapse*。

**为什么 byte 能修复**：`long` 是 8 字节对齐的，在 12 字节对象头之后天然留下 4 字节空洞；`byte` 粒度的填充可以把这些空洞逐字节填满，不给布局器留任何可利用的间隙，热点字段也就无处可挪。

> 这类「上游 JVM 改了实现细节 → 库必须跟着改」的例子在 Disruptor 里不止一处。同期还有一整轮 `Unsafe` 清退：`63f9abc Remove Unsafe from the main library source`、`70b7d22 Replace main MultiProducerSequencer with VarHandle alternative`。看这些 commit 比看文档更能理解「为什么代码长这样」。

## 为什么不用 `@Contended`

JDK 提供了官方的填充注解，一行就能达到同样效果：

```java
@Contended
public class Sequence { private volatile long value; }
```

**为什么不行**：

| 障碍 | 说明 |
| --- | --- |
| **包位置** | JDK 8 是 `sun.misc.Contended`，JDK 9+ 挪到 `jdk.internal.vm.annotation.Contended`，对 `java.base` 之外的代码不可见 |
| **需要启动参数** | 对非 JDK 类生效必须加 `-XX:-RestrictContended`；JDK 9+ 还要 `--add-exports java.base/jdk.internal.vm.annotation=ALL-UNNAMED` |
| **库的立场** | Disruptor 是被别人依赖的类库，**没有资格要求使用方改 JVM 启动参数**。一个忘了加参数的用户会静默地失去全部性能收益且毫无提示 |

手写填充丑，但零依赖、零配置、任何 JVM 上行为一致。这是典型的「类库作者与应用作者约束不同」的取舍——同样的理由也解释了为什么 4.0 要把 `Unsafe` 清干净（模块化之后 `Unsafe` 会打印警告甚至被拒绝）。

## 数组的填充：BUFFER_PAD

`Sequence` 保护的是单个字段，`RingBuffer` 的数组则用另一种方式：

```java
// RingBuffer.java:35 / :60 / :72
private static final int BUFFER_PAD = 32;
this.entries = (E[]) new Object[bufferSize + 2 * BUFFER_PAD];
return entries[BUFFER_PAD + (int) (sequence & indexMask)];
```

首尾各留 32 个空槽。压缩指针下引用 4 字节，32 × 4 = 128 字节 = 两条缓存行，隔开数组端部与堆上相邻对象。

这里有一段值得注意的历史反复：4.0 移除 `Unsafe` 时曾把数组填充一并删掉（`019c824 Remove padding from ring buffer array`），随后被回滚（`ed7d265 Revert "Remove unsafe based padding from RingBuffer."`）。最终形态是**保留填充、改用普通下标寻址**——即现在看到的 `entries[BUFFER_PAD + ...]`。

## 代价

填充不是免费的：

| 对象 | 无填充 | 有填充 |
| --- | --- | --- |
| `Sequence` | 12（头）+ 8 = 24 字节（对齐后） | 12 + 56 + 8 + 56 = 132 → **136 字节**（对齐后） |
| `RingBuffer` 的 `entries` | `bufferSize` 个引用 | `bufferSize + 64` 个引用（压缩指针下多 256 字节） |

约 5.7 倍的膨胀。之所以可以接受，是因为**这些对象的数量是常数级的**——一个 Disruptor 实例只有 1 个 `RingBuffer`、1 个 cursor、每个消费者 1 个 `Sequence`，总共几十个。填充只在「少量对象 + 极高访问频率」时才划算。

> **反面用法**：给业务实体类（订单、用户，动辄百万实例）加填充是灾难性的。判断标准是「这个字段被多个线程高频写吗？这类对象有多少个？」——两个条件同时成立才填充。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| 关闭压缩指针（堆 > 32GB 或 `-XX:-UseCompressedOops`） | 对象头从 12 变 16 字节，布局偏移整体位移 | 填充是按「≥56 字节」设计的，不依赖具体偏移，**仍然有效**，但对象更大 | 无需处理，知道即可 |
| 用 JOL 验证却看不到填充字段 | `-XX:+UnlockDiagnosticVMOptions` 未开或看的是错误的类 | 填充字段在超类里 | `org.openjdk.jol.info.ClassLayout.parseClass(Sequence.class).toPrintable()` 看完整继承布局 |
| 自己仿写填充但写在同一个类 | 压测没有任何提升 | 字段被 JVM 重排，填充失效 | 必须用继承塔，或用 JOL 确认实际偏移 |
| 在 JDK 15+ 上仿写 3.x 的 `long` 填充 | 隔离可能被布局器破坏 | 见上文 JDK-8237767 | 用 `byte` 粒度填充，并用 JOL 实测验证 |
| 迷信「加了填充就一定更快」 | 内存暴涨，性能无变化甚至下降 | 目标字段本来就没有跨线程写竞争 | 先用 `perf c2c`（Linux）或压测对比确认存在伪共享 |

## 可迁移知识

1. **继承塔填充是通用手法**：JCTools（`MpscArrayQueue` 等）、Netty（`PoolThreadCache` 相关计数）、Kafka 的部分内部结构都在用。识别特征是「一堆 `pXX` 字段 + 多层无意义超类」。
2. **判断是否需要填充的两个条件**：① 字段被多线程高频写；② 该类的实例数是常数级。缺一不可。
3. **验证工具链**：JOL 看布局，`perf c2c`（Linux）定位真实的伪共享热点，JMH 做前后对比。**不要靠推理判断填充有没有生效**。
4. **类库作者的约束意识**：不能要求使用方改 JVM 参数、不能依赖内部 API——这条原则同时解释了 Disruptor 不用 `@Contended`、4.0 清退 `Unsafe`、以及为什么它至今零第三方依赖。
5. **跟着 commit 读设计**：`bd5d7d8` 这种带外链的 commit message 是最高质量的设计文档。遇到看不懂的代码，`git log -p --follow <file>` 往往比任何博客都直接。

> **面试锚点**
> - 什么是伪共享？为什么它会让「无关变量」互相拖累？
> - Disruptor 为什么把填充写成 `LhsPadding → Value → RhsPadding` 三层继承，而不是写在一个类里？
> - 为什么两侧各填 56 字节，不是 64？
> - 4.0 把填充从 `long` 改成 `byte`，起因是什么？
> - 既然 JDK 有 `@Contended`，Disruptor 为什么不用？
> - 什么情况下**不该**加填充？

## Related

- [环形队列与序号栅栏](/notes/source/java/base/disruptor/ring-buffer/)：`BUFFER_PAD` 在数组定位中的作用
- [等待策略与内存屏障](/notes/source/java/base/disruptor/wait-strategy/)：同一个 `Sequence` 上的另一半故事——可见性
- [整体架构](/notes/source/java/base/disruptor/architecture/)
- [Disruptor 总览](/notes/source/java/base/disruptor/)
