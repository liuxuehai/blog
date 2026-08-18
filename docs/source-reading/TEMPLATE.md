# 源码解析知识库 · 写作模板与规范

> 配套：[PLAN.md](./PLAN.md)（总计划）· [PROGRESS.md](./PROGRESS.md)（进度台账）
> 本文是**写作时逐条对照的操作手册**，不是理论说明。

---

## 一、通用规则

### 1.1 语言与风格

- 中文正文，术语首次出现给英文原名：`控制反转（IoC, Inversion of Control）`。
- 类名 / 方法名 / 文件路径 / 配置项一律用反引号：`AbstractApplicationContext#refresh()`。
- **不贴大段源码**。单个代码块 ≤ 25 行；超过就改成「删减版 + 省略号 + 说明」，或换成伪代码 / 流程图。
- 不用「我们」「大家」「众所周知」「显而易见」这类填充语。
- 表格优先于长段落：对照、参数、状态、取舍一律上表。

### 1.2 源码坐标写法（D1）

```markdown
`AbstractApplicationContext#refresh()` — `spring-context/src/main/java/org/springframework/context/support/AbstractApplicationContext.java:585`
```

- 路径从**仓库根**算起，不写 `E:\source\...` 绝对路径。
- 版本只在册的 `index.md` 里声明一次，其余页不重复。
- 每篇 **≥ 8 处**坐标。写完数一遍。

### 1.3 图（D2）

统一用 ` ```text ` 围栏的 ASCII 图，四种类型任选：

**时序**
```text
Client        Acceptor       EventLoop       Handler
  │  connect     │               │              │
  ├─────────────►│               │              │
  │              │ register()    │              │
  │              ├──────────────►│              │
  │              │               │ channelRead  │
  │              │               ├─────────────►│
```

**状态机**
```text
CLOSED ──满足熔断条件──► OPEN ──时长到期──► HALF-OPEN
   ▲                                          │
   └──────────── 探测成功 ────────────────────┘
```

**数据结构**
```text
PoolChunk (16MB)
 └─ 完全二叉树 memoryMap[]，depth 0..11
     └─ PoolSubpage (8KB) ─► bitmap[] 标记 elemSize 槽位
```

**调用链**
```text
DispatcherServlet#doDispatch
  └─► HandlerMapping#getHandler
       └─► HandlerAdapter#handle
            └─► @Controller 方法
```

架构篇 ≥ 2 张，其余每篇 ≥ 1 张。

### 1.4 「为什么这么设计」（D3）

固定三段式：

```markdown
### 为什么用三级缓存而不是两级

**替代方案**：只用二级缓存（成品 + 半成品）。
**为什么不行**：AOP 场景下，代理对象必须在**被注入时**创建，二级缓存存的是原始对象，
注入进去的就是未代理对象，后续 `postProcessAfterInitialization` 再生成代理会导致
容器里和已注入处不是同一个对象。
**证据**：`DefaultSingletonBeanRegistry#getSingleton` 的 `singletonFactories`
（三级）持有的是 `ObjectFactory`，调用时机由 `getEarlyBeanReference` 决定 —— 见
`AbstractAutoProxyCreator#getEarlyBeanReference:230`。
```

能找到 commit / issue 佐证的，直接引：

```markdown
> 该改动来自 commit `a1b2c3d`（2019-03）：「Avoid eager proxy creation for
> circular references」，对应 issue #22462。
```

### 1.5 边界与坑（D4）

每篇必须有：

```markdown
## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| 构造器循环依赖 | 启动直接抛 `BeanCurrentlyInCreationException` | 三级缓存只能解决 setter 注入，构造器注入时对象还没实例化 | 改 setter 注入 / `@Lazy` / 重新划分职责 |
```

### 1.6 面试锚点（D6）

每篇结尾：

```markdown
> **面试锚点**
> - 三级缓存分别存什么？为什么不能砍成两级？
> - 构造器循环依赖为什么解决不了？
> - `@Async` 修饰的 Bean 出现循环依赖为什么会失败？
```

3~5 条，与 `interview.md` 对应条目呼应。

### 1.7 Related 区块

每篇结尾（面试锚点之后）：

```markdown
## Related

