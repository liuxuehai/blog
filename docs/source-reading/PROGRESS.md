# 源码解析知识库 · 进度台账

> 最后更新：2026-08-24
> 统计口径：已落盘并通过构建的仓库计入「已完成」；每册页面数量以仓库目录实际页面为准。

## 总进度

**已完成 48 / 48 册（100%）。**

**第二轮叙事优化已完成 48 / 48 册（100%）。** 全部 348 篇正文均已有针对本篇机制的“先给答案”，各册 `index.md` 均有“本册问题地图”，严格验收已达到 348 / 348。

| 阶段 | 内容 | 状态 |
| --- | --- | --- |
| 1 · 打底 | disruptor · xxl-job · mybatis-3 · gin | 4/4 |
| 2 · 网络与事件循环内核 | netty · redis · valkey · hiredis | 4/4 |
| 3 · Spring 全家桶 | spring-framework · spring-boot · tomcat · spring-security · spring-cloud-gateway · spring-cloud-openfeign · spring-data-redis · spring-cloud-alibaba | 8/8 |
| 4 · 中间件与分布式 | rocketmq · dubbo · nacos · redisson · kafka · shardingsphere · druid · hikaricp · jedis · mybatis-plus · zookeeper · sentinel · seata · arthas · skywalking | 15/15 |
| 5 · 基础库与多语言 | caffeine · guava · go-zero · etcd · kratos · grpc-go · tokio · axum 等 17 个 | 17/17 |

## 分册状态

### 阶段 1 · 打底

| 状态 | 仓库 | 源码路径 | 篇数 | 完成日期 | 备注 |
| --- | --- | --- | ---: | --- | --- |
| ✅ 已完成 | disruptor | `java/base/disruptor` | 7 | 2026-08-14 | 环形队列、序号栅栏、伪共享、等待策略、多生产者 |
| ✅ 已完成 | xxl-job | `java/rpc/xxl-job` | 7 | 2026-08-14 | 时间轮、执行器路由、阻塞策略、回调与分片 |
| ✅ 已完成 | mybatis-3 | `java/storage/mybatis-3` | 8 | 2026-08-14 | 配置、Mapper 代理、执行器、缓存、插件与结果映射 |
| ✅ 已完成 | gin | `go/gin` | 7 | 2026-08-14 | Radix 树、Context 池化、中间件、绑定与校验 |

### 阶段 2 · 网络与事件循环内核

| 状态 | 仓库 | 源码路径 | 篇数 | 完成日期 | 备注 |
| --- | --- | --- | ---: | --- | --- |
| ✅ 已完成 | netty | `java/base/netty` | 9 | 2026-08-14 | Reactor、Pipeline、ByteBuf、零拷贝、时间轮、拆包 |
| ✅ 已完成 | redis | `redis/redis` | 9 | 2026-08-15 | 事件循环、对象编码、rehash、持久化、复制、淘汰 |
| ✅ 已完成 | valkey | `redis/valkey` | 6 | 2026-08-15 | 分叉对照、多线程 IO、BIO 与后台任务 |
| ✅ 已完成 | hiredis | `redis/hiredis` | 7 | 2026-08-15 | RESP、reader、同步命令、异步回调与事件适配 |

### 阶段 3 · Spring 全家桶

