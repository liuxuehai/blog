---
title: 面试专题
description: Dubbo SPI、Invoker、服务导出引用、集群容错和协议栈源码级面试题。
category: Backend
tags: [Source Reading, Dubbo, Interview]
order: 29
updatedDate: 2026-08-24
difficulty: advanced
status: stable
lastReviewed: 2026-08-24
draft: false
sidebar: { order: 29 }
---

Dubbo 面试的分水岭是能否把配置、Invoker、Cluster、Protocol 和 Remoting 串成一条证据链。

<!-- more -->

## 先给答案：Dubbo 面试的分水岭是能否把配置、Invoker、Cluster、Protocol 和 Remotin…

Dubbo 面试的分水岭是能否把配置、Invoker、Cluster、Protocol 和 Remoting 串成一条证据链。 正文沿“高频题 -> 高难追问 -> 场景题”展开：先确认入口和状态归属，再跟踪控制流或数据流的推进，最后落到对外可观察的结果。

主要失效边界集中在“线上延迟突然升高，如何定位、线上出现重复扣款，先查哪里”这些场景。它们破坏的是容量、顺序、并发或生命周期前提；排查时应先确认状态是否仍由正确对象持有，再核对推进条件和清理路径。

## 高频题

### Dubbo SPI 比 Java SPI 强在哪里？

**30 秒版**：Dubbo SPI 支持按名称加载、Wrapper、自适应扩展、依赖注入和 ScopeModel 隔离，不只是扫描实现类。**展开**：`ExtensionLoader#getExtension` 在 `dubbo-common/src/main/java/org/apache/dubbo/common/extension/ExtensionLoader.java:549`，目录加载在 `:1005`，注入在 `:856`。**加分项**：Loader 还能把多个实现包装成一条横切链。**常见错答**：只说“Dubbo SPI 更快”，没有解释组合能力。

### Dubbo 为什么以 Invoker 为核心？

**30 秒版**：Invoker 统一本地、远程、集群和过滤器调用。**展开**：提供者在 `ServiceConfig.java:992` 把 Invoker 交给 Protocol，消费者在 `ReferenceConfig.java:672` 从 Protocol 得到 Invoker，再由 Cluster 聚合。**加分项**：代理只是 Invoker 的用户友好外观。**常见错答**：把代理当成 RPC 核心对象。

### 一次调用如何选择节点？

**30 秒版**：先 Directory 得到地址视图，再 Router 过滤，最后 LoadBalance 选择。**展开**：`AbstractClusterInvoker#invoke` 在 `AbstractClusterInvoker.java:355` 列表、`:360` 初始化负载均衡；`select` 在 `:155` 做可用性和重复选择。**加分项**：路由和负载均衡分离便于解释和替换。**常见错答**：说 Router 负责随机选择。

### Failover 一定能保证请求成功吗？

**30 秒版**：不能，它只是在可重试异常下换节点重试。**展开**：`FailoverClusterInvoker#doInvoke` 在 `FailoverClusterInvoker.java:59`，选择未调用节点在 `:77`。**加分项**：服务端可能已经执行成功，客户端才收到超时，所以非幂等操作会重复。**常见错答**：把重试当成事务保证。

### Dubbo Protocol、Exchange、Codec 如何分工？

**30 秒版**：Protocol 管导出和引用，Exchange 管请求响应语义，Codec 管字节格式。**展开**：`DubboProtocol#export` 在 `DubboProtocol.java:346`，`Exchangers#bind` 在 `Exchangers.java:53`，响应分派在 `HeaderExchangeHandler.java:196`。**加分项**：分层让 Triple、Injvm 和 Dubbo 协议复用上层模型。**常见错答**：认为 Protocol 直接负责所有 Socket 细节。

### 为什么支持 LazyConnect？