- [Bean 生命周期](/notes/source/java/spring/spring-framework/bean-lifecycle/)：后置处理器的完整插入点
- [AOP 代理创建](/notes/source/java/spring/spring-framework/aop-proxy/)：代理对象何时生成
- [Java 微服务架构治理实践](/notes/backend/java-microservice-architecture-governance/)：站内已有笔记
```

**链接必须以 `/` 结尾**且指向真实页面，否则 `pnpm run check:links` 失败。

---

## 二、`index.md` 模板

```markdown
---
title: Netty
description: Netty 源码解析总览：Reactor 线程模型、Pipeline、ByteBuf 内存池、时间轮与零拷贝。
category: Backend
tags:
  - Source Reading
  - Netty
  - NIO
order: 1
updatedDate: 2026-08-14
difficulty: advanced
status: stable
lastReviewed: 2026-08-14
draft: false
sidebar:
  order: 1
---

一句话定位 + 它在生态里的位置（1~3 句）。

<!-- more -->

## 版本快照

| 项 | 值 |
| --- | --- |
| 仓库 | `netty/netty` |
| 本地路径 | `E:\source\java\base\netty` |
| 分支 | `4.2` |
| Commit | `70040aaca`（2026-08-13） |
| 最近 tag | `netty-4.2.17.Final` |

> 本册所有 `文件:行号` 坐标均基于上述 commit，上游演进后行号可能漂移。

## 它解决什么问题

- 问题 1：原生 NIO 的 …（说清痛点，不是说清功能）
- 问题 2：…

## 模块地图

| 模块 | 职责 | 关键包 |
| --- | --- | --- |
| `transport` | Channel 抽象与事件循环 | `io.netty.channel` |
| `buffer` | ByteBuf 与内存池 | `io.netty.buffer` |

## 读码入口顺序

1. `NioEventLoopGroup` 构造 → 线程数与 `EventExecutorChooser`
2. `ServerBootstrap#bind` → …
3. …

## 本册目录

- [整体架构](/notes/source/java/base/netty/architecture/)：分层、组件关系、启动与请求两条主流程
- [Reactor 线程模型](/notes/source/java/base/netty/reactor-threading/)：…
- [面试专题](/notes/source/java/base/netty/interview/)：…

## 横向对照

| 对象 | 对照点 |
| --- | --- |
| Redis `ae` | 同为事件循环，单线程 vs 多 EventLoop |
| Tomcat NIO Endpoint | 同为 Java NIO 封装，抽象层次差异 |
```

---

## 三、`architecture.md` 模板

```markdown
---
title: 整体架构
description: …
category: Backend
tags: [Source Reading, Netty, Architecture]
order: 1
…
sidebar:
  order: 1
---

导语 1~3 句。

<!-- more -->

## 分层

（图 1：分层结构 ASCII 图）

| 层 | 职责 | 核心抽象 | 关键类 |
| --- | --- | --- | --- |

## 核心抽象

每个抽象一小节：**是什么 → 为什么需要 → 谁实现它 → 源码坐标**。

## 主流程一：启动

（图 2：启动时序）

逐步说明，每步给源码坐标。

## 主流程二：请求处理

（图 3：请求时序）

## 扩展点全景

| 扩展点 | 接口 | 触发时机 | 典型用途 |
| --- | --- | --- | --- |

## 边界与踩坑

## 可迁移知识

（D5：这套架构手法在别处怎么用）

> **面试锚点**
> - …

## Related
```

---

## 四、深挖篇模板

```markdown
---
title: ByteBuf 内存池
description: Arena / Chunk / Subpage 三级结构、PoolThreadCache 线程本地缓存与内存泄漏检测。
…
---

导语：这个机制解决什么问题（1~3 句）。

<!-- more -->

## 问题背景

不引入这个机制会怎样？（说清代价：GC 压力 / 吞吐 / 正确性）

## 设计概览

（图：数据结构 or 调用链）

## 实现拆解

### 1. <子机制>

- 入口：`PooledByteBufAllocator#newDirectBuffer` — `buffer/.../PooledByteBufAllocator.java:378`
- 关键逻辑：…
- 数据结构：…

