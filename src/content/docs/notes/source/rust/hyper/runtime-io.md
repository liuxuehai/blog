---
title: 运行时与 IO 抽象
description: Hyper 的 Read、Write、Executor、Timer、Sleep 与 upgrade 所有权边界。
category: Backend
tags: [Source Reading, Hyper, Runtime, IO]
order: 35
updatedDate: 2026-08-17
difficulty: advanced
status: stable
lastReviewed: 2026-08-17
draft: false
sidebar:
  order: 35
---

Hyper 自己不提供 reactor 和 scheduler。它定义最小运行时接口，让 Tokio、自定义 runtime、测试 IO 与 FFI 都能驱动同一协议状态机。

<!-- more -->

## 四个最小能力

```text
rt::Read / Write  -> socket bytes
rt::Executor      -> HTTP/2 per-stream futures
rt::Timer / Sleep -> header timeout、keepalive 等时间能力
upgrade::OnUpgrade -> 把 IO 所有权交给新协议
```

`Read` 定义于 `src/rt/io.rs:74-91`，使用 `ReadBufCursor` 管理未初始化缓冲；`Write` 定义于 `rt/io.rs:94-128`，包含 vectored write 能力。`Executor<Fut>` 位于 `src/rt/mod.rs:45-48`。`Timer` 与 `Sleep` 分别在 `src/rt/timer.rs:70-99`、`:137-144`。

## 为什么不是标准 `AsyncRead`

Rust 标准库没有稳定统一的 async IO trait，而 Tokio trait 会造成运行时耦合。Hyper 的 `ReadBuf` 设计还允许实现者安全地写入未初始化内存，减少零填充；具体结构和 cursor 位于 `rt/io.rs:131` 之后。

## Vectored write

HTTP/1 响应常由 header buffer 与 body chunk 组成。`Write::poll_write_vectored` 和 `is_write_vectored` 允许一次系统调用提交多个 slice。`Buffered::poll_flush` 在 `src/proto/h1/io.rs:271-303` 优先使用 vectored write，必要时走 flattened buffer（`:311-327`）。

## Timer 的对象安全边界

Timer 返回 `Pin<Box<dyn Sleep>>`，还支持 reset（`rt/timer.rs:70-88`）。把 deadline 重置能力放进 trait，可复用一个 timer 对象，而不是每次重新分配 runtime-specific sleep。

## Upgrade

HTTP upgrade 或 CONNECT 后，HTTP 状态机必须停止解释字节，并把底层 IO 与已读缓冲交给新协议。升级入口在 `src/upgrade.rs`；HTTP/1 connection 的 `poll_without_shutdown`（`server/conn/http1.rs:167-188`、`client/conn/http1.rs:94-111`）允许在不关闭 IO 的情况下完成协议驱动。

### 为什么运行时适配层必须很薄

**替代方案**：在 Hyper 内部再实现一层通用 reactor/executor。

**为什么不行**：重复 Tokio 等运行时能力，增加调度、取消与 IO 注册的不一致。

**证据**：Hyper 只要求四个小 trait，协议代码直接 poll 它们；具体 Tokio 兼容通常由 `hyper-util::rt` 提供。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| 自定义 IO 不正确唤醒 | 连接永久 Pending | 返回 Pending 后未安排 wake | 遵守 Future/IO poll 契约 |
| 声称支持 vectored 却错误处理 | 数据错序 | slices 推进量不一致 | 正确返回总写入字节数 |
| timer reset 不生效 | timeout 漂移 | Sleep 实现忽略新 deadline | 为 reset 写确定性测试 |
| upgrade 丢 read buffer | 新协议少字节 | HTTP parser 已预读 | 使用 `Parts` 中的 read buffer |

## 可迁移知识

基础库的可移植性来自“最小能力接口”，不是自建万能运行时。只抽象真正需要的 poll、spawn 与 timer 操作，适配层会稳定且容易验证。

> **面试锚点**
> - Hyper 为什么不用 Tokio AsyncRead 作为公共接口？
> - vectored write 在 HTTP/1 中有什么价值？
> - upgrade 为什么要保留预读缓冲？

## Related

- [Tokio IO Driver](/notes/source/rust/tokio/io-driver/)
- [HTTP/1 状态机](/notes/source/rust/hyper/http1-state-machine/)
- [Axum 整体架构](/notes/source/rust/axum/architecture/)
