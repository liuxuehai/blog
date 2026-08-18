# 源码解析知识库 · 总计划

> 建立日期：2026-08-14
> 源码位置：`E:\source`（48 个已克隆仓库，只读）
> 文档产出：`E:\code\blog\src\content\docs\notes\source\**`（发布到站点）
> 计划与台账：`E:\code\blog\docs\source-reading\`（不发布）
> 配套文件：[TEMPLATE.md](./TEMPLATE.md)（写作规范）· [PROGRESS.md](./PROGRESS.md)（进度台账）

---

## 一、目标

对 `E:\source` 下 48 个开源仓库，逐个产出**分册式深度解析文档**，每册覆盖五个维度：

| 维度 | 要求 |
| --- | --- |
| **设计** | 这个项目要解决什么问题，为什么是这个解法，放弃了哪些解法 |
| **架构** | 分层、核心抽象、组件关系、主流程时序，能画出来 |
| **知识点** | 抽离出可迁移的通用知识（算法、协议、模式、并发原语） |
| **技术细节** | 精确到 `文件:行号` 与类/方法名的源码级证据，不停留在概念复述 |
| **面试** | 高频题 + 高难追问 + 分层回答话术 + 源码级加分项 |

**非目标**：不做 API 使用教程，不做「翻译 README」，不做「贴大段源码 + 逐行注释」。

---

## 二、现状盘点

### 2.1 仓库分布（48 个）

| 分类 | 数量 | 目录 |
| --- | --- | --- |
| Java | 32 | `java\spring`(7) `java\mq`(2) `java\rpc`(5) `java\storage`(7) `java\base`(9) `java\tools`(2) |
| Redis | 3 | `redis\` |
| Go | 5 | `go\` |
| Rust | 8 | `rust\` |

未克隆（`heavy` 层，本计划暂不覆盖）：`pulsar`、`elasticsearch`、`jdk`、`kubernetes`、`tikv`、`rust`。

版本快照见 [PROGRESS.md](./PROGRESS.md)（每册文档需在 `index.md` 中固化自己那一行的分支 + commit）。

### 2.2 博客站点约束（写作前必须知道的 5 条）

1. 正文集合由 `src/content.config.ts` 的 `docs` collection 加载，路径 `src/content/docs/**/*.md`。
2. frontmatter 走 Starlight `docsSchema` + 扩展字段，**`category` 只能取** `src/data/taxonomy.ts` 里 `NOTE_CATEGORIES` 的 9 个值之一（AI / Astro / Cloudflare / Frontend / Backend / Architecture / Database / DevOps / Linux）。取值越界会**直接构建失败**。
   - 本计划约定：Java / Go / Rust 仓库用 `Backend`，Redis 系（redis / valkey / hiredis）用 `Database`。**不新增分类**，避免连带改 `CATEGORY_LABELS`、`CATEGORY_SLUGS` 与 `/category/*` 路由。
3. 侧边栏由 `astro.config.mjs` 里 `autogenerate: { directory: 'notes', collapsed: true }` 自动生成，新目录**无需改配置**，落盘即生效。
4. `pnpm run check:links` 会扫描 `dist/` 里所有 `href/src`，**站内死链会让校验失败**。册内互链必须指向真实存在的页面。
5. 站点是中文优先（`defaultLocale: 'root'`，zh-CN）。本计划**只写中文版**，`src/content/docs/en/` 不同步（英文站现有 notes 也未全量同步，保持一致）。

---

## 三、产出位置与目录结构

### 3.1 路径公式

```
src/content/docs/notes/source/<category>/<group>/<repo>/<page>.md
                              └ 固定  └ java|redis|go|rust
                                        └ 仅 java 有：spring|mq|rpc|storage|base|tools
```

与 `E:\source\<category>\<group>\<repo>` **一一对应**，便于「看到文档就知道去哪读码」。

### 3.2 目录骨架

```
src/content/docs/notes/source/
├── index.md                        # 源码解析总入口（48 仓库索引 + 学习路线）
├── java/
│   ├── index.md
│   ├── spring/
│   │   ├── index.md
│   │   ├── spring-framework/       # 一册
│   │   │   ├── index.md
│   │   │   ├── architecture.md
│   │   │   ├── ioc-container.md
│   │   │   ├── bean-lifecycle.md
│   │   │   ├── aop-proxy.md
│   │   │   ├── transaction.md
│   │   │   └── interview.md
│   │   ├── spring-boot/  ...
│   ├── mq/  rpc/  storage/  base/  tools/
├── redis/
│   ├── index.md
│   ├── redis/  valkey/  hiredis/
├── go/     ├── index.md  ├── go-zero/  gin/  kratos/  etcd/  grpc-go/
└── rust/   ├── index.md  ├── tokio/  axum/  hyper/  actix-web/  serde/  clap/  sqlx/  ripgrep/
```

URL 形如 `/notes/source/java/spring/spring-framework/ioc-container/`。

### 3.3 侧边栏排序编号

Starlight 只在**同级兄弟之间**比较 `sidebar.order`，因此采用「局部小号」方案，不追求全局唯一：

| 层级 | order 取值 |
| --- | --- |
| `notes/source/index.md` | `70`（排在现有 react=60 之后） |
| 语言层 index | java=`1` · redis=`2` · go=`3` · rust=`4` |
| java 分组 index | spring=`1` · mq=`2` · rpc=`3` · storage=`4` · base=`5` · tools=`6` |
| 仓库册 index | 在其父目录内按**学习阶段先后**排 `N` = `1,2,3…` |
| 册内页面 | `N*10 + k`：`architecture`=`N1` · 深挖篇=`N2…N7` · 可选篇=`N8` · `interview`=`N9` |

沿用站内现有笔记的「父号×10+n」写法（sentinel `54` → 子页 `541-546`）。

**为什么不用 `index`=0 + 子页 `1,2,3`**：仓库册的 `index.md` 有双重身份——它既是该组内的首页，又决定这个**组在父目录中的位置**。若子页从 1 开始编号，第 2 个册（`index`=2）就会和自己的子页 `2` 打平，Starlight 只能退化为字母序，排序不可控。`N*10+k` 让两者永远不在同一量级。

示例（`java/base/` 下）：

| 页面 | order |
| --- | --- |
| `disruptor/index.md` | 1 |
| `disruptor/architecture.md` | 11 |
| `disruptor/ring-buffer.md` | 12 |
| `disruptor/interview.md` | 19 |
| `netty/index.md` | 2 |
| `netty/architecture.md` | 21 |

---

## 四、每册文档骨架

**每册 6~9 篇**，其中 3 篇固定、3~6 篇按仓库定制：

| # | 文件 | 必需 | 内容 |
| --- | --- | --- | --- |
| 0 | `index.md` | ✅ | 项目定位、**版本快照（分支+commit+tag）**、模块地图、它解决什么问题、读码入口顺序、本册目录、横向对照对象 |
| 1 | `architecture.md` | ✅ | 分层与核心抽象、组件关系图、**启动主流程 + 请求主流程两条时序**、扩展点全景 |
| 2~7 | 核心机制深挖 | ✅ 3~6 篇 | 每篇一个机制，按仓库定制（选题见第七节） |
| 8 | `performance.md` / `pitfalls.md` | ⬜ 可选 | 性能优化手法集合 / 生产踩坑与边界条件（内容不足 800 字就并入深挖篇） |
| 9 | `interview.md` | ✅ | 面试专题（格式见 [TEMPLATE.md](./TEMPLATE.md#面试篇结构)） |

**估算**：48 册 × 7.5 篇 ≈ **360 篇**。

---

## 五、深度标准（硬性验收）

以下 6 条**逐条对照**，任何一条不满足即视为该篇未完成。详细模板见 [TEMPLATE.md](./TEMPLATE.md)。

| # | 标准 | 反例（不合格） |
| --- | --- | --- |
| **D1** | **源码坐标**：每个论断必须能落到 `模块/路径/文件.java:行号` + 类名/方法名。每篇 ≥ 8 处坐标。 | 「Netty 用主从 Reactor 模型」——没说哪个类哪一行 |
| **D2** | **一张图起步**：每篇 ≥ 1 张 ASCII 图（时序 / 状态机 / 数据结构 / 调用链），架构篇 ≥ 2 张。 | 全篇纯文字段落 |
| **D3** | **为什么这么设计**：给出被放弃的替代方案 + 取舍理由，最好引用 commit / issue / 注释原文。 | 只描述「是什么」，不解释「为什么不是别的」 |
| **D4** | **边界与坑**：每篇有「边界条件 / 失效场景 / 生产踩坑」小节，写清触发条件与规避手段。 | 只讲 happy path |
| **D5** | **可迁移知识**：明确点出这套做法在别处怎么用（算法、协议、并发原语、设计模式）。 | 知识锁死在这个框架里，换个场景用不上 |
| **D6** | **面试锚点**：每篇末尾 3~5 条 `> 面试锚点：…`，与 `interview.md` 呼应。 | 深挖篇与面试篇完全脱节 |

**源码坐标的写法**（行号会随上游演进漂移，必须带版本）：

```markdown
`AbstractApplicationContext#refresh()` — `spring-core/.../AbstractApplicationContext.java:585`
（快照：`main` @ `c7712052ce`，2026-08-13）
```

> 行号只在 `index.md` 固化的那个 commit 下成立。册内不重复标注版本，统一在 `index.md` 的「版本快照」小节声明一次。

---

## 六、Frontmatter 规范

```yaml
---
title: IoC 容器启动                      # 简短，不带项目名（面包屑已有）
description: refresh() 十二步、BeanFactory 与 ApplicationContext 分工、循环依赖三级缓存。
category: Backend                        # 只能取 NOTE_CATEGORIES 9 值之一
tags:
  - Source Reading                       # 固定，本知识库统一标签
  - Spring Framework                     # 仓库名
  - IoC                                  # 2~4 个知识点标签
order: 2                                 # 与 sidebar.order 保持一致（沿用现有笔记写法）
updatedDate: 2026-08-14
difficulty: advanced                     # beginner | intermediate | advanced
status: stable                           # learning | stable
lastReviewed: 2026-08-14
draft: false
sidebar:
  order: 2
---
```

正文首段写 1~3 句导语，随后紧跟 `<!-- more -->`（与站内现有笔记一致）。

---

## 七、五阶段排期与深挖选题

按 `E:\source\MANIFEST.md` 的学习路线组织，48 个仓库全覆盖。

### 阶段 1 · 打底（4 册）— 先读小的，建立方法论

| 序 | 仓库 | 路径 | 深挖选题（3~6 篇） |
| --- | --- | --- | --- |
| 1 | disruptor | `java/base/` | 环形队列与序号栅栏 · 伪共享与缓存行填充 · 等待策略与内存屏障 · 多生产者 CAS 抢序 |
| 2 | xxl-job | `java/rpc/` | 调度中心时间轮触发 · 执行器注册与路由策略 · 任务阻塞与失败重试 · 日志回捞与分片广播 |
| 3 | mybatis-3 | `java/storage/` | 配置解析与 Builder 链 · Mapper 动态代理 · SqlSession 与执行器三态 · 一二级缓存 · 插件拦截器链 · 结果集映射与延迟加载 |
| 4 | gin | `go/` | Radix 树路由匹配 · Context 复用与 sync.Pool · 中间件洋葱模型与 Abort · 参数绑定与校验 |

### 阶段 2 · 网络与事件循环内核（4 册）

| 序 | 仓库 | 路径 | 深挖选题 |
| --- | --- | --- | --- |
| 1 | netty | `java/base/` | 主从 Reactor 与 EventLoop · Pipeline 与 ChannelHandler 责任链 · ByteBuf 内存池（Arena/Chunk/PoolThreadCache） · 零拷贝与 CompositeByteBuf · 时间轮与 IdleStateHandler · 粘包拆包解码器 |
| 2 | redis | `redis/` | ae 事件循环与单线程模型 · 对象编码（SDS/listpack/quicklist/跳表/dict） · 渐进式 rehash · RDB 与 AOF 重写 · 主从复制与 PSYNC · 过期与内存淘汰 |
| 3 | valkey | `redis/` | 与 redis 的分叉点 · 多线程 IO 演进 · 对照阅读方法论（2~3 篇，短册） |
| 4 | hiredis | `redis/` | RESP 协议编解码 · 同步 API 与 reader 状态机 · 异步 API 与事件适配层（3 篇，短册） |

### 阶段 3 · Spring 全家桶（8 册）

| 序 | 仓库 | 路径 | 深挖选题 |
| --- | --- | --- | --- |
| 1 | spring-framework | `java/spring/` | IoC 容器 `refresh()` 十二步 · Bean 生命周期与后置处理器 · 循环依赖三级缓存 · AOP 代理创建与织入 · 事务传播与 `TransactionInterceptor` · 资源/类型转换/SpEL 基础设施 |
| 2 | spring-boot | `java/spring/` | 启动流程与 `SpringApplication.run()` · 自动装配与 `AutoConfiguration.imports` · 条件注解求值 · 内嵌容器与 `WebServerFactory` · 配置绑定与 `Environment` · Actuator 端点 |
| 3 | tomcat | `java/base/` | Connector/Container 生命周期 · 类加载器隔离 · NIO Endpoint 与线程模型 · Servlet 请求处理链 |
| 4 | spring-security | `java/spring/` | 过滤器链与 `SecurityFilterChain` · 认证流程 `AuthenticationManager` · 授权与 `AuthorizationManager` · SecurityContext 存储与传播 |
| 5 | spring-cloud-gateway | `java/spring/` | Reactor 与 WebFlux 基础 · Route 匹配与 Predicate · GatewayFilter 链与全局过滤器 · 限流与熔断集成 |
| 6 | spring-cloud-openfeign | `java/spring/` | 接口扫描与 `FeignClientFactoryBean` · 动态代理到 HTTP 的完整链路 · 契约解析与编解码器 · 负载均衡与重试 |
| 7 | spring-data-redis | `java/spring/` | 连接抽象与工厂 · `RedisTemplate` 模板模式 · 序列化器体系 · 发布订阅与 Stream |
| 8 | spring-cloud-alibaba | `java/spring/` | 如何接入 Spring 扩展点 · Nacos 配置/注册适配 · Sentinel 适配 · Seata 适配 |

### 阶段 4 · 中间件与分布式（15 册）

**4A 主线（6）**

| 序 | 仓库 | 深挖选题 |
| --- | --- | --- |
| 1 | rocketmq | CommitLog 顺序写与 mmap · ConsumeQueue/IndexFile 索引 · 消息拉取与长轮询 · 事务消息半消息回查 · 主从复制与 DLedger · 消费进度与重平衡 |
| 2 | dubbo | SPI 扩展机制（自实现 IoC/AOP） · 服务导出与引用 · 集群容错与负载均衡 · 协议编解码与 Exchange 层 · 服务治理（路由/标签/优雅停机） |
| 3 | nacos | 注册中心 Distro 协议 · 配置中心长轮询推送 · Raft（JRaft）与持久化实例 · 健康检查与心跳 |
| 4 | redisson | 分布式锁与看门狗续期 · Lua 原子化与命令编排 · RedLock 与红锁争议 · 分布式集合与限流器 |
| 5 | sentinel | 滑动窗口统计（LeapArray） · Slot 责任链 · 熔断状态机 · 自适应系统保护与集群流控 |
| 6 | seata | AT 模式反向 SQL 与全局锁 · TCC 空回滚/悬挂 · Saga 状态机 · TC/TM/RM 通信 |

**4B 存储与连接池（6）**

| 序 | 仓库 | 深挖选题 |
| --- | --- | --- |
| 1 | kafka | 分区日志与稀疏索引 · ISR 与副本同步 · 零拷贝与页缓存 · KRaft 取代 ZK · 消费者重平衡协议 |
| 2 | shardingsphere | SQL 解析（ANTLR） · 路由引擎 · 改写引擎 · 归并引擎 · 分布式事务与治理 |
| 3 | druid | 连接池核心与 `DruidDataSource` · SQL Parser · Filter 责任链与监控 · WallFilter 防火墙 |
| 4 | hikaricp | `ConcurrentBag` 无锁借还 · `FastList` 与字节码裁剪 · 连接保活与泄漏检测 · 与 Druid 的取舍对照 |
| 5 | jedis | RESP 协议编解码 · 连接池（commons-pool2） · Cluster 槽位路由与重定向 |
| 6 | mybatis-plus | 如何优雅扩展别人的框架 · 条件构造器 · 分页与租户插件 · 代码生成器 |

**4C 协调与诊断（3）**

| 序 | 仓库 | 深挖选题 |
| --- | --- | --- |
| 1 | zookeeper | ZAB 协议与选主 · 会话管理与超时 · Watcher 一次性通知 · 数据模型与事务日志/快照 |
| 2 | arthas | Instrumentation 与 Agent 挂载 · 字节码增强（`watch`/`trace` 实现） · 命令管道与终端协议 |
| 3 | skywalking | Agent 无侵入插桩 · 上下文传播与 TraceId · OAP 数据模型与流式聚合 |

### 阶段 5 · 基础库与多语言横向（17 册）

**5A Java 基础库（5）**

| 序 | 仓库 | 深挖选题 |
| --- | --- | --- |
| 1 | caffeine | W-TinyLFU 与 Count-Min Sketch · 环形缓冲与写后队列 · 过期与驱逐时间轮 · 异步加载 |
| 2 | guava | 不可变集合设计 · `Cache` 与 Caffeine 对照 · `EventBus` · `RateLimiter`（SmoothBursty/WarmingUp） |
| 3 | jackson-databind | 反射与类型擦除的工业级处理（`JavaType`） · 序列化/反序列化器解析与缓存 · 注解体系与 Module |
| 4 | fastjson2 | 字节码生成加速 · JSONReader/Writer 分派 · 与 Jackson 的性能取舍 |
| 5 | hutool | API 设计手感（3 篇短册：模块划分 · 命名与重载策略 · 反面教材与边界） |

**5B Go（4）**

| 序 | 仓库 | 深挖选题 |
| --- | --- | --- |
| 1 | go-zero | 自适应熔断（Google SRE 算法） · 自适应限流与滑动窗口 · `syncx` 并发原语（SingleFlight/SharedCalls） · 缓存一致性方案（缓存击穿/空值/延迟删除） · zrpc 服务治理 · goctl 代码生成 |
| 2 | etcd | Raft 工业级实现 · WAL 与快照 · MVCC 与 backend · Watch 机制与事件通知 · Lease 与选主 |
| 3 | kratos | 分层与依赖注入（wire） · 中间件与传输抽象 · 与 go-zero 的设计取舍对照 |
| 4 | grpc-go | HTTP/2 多路复用与流控 · 拦截器链 · 名字解析与负载均衡 · 连接管理与重试 |

**5C Rust（8）**

| 序 | 仓库 | 深挖选题 |
| --- | --- | --- |
| 1 | tokio | Future/Waker 执行原理 · work-stealing 调度器 · IO driver 与 reactor · 定时器时间轮 · 同步原语与 `select!` |
| 2 | axum | Tower `Service` 抽象 · 类型级 `Extractor` 设计 · `Handler` trait 与泛型分派 · 路由与状态共享 |
| 3 | hyper | HTTP/1 状态机 · HTTP/2 与 h2 · 连接池与 `Body` 抽象 |
| 4 | actix-web | Actor 模型 · 与 axum 的设计对照 · 提取器与中间件 |
| 5 | serde | 过程宏展开 · 数据模型与 `Serializer`/`Deserializer` · 零成本抽象验证 |
| 6 | clap | derive 宏工程化 · 解析状态机 · 补全与帮助生成 |
| 7 | sqlx | 编译期 SQL 校验实现 · 异步驱动与连接池 · 类型映射 |
| 8 | ripgrep | 工程组织与 crate 划分 · 正则引擎选择与优化 · 并行遍历与 IO 策略 |

### 排期估算

| 阶段 | 册数 | 预估会话数 |
| --- | --- | --- |
| 1 打底 | 4 | 3~4 |
| 2 网络内核 | 4 | 5~6（netty / redis 各 1.5~2） |
| 3 Spring | 8 | 9~11（spring-framework 约 2） |
| 4 中间件 | 15 | 14~17 |
| 5 基础库与多语言 | 17 | 14~17 |
| **合计** | **48** | **45~55** |

节奏约定：**大仓库（netty / redis / spring-framework / rocketmq / dubbo / kafka / etcd / tokio）每会话 1 册**；小仓库（hiredis / valkey / hutool / clap / gin 等）可每会话 2 册。

---

## 八、单会话 SOP

每个后续会话按下面 7 步走，不跳步。

1. **认领**：读 [PROGRESS.md](./PROGRESS.md)，取第一个 `⬜ 待写` 的仓库，状态改 `🔄 进行中`。
2. **定版**：`git -C E:\source\<path> log -1 --format='%h %ad'` + `rev-parse --abbrev-ref HEAD`，写进该册 `index.md` 的版本快照。
3. **摸地图**：列模块目录、找入口（`main()` / `META-INF/services` / `spring.factories` / `*Bootstrap` / `lib.rs`）、读 `src/test/**` 找真实用法。
4. **定目录**：按第七节选题定 6~9 篇的最终清单，写进 PROGRESS.md 该行备注。
5. **逐篇写**：每篇写完立刻对照第五节 D1~D6 六条自查，不合格当场补。
6. **互链**：`index.md` 列出全部子页链接；每篇底部 `## Related` 指向册内其他页 + 站内已有相关笔记（如 sentinel 册链到 `/notes/backend/sentinel/`）。
7. **验收**：
   ```powershell
   cd E:\code\blog
   pnpm run build
   pnpm run check:links
   ```
   通过后把 PROGRESS.md 该行改 `✅ 已完成`，填篇数与日期。

> **跨会话交接**：会话结束前必须更新 PROGRESS.md。下个会话只读 PLAN.md + TEMPLATE.md + PROGRESS.md 三个文件即可无损接手，不依赖对话历史。

---

## 九、质量校验

| 检查 | 命令 / 方式 | 失败后果 |
| --- | --- | --- |
| frontmatter schema | `pnpm run build` | `category` 越界、日期格式错 → 构建失败 |
| 站内死链 | `pnpm run build && pnpm run check:links` | 册内互链写错 → 校验失败 |
| 侧边栏 | 本地 `pnpm run dev` 看 Knowledge 分组 | 层级或排序错乱 |
| 深度自查 | 人工对照 D1~D6 | 文档变成「概念复述」 |

---

## 十、约定与风险

| 项 | 约定 |
| --- | --- |
| **上游只读** | 绝不修改 `E:\source` 下任何文件；需要验证想法在 `E:\source\lab\` 建独立工程 |
| **行号漂移** | 上游持续演进，行号会失效。每册 `index.md` 固化 commit；后续若上游大改，在册内加「版本差异」小节而非全量重写 |
| **不新增站点分类** | 沿用现有 9 个 `NOTE_CATEGORIES`，不改 `taxonomy.ts`，避免连带影响 `/category/*` 路由与英文站 |
| **英文站不同步** | 只写中文，`src/content/docs/en/` 保持现状 |
| **heavy 层不覆盖** | pulsar / elasticsearch / jdk / kubernetes / tikv / rust 未克隆，本计划不含；后续需要再单独立项 |
| **提交粒度** | 一册一次提交，commit message：`docs(source): add <repo> source-reading notes` |