### 2. <子机制>

…

## 关键取舍

### 为什么 …而不是…

**替代方案** / **为什么不行** / **证据**（三段式，见 §1.4）

## 参数与调优

| 参数 | 默认值 | 含义 | 什么时候要改 |
| --- | --- | --- | --- |

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |

## 可迁移知识

（这套算法/模式脱离本框架怎么用）

> **面试锚点**
> - …

## Related
```

---

## 五、`interview.md` 模板

### 5.1 结构

```markdown
---
title: 面试专题
description: Netty 高频面试题、高难追问与源码级加分回答。
tags: [Source Reading, Netty, Interview]
order: 9
sidebar:
  order: 9
---

面试考的不是背概念，是「你是否真的进去读过、踩过、做过取舍」。

<!-- more -->

## 高频题

### Netty 的线程模型是什么？

**30 秒版**：主从 Reactor 多线程。BossGroup 只负责 accept，把连接注册到
WorkerGroup 的某个 EventLoop；一个 EventLoop 绑定一个线程，管多个 Channel，
Channel 生命周期内只被这一个线程处理，因此 Handler 里无需加锁。

**展开**：…（3~6 句，带 1~2 个源码坐标）

**加分项**：`EventExecutorChooserFactory` 会在线程数是 2 的幂时用
`PowerOfTwoEventExecutorChooser`（位运算取模），否则用取余版本 —— 见
`MultithreadEventExecutorGroup:...`。这类细节能直接证明你读过源码。

**常见错答**：说成「Netty 是多线程处理同一个 Channel」——恰恰相反，
单 Channel 单线程正是它免锁的前提。

---

## 高难追问

### 既然 EventLoop 单线程，为什么还需要 `ChannelHandlerContext#executor()`？

（同样四段：30 秒版 / 展开 / 加分项 / 常见错答）

---

## 场景题

### 线上出现堆外内存持续增长，怎么排查到 Netty？

**排查路径**：…
**根因候选**：…
**证据链**：…

---

## 反向问面试官

- 你们的 Netty 版本停在 4.1 还是 4.2？为什么？
- 业务 Handler 里有阻塞调用吗？怎么隔离的？

## Related
```

### 5.2 数量要求

| 类别 | 条数 |
| --- | --- |
| 高频题 | 6~10 |
| 高难追问 | 4~8 |
| 场景题 | 2~4 |
| 反向问面试官 | 2~3 |

### 5.3 四段式回答（每题必须齐）

| 段 | 作用 | 长度 |
| --- | --- | --- |
| **30 秒版** | 面试现场的口头答案，能独立成立 | 2~4 句 |
| **展开** | 追问时的第二层，带源码坐标 | 3~8 句 |
| **加分项** | 只有读过源码才知道的细节 | 1~3 句 |
| **常见错答** | 明确指出错在哪，避免自己踩 | 1~2 句 |

---

## 六、发布前自查清单

写完一册，逐条打勾：

- [ ] `index.md` 有版本快照表（分支 + commit + 日期 + tag）
- [ ] `index.md` 的「本册目录」列全了所有子页，链接可达
- [ ] 每篇 ≥ 8 处 `文件:行号` 源码坐标（D1）
- [ ] 每篇 ≥ 1 张图，`architecture.md` ≥ 2 张（D2）
- [ ] 每篇有「为什么这么设计」三段式 ≥ 1 处（D3）
- [ ] 每篇有「边界与踩坑」小节（D4）
- [ ] 每篇有「可迁移知识」小节（D5）
- [ ] 每篇结尾有 3~5 条面试锚点（D6）
- [ ] 每篇有 `## Related`，链接均以 `/` 结尾且真实存在
- [ ] frontmatter `category` ∈ 9 个 `NOTE_CATEGORIES`
- [ ] `order` 与 `sidebar.order` 一致，册内 index=`N` / architecture=`N1` / 深挖=`N2..N7` / interview=`N9`（`N` = 该册在父目录中的序号）
- [ ] `pnpm run build` 通过
- [ ] `pnpm run check:links` 通过
- [ ] [PROGRESS.md](./PROGRESS.md) 对应行已更新为 ✅ 并填篇数与日期