| 状态 | 仓库 | 源码路径 | 篇数 | 完成日期 | 备注 |
| --- | --- | --- | ---: | --- | --- |
| ✅ 已完成 | spring-framework | `java/spring/spring-framework` | 9 | 2026-08-14 | IoC、生命周期、循环依赖、AOP、事务与测试上下文 |
| ✅ 已完成 | spring-boot | `java/spring/spring-boot` | 9 | 2026-08-14 | 启动、自动装配、条件、配置绑定、容器与 Actuator |
| ✅ 已完成 | tomcat | `java/base/tomcat` | 9 | 2026-08-14 | 生命周期、Connector、Container、NIO、Mapper、Valve |
| ✅ 已完成 | spring-security | `java/spring/spring-security` | 7 | 2026-08-14 | 过滤器链、认证、授权与 SecurityContext |
| ✅ 已完成 | spring-cloud-gateway | `java/spring/spring-cloud-gateway` | 7 | 2026-08-14 | WebFlux、路由、过滤器、限流与熔断 |
| ✅ 已完成 | spring-cloud-openfeign | `java/spring/spring-cloud-openfeign` | 7 | 2026-08-14 | 接口扫描、代理、契约编解码、负载均衡与熔断 |
| ✅ 已完成 | spring-data-redis | `java/spring/spring-data-redis` | 9 | 2026-08-14 | 连接工厂、Template、序列化、Pub/Sub、Stream 与事务 |
| ✅ 已完成 | spring-cloud-alibaba | `java/spring/spring-cloud-alibaba` | 7 | 2026-08-14 | 自动装配、Nacos、Sentinel 与 RocketMQ 适配 |

### 阶段 4 · 中间件与分布式

| 状态 | 仓库 | 源码路径 | 篇数 | 完成日期 | 备注 |
| --- | --- | --- | ---: | --- | --- |
| ✅ 已完成 | rocketmq | `java/mq/rocketmq` | 8 | 2026-08-14 | CommitLog、索引、长轮询、事务消息与 DLedger |
| ✅ 已完成 | dubbo | `java/rpc/dubbo` | 7 | 2026-08-14 | SPI、导出引用、集群容错、协议与治理 |
| ✅ 已完成 | nacos | `java/rpc/nacos` | 7 | 2026-08-14 | Distro、JRaft、长轮询、注册发现与健康检查 |
| ✅ 已完成 | redisson | `java/storage/redisson` | 8 | 2026-08-14 | 异步命令、分布式锁、watchdog、Lua、集合与限流 |
| ✅ 已完成 | sentinel | `java/rpc/sentinel` | 7 | 2026-08-14 | Slot 链、滑动窗口、流控、熔断与集群 Token |
| ✅ 已完成 | seata | `java/rpc/seata` | 7 | 2026-08-14 | TM/TC/RM、AT、TCC、Saga、XA 与会话持久化 |
| ✅ 已完成 | kafka | `java/mq/kafka` | 9 | 2026-08-14 | 分区日志、ISR、页缓存、KRaft 与重平衡 |
| ✅ 已完成 | shardingsphere | `java/storage/shardingsphere` | 10 | 2026-08-14 | 解析、路由、改写、归并、事务与治理 |
| ✅ 已完成 | druid | `java/storage/druid` | 10 | 2026-08-14 | 连接池、Parser、Filter、Wall 与监控 |
| ✅ 已完成 | hikaricp | `java/storage/hikaricp` | 8 | 2026-08-14 | ConcurrentBag、连接借还、重置、检测与指标 |
| ✅ 已完成 | jedis | `java/storage/jedis` | 8 | 2026-08-14 | RESP、连接池、Pipeline、Cluster 与客户端缓存 |
| ✅ 已完成 | mybatis-plus | `java/storage/mybatis-plus` | 8 | 2026-08-14 | 元数据、Mapper 注入、Wrapper、插件、分页与集成 |
| ✅ 已完成 | zookeeper | `java/base/zookeeper` | 7 | 2026-08-14 | ZAB、会话、Watcher、数据模型与日志快照 |
| ✅ 已完成 | arthas | `java/tools/arthas` | 7 | 2026-08-14 | Instrumentation、字节码增强、命令管道与终端协议 |
| ✅ 已完成 | skywalking | `java/tools/skywalking` | 7 | 2026-08-14 | Agent 插桩、上下文传播、TraceId、OAP 聚合 |

### 阶段 5 · 基础库与多语言

