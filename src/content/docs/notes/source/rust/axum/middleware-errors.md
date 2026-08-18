---
title: 中间件与错误边界
description: Tower Layer、from_fn、Next、Infallible 约束与 HandleError 的错误转响应路径。
category: Backend
tags: [Source Reading, Axum, Middleware, Error Handling]
order: 25
updatedDate: 2026-08-17
difficulty: advanced
status: stable
lastReviewed: 2026-08-17
draft: false
sidebar:
  order: 25
---

Axum 中间件遵循 Tower 的 `Layer<Service>` 模型。请求错误必须在到达 Hyper 之前变成响应，因此框架把“业务拒绝”和“Service 故障”分成两条错误通道。

<!-- more -->

## 洋葱模型

```text
request  -> Layer A -> Layer B -> Router -> handler
response <- Layer A <- Layer B <- Router <- handler
error                 -> HandleError -> Response
```

`middleware::from_fn` 创建 `FromFnLayer`（`axum/src/middleware/from_fn.rs:114-180`），layer 后的 service 为 `FromFn<F, S, I, T>`（`from_fn.rs:231-239`）。宏生成不同 extractor 元组的 `Service<Request>` 实现，调用逻辑位于 `from_fn.rs:260-305`；`Next` 封装剩余路由并通过 `run` 继续请求链（同文件 `335-365`）。

## 两类失败

| 失败 | 表达 | 处理位置 |
| --- | --- | --- |
| 参数/业务拒绝 | `Rejection: IntoResponse`、`Result<T, E: IntoResponse>` | handler/extractor 内部 |
| Tower Service 故障 | `Service::Error` | `HandleError` 转为响应 |

Axum 路由主干倾向 `Error = Infallible`，因为一旦请求进入 Hyper server，不能简单把任意应用错误丢给连接状态机。`HandleErrorLayer` 定义在 `error_handling/mod.rs:23-66`，`HandleError` 在 `:72-113`，无 extractor 的 Service 实现位于 `:115-147`，带参数版本由宏在 `:150-220` 生成。

## Layer 顺序

`Router::layer` 包住当前路由，后调用的 layer 位于更外层；复杂组合用 Tower `ServiceBuilder` 更容易从上到下阅读。timeout 往往会产生 `Elapsed` 错误，应在同一 builder 中配 `HandleErrorLayer`，否则类型不满足 Router 对错误的要求。

### 为什么不让 handler 直接返回任意 `BoxError`

**替代方案**：沿调用栈一直传播动态错误，最终服务器统一 500。

**为什么不行**：错误可能代表超时、限流、鉴权或断路，需要不同状态码；而 Hyper 连接错误与应用错误也不应混在一起。

**证据**：handler 输出受 `IntoResponse` 约束（`handler/mod.rs:234-236`），Tower 错误则通过 `HandleError` 的转换函数显式变响应（`error_handling/mod.rs:115-147`）。

## 自定义中间件的选择

| 需求 | 首选 |
| --- | --- |
| 简单异步前后处理 | `from_fn` |
| 只做请求映射 | `map_request` |
| 只做响应映射 | `map_response` |
| 需要复用 Tower 生态 | 直接使用/实现 `Layer` + `Service` |
| 需要提取器先行鉴权 | `from_extractor` 或 `from_fn` 参数 |

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| timeout 没配错误映射 | 编译失败或无法装入 Router | timeout service 的 Error 非 Infallible | 外包 `HandleErrorLayer` |
| middleware 持锁跨 `next.run().await` | 全链路串行 | 锁覆盖下游请求时间 | await 前释放 guard |
| layer 顺序写反 | trace 看不到 timeout 或错误 | 洋葱包裹顺序错误 | 画请求/响应方向图 |
| 中间件消费 body | handler extractor 失败 | body 单次消费 | 重建 body，或只在明确边界读取 |

## 可迁移知识

错误边界应与抽象边界对齐：领域失败是可预期响应，基础设施故障先在适配层分类，再转为协议结果；不要让底层连接驱动理解业务错误。

> **面试锚点**
> - 为什么 Axum 要求路由错误最终是 Infallible？
> - `from_fn` 与手写 Tower Service 怎么选？
> - `HandleErrorLayer` 应放在 timeout 的内侧还是外侧？

## Related

- [Tower Service 适配层](/notes/source/rust/axum/tower-service/)
- [Handler 泛型分派](/notes/source/rust/axum/handler/)
- [Actix Web 中间件管线](/notes/source/rust/actix-web/middleware/)