**30 秒版**：引用阶段先不建立连接，把连接成本推迟到首次调用。**展开**：`DubboProtocol.java:590` 选择 `LazyConnectExchangeClient`，立即连接路径在 `:591`。**加分项**：它降低冷启动连接风暴，但会增加首调用延迟。**常见错答**：认为 lazy connect 等于没有超时。

## 高难追问

### 源码坐标总览

- `ExtensionLoader#getExtension` — `dubbo-common/src/main/java/org/apache/dubbo/common/extension/ExtensionLoader.java:549`
- `ServiceConfig#export` — `dubbo-config/dubbo-config-api/src/main/java/org/apache/dubbo/config/ServiceConfig.java:325`
- `ReferenceConfig#get` — `dubbo-config/dubbo-config-api/src/main/java/org/apache/dubbo/config/ReferenceConfig.java:230`
- `AbstractDirectory#list` — `dubbo-cluster/src/main/java/org/apache/dubbo/rpc/cluster/directory/AbstractDirectory.java:204`
- `AbstractClusterInvoker#invoke` — `dubbo-cluster/src/main/java/org/apache/dubbo/rpc/cluster/support/AbstractClusterInvoker.java:345`
- `FailoverClusterInvoker#doInvoke` — `dubbo-cluster/src/main/java/org/apache/dubbo/rpc/cluster/support/FailoverClusterInvoker.java:59`
- `DubboProtocol#export` — `dubbo-rpc/dubbo-rpc-dubbo/src/main/java/org/apache/dubbo/rpc/protocol/dubbo/DubboProtocol.java:346`
- `Exchangers#bind` — `dubbo-remoting/dubbo-remoting-api/src/main/java/org/apache/dubbo/remoting/exchange/Exchangers.java:53`

### 注册中心地址变化时，正在调用的请求怎么办？

旧调用使用已经选出的 Invoker；后续调用由 Directory 刷新后的快照参与路由。刷新入口是 `AbstractDirectory#refreshInvoker`（`AbstractDirectory.java:433`）。因此更新应采用快照替换，不应原地修改正在遍历的列表。

### 为什么重试次数不能只看网络异常？

因为异常只描述传输结果，不描述服务端业务是否落库。重试决策必须结合方法幂等性、业务状态查询和调用超时，源码中的 Failover 只能完成基础策略。

### Wrapper 顺序为什么会影响结果？

Wrapper 是嵌套调用，外层先执行 before，内层返回后再执行 after。监控、鉴权和异常转换顺序不同，会改变可观测结果和错误语义，因此应通过扩展排序和测试固化。

### URL 参数过多有什么风险？

URL 统一了配置传递，但也形成隐式契约。参数拼写、覆盖顺序和默认值都会跨层传播，排查时应打印最终 Invoker URL，而不是只看原始 YAML。

## 场景题

### 线上延迟突然升高，如何定位？

先区分路由后候选数、LoadBalance 选择耗时、连接池/连接状态、编码解码耗时和服务端执行耗时；再沿 `AbstractClusterInvoker#invoke`、`DubboProtocol` 的 request handler、`HeaderExchangeHandler` 和 Codec 打点。若只有首调用慢，优先检查 LazyConnect 或连接重建。

### 线上出现重复扣款，先查哪里？

检查消费者是否启用 Failover、超时是否过短、服务端是否已执行但响应丢失，以及方法是否有幂等键。不要直接把重试次数调大；先通过业务流水号和服务端状态确认重复来源。

## 反向问面试官

- 生产环境的 Dubbo 协议、序列化和注册中心版本如何治理？
- 关键写接口是否有统一幂等方案和重试白名单？
- 地址刷新、调用耗时和重试次数是否有分层指标？

## Related

- [整体架构](/notes/source/java/rpc/dubbo/architecture/)
- [SPI 扩展机制](/notes/source/java/rpc/dubbo/spi-extension/)
- [集群容错与负载均衡](/notes/source/java/rpc/dubbo/cluster-fault-tolerance/)