| 状态 | 仓库 | 源码路径 | 篇数 | 完成日期 | 备注 |
| --- | --- | --- | ---: | --- | --- |
| ✅ 已完成 | caffeine | `java/base/caffeine` | 8 | 2026-08-16 | W-TinyLFU、写后队列、过期时间轮、并发读写、异步加载 |
| ✅ 已完成 | guava | `java/base/guava` | 6 | 2026-08-16 | 不可变集合、Cache 与 Caffeine 对照、EventBus、RateLimiter、架构与面试专题 |
| ✅ 已完成 | jackson-databind | `java/base/jackson-databind` | 8 | 2026-08-16 | JavaType、序列化器缓存、反序列化、属性发现、注解与 Module |
| ✅ 已完成 | fastjson2 | `java/base/fastjson2` | 8 | 2026-08-16 | JSONReader/Writer 分派、ObjectReader/Writer、字节码生成与类型安全 |
| ✅ 已完成 | hutool | `java/base/hutool` | 8 | 2026-08-16 | 模块划分、命名重载、转换配置、HTTP/JSON、反射与扩展边界 |
| ✅ 已完成 | go-zero | `go/go-zero` | 9 | 2026-08-16 | 熔断、限流、syncx、缓存、zrpc 与 goctl |
| ✅ 已完成 | etcd | `go/etcd` | 9 | 2026-08-16 | Raft、WAL、MVCC、Watch 与 Lease |
| ✅ 已完成 | kratos | `go/kratos` | 9 | 2026-08-16 | 分层、App 生命周期、中间件、注册发现与传输抽象 |
| ✅ 已完成 | grpc-go | `go/grpc-go` | 9 | 2026-08-17 | ClientConn、HTTP/2、流控、拦截器、解析、负载均衡与连接管理 |
| ✅ 已完成 | tokio | `rust/tokio` | 9 | 2026-08-17 | Runtime、Future/Waker、工作窃取、IO readiness、时间轮、同步原语与取消 |
| ✅ 已完成 | axum | `rust/axum` | 8 | 2026-08-17 | Tower Service、Extractor、Handler、路由、状态与中间件 |
| ✅ 已完成 | hyper | `rust/hyper` | 8 | 2026-08-17 | HTTP/1 状态机、HTTP/2、Body、单连接与运行时抽象 |
| ✅ 已完成 | actix-web | `rust/actix-web` | 9 | 2026-08-17 | Worker、ServiceFactory、提取器、中间件与 WebSocket Actor |
| ✅ 已完成 | serde | `rust/serde` | 8 | 2026-08-17 | 数据模型、过程宏、Serializer/Deserializer 与零成本抽象 |
| ✅ 已完成 | clap | `rust/clap` | 8 | 2026-08-18 | Command/Arg、解析状态机、ValueParser/ArgMatches、derive、帮助、错误与补全 |
| ✅ 已完成 | sqlx | `rust/sqlx` | 8 | 2026-08-18 | 编译期 SQL 校验、异步执行器、连接池、driver、类型映射与迁移 |
| ✅ 已完成 | ripgrep | `rust/ripgrep` | 8 | 2026-08-18 | crate 分层、ignore 遍历、literal prefilter、Searcher、Printer 与并行搜索 |

## 第二轮当前状态

- 当前完成：48/48 册全篇完成，348/348 篇正文已有“先给答案”，剩余 0 篇。
- 本批补齐此前剩余的 192 篇，覆盖 Go、Java 基础库/RPC/存储/工具与 Rust 全部未完成页面；MQ 与 Redis 也包含在最终严格验收内。
- 48 册总览均有“本册问题地图”；正文入口按核心矛盾、正常状态变化和主要失效边界组织，并同步 `updatedDate` 与 `lastReviewed`。
- `pnpm run check:source-reading` 用于日常结构与统计检查，`pnpm run check:source-reading:strict` 作为第二轮最终验收；当前两种口径均通过。
- 本轮未新增仓库或页面，已把原有“源码坐标 + 机制说明”提升为“问题 -> 结论 -> 状态变化 -> 证据 -> 边界”的阅读路径。
- 全站构建与内部链接结果以本次最终校验为准。

