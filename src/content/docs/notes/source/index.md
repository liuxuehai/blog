---
title: 源码解析
description: 对 48 个开源仓库的分册式源码解析：设计取舍、架构、核心机制、技术细节与面试重点。
category: Backend
tags:
  - Source Reading
order: 70
updatedDate: 2026-08-18
difficulty: advanced
status: learning
lastReviewed: 2026-08-18
draft: false
sidebar:
  order: 70
---

这里是一个长期推进的源码阅读工程：对 Java / Redis / Go / Rust 生态的 48 个开源仓库，逐个产出分册式深度解析，每册覆盖**设计取舍、整体架构、核心机制、源码级技术细节、面试重点**五个维度。

<!-- more -->

## 这个系列和「框架教程」的区别

| | 框架教程 | 本系列 |
| --- | --- | --- |
| 回答的问题 | 怎么用 | 为什么这么实现，以及为什么不是别的实现 |
| 证据 | 官方文档 | 精确到 `文件:行号` 的源码坐标 + commit 记录 |
| 深度标准 | 跑通示例 | 每篇必须有：源码坐标、结构图、被放弃的替代方案、边界与踩坑、可迁移知识 |

每册的 `index.md` 会固化一个**版本快照**（分支 + commit + 日期）。行号只在那个 commit 下成立，类名与方法名相对稳定。

## 进度

**已完成 48 / 48 册。**

| 阶段 | 内容 | 状态 |
| --- | --- | --- |
| 1 · 打底 | disruptor · xxl-job · mybatis-3 · gin | 4/4 |
| 2 · 网络与事件循环内核 | netty · redis · valkey · hiredis | 4/4 |
| 3 · Spring 全家桶 | spring-framework · spring-boot · tomcat · spring-security · spring-cloud-gateway · spring-cloud-openfeign · spring-data-redis · spring-cloud-alibaba | 8/8 |
| 4 · 中间件与分布式 | rocketmq · dubbo · nacos · redisson · kafka · shardingsphere 等 15 个 | 15/15 |
| 5 · 基础库与多语言 | caffeine · guava · go-zero · etcd · kratos · grpc-go · tokio · axum 等 17 个 | 17/17 |

## 已完成分册

### Java · 网络与基础库

- [Caffeine](/notes/source/java/base/caffeine/) —— W-TinyLFU、写后维护、过期时间轮、并发读写与异步加载（8 篇）
- [Guava](/notes/source/java/base/guava/) —— 不可变集合、LocalCache、EventBus 与 RateLimiter（6 篇）
- [Disruptor](/notes/source/java/base/disruptor/) —— 无锁环形队列、序号栅栏、伪共享填充、内存屏障与多生产者协调（7 篇）
- [Netty](/notes/source/java/base/netty/) —— EventLoop、Pipeline、ByteBuf、零拷贝、时间轮与拆包（9 篇）
- [Tomcat](/notes/source/java/base/tomcat/) —— 生命周期、Connector/Container、NIO Endpoint、请求链、Mapper/Valve 与类加载隔离（9 篇）
- [ZooKeeper](/notes/source/java/base/zookeeper/) —— ZAB、会话管理、Watcher、数据模型与事务日志快照（7 篇）

### Java · RPC 与微服务

- [XXL-JOB](/notes/source/java/rpc/xxl-job/) —— DB 锁调度、秒级时间轮、执行器路由、阻塞策略、回调与分片广播（7 篇）
- [Dubbo](/notes/source/java/rpc/dubbo/) —— SPI、服务导出与引用、集群容错、协议编解码与治理（7 篇）
- [Nacos](/notes/source/java/rpc/nacos/) —— Distro、JRaft、配置长轮询、注册发现与健康检查（7 篇）
- [Sentinel](/notes/source/java/rpc/sentinel/) —— Slot 链、滑动窗口、流控、熔断、系统保护与集群 Token（7 篇）
- [Seata](/notes/source/java/rpc/seata/) —— TM/TC/RM 生命周期、AT undo_log、TCC/Saga/XA、Netty 通信与会话持久化（7 篇）

### Java · Spring 生态

- [Spring Framework](/notes/source/java/spring/spring-framework/) —— IoC 容器、Bean 生命周期、循环依赖、AOP、事务与测试上下文（9 篇）
- [Spring Boot](/notes/source/java/spring/spring-boot/) —— 启动、自动装配、条件注解、配置绑定、内嵌容器与 Actuator（9 篇）
- [Spring Security](/notes/source/java/spring/spring-security/) —— 过滤器链、认证管理、授权决策与 SecurityContext 传播（7 篇）
- [Spring Cloud Gateway](/notes/source/java/spring/spring-cloud-gateway/) —— WebFlux、路由、过滤器链、限流与熔断（7 篇）
- [Spring Cloud OpenFeign](/notes/source/java/spring/spring-cloud-openfeign/) —— 接口注册、代理组装、契约编解码、负载均衡与熔断（7 篇）
- [Spring Data Redis](/notes/source/java/spring/spring-data-redis/) —— 连接工厂、RedisTemplate、序列化、Pub/Sub、Stream 与事务（9 篇）
- [Spring Cloud Alibaba](/notes/source/java/spring/spring-cloud-alibaba/) —— 自动装配、Nacos、Sentinel 与 RocketMQ 适配（7 篇）