### 阶段快照

- 2026-08-24 首次复核口径：分册最低线 48/48，全篇完成 5/48，正文覆盖 134/348，剩余 214 篇。
- 2026-08-24 补齐 Redis、Valkey、hiredis、RocketMQ、Kafka 原先缺少“先给答案”的 20 篇，确认这 5 册共 35 篇正文全篇完成。
- 2026-08-24 第二批补齐 22 篇后，全篇完成提升到 18/48，正文覆盖提升到 156/348，剩余 192 篇。
- 2026-08-24 补齐剩余 192 篇后，第二轮达到 48/48 册、348/348 篇全篇完成，严格验收通过。
- 同期修复 Nacos 总览模块地图中 `naming` 行的 Markdown 表格断行。

## 第一轮历史记录

- 完成 SQLx 源码阅读册，共 8 篇：整体架构、编译期 query 宏、Executor/Pool、数据库驱动、类型映射、Transaction/Migration、面试专题及总览。
- SQLx 快照固定为 `main` @ `1d674f51`（2026-07-03），workspace version 为 `0.9.0`，MSRV 为 Rust `1.94.0`。
- 完成 ripgrep 源码阅读册，共 8 篇：整体架构、CLI 流水线、ignore-aware 遍历、正则与 matcher、Searcher/Sink、Printer、面试专题及总览。
- ripgrep 快照固定为 `master` @ `3fce3b5b`（2026-08-04），版本为 `15.2.0`，MSRV 为 Rust `1.96`。
- Rust 分组完成 10/10 册，源码解析总进度达到 48/48。
- `pnpm run build` 已通过，共构建 981 个页面；SQLx 与 ripgrep 新增 16 个页面已通过定向内部链接检查。


- 完成 Clap 源码阅读册，共 8 篇：整体架构、Command/Arg 模型、解析状态机、ValueParser/ArgMatches、derive、帮助/错误/补全、面试专题及总览。
- Clap 快照固定为 `master` @ `5b81f101`（2026-08-12），clap / clap_builder 为 `4.6.6`，clap_derive 为 `4.6.4`，MSRV 为 Rust `1.85`。
- 更新 Rust 分组索引与源码解析总入口。
- `pnpm run build` 已通过，共构建 949 个页面；Clap 新增 8 个 HTML 页面已通过定向内部链接检查。`pnpm run check:links` 两次超过 120 秒未返回，需后续补跑全站检查。


- 完成 Axum 源码阅读册，共 8 篇：整体架构、Tower Service、Extractor、Handler、路由状态、中间件错误、面试专题及总览。
- Axum 快照固定为 `main` @ `151cd5c1`（2026-08-11），主 crate 为 `0.8.9`，对应 tag `axum-v0.8.9`，MSRV 为 Rust `1.80`。
- 完成 Hyper 源码阅读册，共 8 篇：整体架构、HTTP/1 状态机、HTTP/2、Body、客户端单连接、运行时 IO、面试专题及总览。
- Hyper 快照固定为 `master` @ `fca07bd3`（2026-08-12），版本/tag 为 `v1.11.0`，MSRV 为 Rust `1.63`。
- 完成 Actix Web 源码阅读册，共 9 篇：整体架构、HttpServer/Worker、ServiceFactory 路由、Extractor/Handler、中间件、WebSocket Actor、Axum 对照、面试专题及总览。
- Actix Web 快照固定为 `main` @ `1ab8d6ac`（2026-08-12），主 crate 为 `4.14.1`，对应 tag `web-v4.14.1`，MSRV 为 Rust `1.88`。
- 完成 Serde 源码阅读册，共 8 篇：整体架构、数据模型、Serializer、Deserializer/Visitor、derive、零成本抽象、面试专题及总览。
- Serde 快照固定为 `master` @ `747814f7`（2026-07-25），主 crate 与 derive 为 `1.0.229`。
- 更新 Rust 分组索引、源码解析总入口与进度台账。

- 完成 go-zero 源码阅读册，共 9 篇：整体架构、自适应熔断、限流与负载保护、syncx、缓存、zrpc、goctl、面试专题及总览。
- go-zero 快照固定为 `master` @ `ebe46e1c`（2026-08-13），最近 tag 为 `v1.10.3`。
- 更新 Go 分组索引与源码解析总入口。

- 完成 etcd 源码阅读册，共 9 篇：整体架构、Raft、WAL 与快照、MVCC、Watch、Lease、客户端、面试专题及总览。
- etcd 快照固定为 `main` @ `0836b69e`（2026-08-13），最近 tag 为 `v3.8.0-alpha.0`。
- 更新 Go 分组索引、源码解析总入口与进度台账。

- 完成 Kratos 源码阅读册，共 9 篇：整体架构、App 生命周期、HTTP/gRPC 传输、中间件、注册发现与负载选择、配置日志、错误 Metadata、面试专题及总览。
- Kratos 快照固定为 `main` @ `668db92c`（2026-06-26），最近 tag 为 `v3.0.0`。
- 更新 Go 分组索引、源码解析总入口与进度台账。

- 完成 grpc-go 源码阅读册，共 9 篇：整体架构、Server 生命周期、ClientConn、HTTP/2 transport、RPC stream 与重试、拦截器、resolver/balancer、状态与凭证、面试专题及总览。
- grpc-go 快照固定为 `master` @ `bf9e7cd3`（2026-08-14），最近 tag 为 `v1.84.0-dev`。
- 更新 Go 分组索引、源码解析总入口与进度台账。
- `pnpm run build` 已通过，共构建 845 个页面。
- `node scripts/check-links.mjs` 已通过，检查 845 个 HTML 页面无内部死链。

- 完成 Tokio 源码阅读册，共 9 篇：整体架构、Runtime、Task/Waker、调度器、IO driver、定时器、同步原语、阻塞取消、面试专题及总览。
- Tokio 快照固定为 `master` @ `625954f3`（2026-08-11），主 crate 为 `1.53.1`，对应 tag 为 `tokio-1.53.1`，MSRV 为 Rust `1.71`。
- 新增 Rust 分组索引，并更新源码解析总入口与进度台账。
- `pnpm run build` 已通过，共构建 867 个页面。
- `node scripts/check-links.mjs` 已通过，检查 867 个 HTML 页面无内部死链。

- 完成 Guava 源码阅读册，共 6 篇：架构、不可变集合、Cache 与 Caffeine 对照、EventBus、RateLimiter、面试专题及总览。
- Guava 快照固定为 `master` @ `94f39958b`（2026-08-11），Maven 版本为 `999.0.0-HEAD-jre-SNAPSHOT`。
- 更新 Java 基础库索引与源码解析总入口。
- `pnpm run build` 已通过，共构建 721 个页面。
- `node scripts/check-links.mjs` 已通过，检查 721 个 HTML 页面无内部死链。
- `pnpm run check:links` 受 Corepack 的 pnpm registry 签名验证失败影响，改用等价的链接检查脚本完成验证。
- 完成 Jackson Databind 源码阅读册，共 8 篇：架构、JavaType、序列化器缓存、反序列化、属性发现、注解与 Module、面试专题及总览。

- 完成 Fastjson2 源码阅读册，共 8 篇：架构、JSONReader/Writer、ObjectReader/Writer、字节码生成、类型安全与面试专题及总览。
- 完成 Hutool 源码阅读册，共 8 篇：架构、核心工具、转换配置、HTTP/JSON、Crypto/POI、反射 Bean 与面试专题及总览。