### Java · 消息中间件

- [RocketMQ](/notes/source/java/mq/rocketmq/) —— CommitLog、消费索引、长轮询、事务消息与 DLedger（8 篇）
- [Kafka](/notes/source/java/mq/kafka/) —— 分区日志、ISR、页缓存、KRaft 与消费者重平衡（9 篇）

### Java · 存储与 ORM

- [MyBatis-3](/notes/source/java/storage/mybatis-3/) —— 配置解析、Mapper 动态代理、执行器、缓存、插件链与结果映射（8 篇）
- [ShardingSphere](/notes/source/java/storage/shardingsphere/) —— JDBC 入口、SQL 解析、路由改写、归并执行、分布式事务与治理（10 篇）
- [Druid](/notes/source/java/storage/druid/) —— 连接池、JDBC 代理、SQL Parser、Wall 防火墙、统计与 Web 监控（10 篇）
- [HikariCP](/notes/source/java/storage/hikaricp/) —— 配置初始化、ConcurrentBag、连接借还、代理重置、故障检测与指标（8 篇）
- [Jedis](/notes/source/java/storage/jedis/) —— RESP 编解码、连接生命周期、连接池、Pipeline、Cluster 路由与客户端缓存（8 篇）
- [Redisson](/notes/source/java/storage/redisson/) —— 异步命令管线、分布式锁、watchdog、Lua、RedLock、集合与限流器（8 篇）
- [MyBatis-Plus](/notes/source/java/storage/mybatis-plus/) —— 实体元数据、Mapper 注入、Wrapper、插件链、分页与 Spring 集成（8 篇）

### Java · 诊断工具

- [Arthas](/notes/source/java/tools/arthas/) —— Instrumentation 与 Agent 挂载、字节码增强、命令管道与终端协议（7 篇）
- [SkyWalking](/notes/source/java/tools/skywalking/) —— Agent 无侵入插桩、上下文传播、TraceId、OAP 数据模型与流式聚合（7 篇）

### Go

- [Gin](/notes/source/go/gin/) —— Radix 树路由、Context 池化、中间件链、参数绑定与校验（7 篇）
- [go-zero](/notes/source/go/go-zero/) —— 熔断、限流、syncx、缓存、zrpc 与 goctl（9 篇）
- [etcd](/notes/source/go/etcd/) —— Raft、WAL、MVCC、Watch 与 Lease（9 篇）
- [Kratos](/notes/source/go/kratos/) —— 分层、App 生命周期、中间件、注册发现与传输抽象（9 篇）
- [grpc-go](/notes/source/go/grpc-go/) —— ClientConn、HTTP/2、流控、拦截器、名字解析与负载均衡（9 篇）

### Rust

- [Tokio](/notes/source/rust/tokio/) —— Runtime、Task/Waker、调度器、IO driver、时间轮、同步原语与取消（9 篇）
- [Axum](/notes/source/rust/axum/) —— Tower Service、Handler、Extractor、路由状态与中间件（8 篇）
- [Hyper](/notes/source/rust/hyper/) —— HTTP/1 状态机、HTTP/2、Body、单连接 API 与运行时抽象（8 篇）
- [Actix Web](/notes/source/rust/actix-web/) —— Worker、ServiceFactory、路由、提取器、中间件与 WebSocket Actor（9 篇）
- [Serde](/notes/source/rust/serde/) —— 数据模型、Serializer/Deserializer、derive 与零成本抽象（8 篇）
- [Clap](/notes/source/rust/clap/) —— Command/Arg、解析状态机、类型化取值、derive、帮助与补全（8 篇）
- [SQLx](/notes/source/rust/sqlx/) —— 编译期 SQL 校验、异步执行器、连接池、driver 与类型映射（8 篇）
- [ripgrep](/notes/source/rust/ripgrep/) —— crate 分层、ignore 遍历、literal prefilter、Searcher 与 Printer（8 篇）

### Redis 系

- [Redis](/notes/source/redis/redis/) —— ae 事件循环、对象编码、rehash、持久化、复制与过期淘汰（9 篇）
- [Valkey](/notes/source/redis/valkey/) —— Redis 分叉兼容、多线程 IO、BIO 与 fork 后台任务（6 篇）
- [hiredis](/notes/source/redis/hiredis/) —— C 客户端连接、RESP reader、同步命令、异步回调与事件适配（7 篇）
## 按语言浏览

- [Java](/notes/source/java/) —— 32 个仓库：Spring 生态、消息中间件、RPC、存储与 ORM、网络与基础库、诊断工具
- [Go](/notes/source/go/) —— 5 个仓库：HTTP 框架、服务治理、共识存储与 RPC
- [Rust](/notes/source/rust/) —— 10 个仓库：异步运行时、网络框架、序列化、CLI、数据库与搜索工具
- [Redis](/notes/source/redis/) —— Redis、Valkey 与 hiredis（已完成 3 / 3 册）

## Related

- [Backend](/notes/backend/)
- [Architecture](/notes/architecture/)




