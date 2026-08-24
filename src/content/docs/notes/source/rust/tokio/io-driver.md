---
title: IO Driver 与 Readiness
description: Tokio 如何用 mio、Registration、ScheduledIo、readiness 位和 Waker 把操作系统事件接入 Future。
category: Backend
tags: [Source Reading, Tokio, Rust, IO, Mio]
order: 50
updatedDate: 2026-08-24
difficulty: advanced
status: stable
lastReviewed: 2026-08-24
draft: false
sidebar:
  order: 50
---

Tokio 的异步 IO 不是把 `read` 调用送到普通线程池，而是把非阻塞资源注册给 mio。Future 先尝试真实 IO，遇到 `WouldBlock` 后登记 interest 和 Waker，driver 收到 readiness 再把任务唤醒。

<!-- more -->

## 先给答案：Tokio 的异步 IO 不是把 read 调用送到普通线程池，而是把非阻塞资源注册给 mio

Tokio 的异步 IO 不是把 read 调用送到普通线程池，而是把非阻塞资源注册给 mio。Future 先尝试真实 IO，遇到 WouldBlock 后登记 interest 和 Waker，driver 收到 readiness 再把任务唤醒。 正文沿“组件关系 -> driver turn -> ScheduledIo 状态”展开：先确认入口和状态归属，再跟踪控制流或数据流的推进，最后落到对外可观察的结果。

主要失效边界集中在“readiness 到达就假设 IO 必成功、自定义 AsyncFd 忘记清 readiness、同方向多个 poll API 混用”这些场景。它们破坏的是容量、顺序、并发或生命周期前提；排查时应先确认状态是否仍由正确对象持有，再核对推进条件和清理路径。

## 组件关系

```text
TcpStream / AsyncFd
  -> PollEvented / Registration
       -> ScheduledIo
            +-> readiness bits + driver tick
            +-> reader/writer Waker
            +-> waiter list
       -> mio::Registry

runtime IO Driver
  -> mio::Poll::poll
  -> event token -> ScheduledIo
  -> set_readiness
  -> wake matching waiters
```

IO `Driver` 和 `Handle` 分别位于 `tokio/src/runtime/io/driver.rs:25-58`、`driver.rs:37-61`。`Registration` 位于 `runtime/io/registration.rs:46-73`，`PollEvented` 的构造入口在 `tokio/src/io/poll_evented.rs:89-124`。

## driver turn

`Driver::park` 与 `park_timeout` 位于 `runtime/io/driver.rs:159-166`，都进入 `turn`（`driver.rs:179-238`）：

```text
release pending registrations
  -> mio::Poll::poll(events, max_wait)
  -> 遍历 event
       -> token 定位 ScheduledIo
       -> Ready::from_mio(event)
       -> set_readiness(Tick::Set)
       -> wake(ready)
```

调度器没有任务时才 park 到 driver；新任务或资源注册通过专用 wake token 打断 poll。因此“线程等待 IO”和“线程等待任务”在同一个 park 路径上合流。

## ScheduledIo 状态

`ScheduledIo` 定义于 `runtime/io/scheduled_io.rs:101-109`。单个 `AtomicUsize` 打包三部分：

```text
| shutdown: 1 bit | driver tick: 15 bits | readiness: 16 bits |
```

`set_readiness` 位于 `scheduled_io.rs:207-229`，`poll_readiness` 位于 `scheduled_io.rs:303-356`。poll 的双重检查流程是：先读 readiness；若未就绪则加锁保存 Waker；再读一次 readiness，避免事件恰好发生在首次检查与 Waker 注册之间而丢失通知。

## readiness tick 为什么存在

readiness 是可消费状态。任务完成一次 IO 尝试后会清除相应位，但旧 Future 不能清掉随后到达的新事件。`Tick::Clear(t)` 只有在 tick 仍与观察值一致时才成功；driver 每次 Set 都递增 tick。

```text
task A 观察 tick=7 readable
driver 收到新事件 -> tick=8 readable
task A 尝试 Clear(7) -> 被拒绝
```

这相当于给 readiness 增加版本号，解决检查、IO 尝试和清除之间的 ABA 风险。

## 真实 IO 仍要重试

Readiness 只是“操作可能成功”。多个任务可能竞争同一资源，平台也可能给出伪就绪，因此正确循环仍是：

```text
await readable/writable
  -> 尝试 read/write
       +-> success: 消费结果
       +-> WouldBlock: 清除观察到的 readiness，再等待
       +-> other error: 返回错误
```

## 边界与踩坑

| 场景 | 风险 | 处理 |
| --- | --- | --- |
| readiness 到达就假设 IO 必成功 | 竞争或伪就绪仍会 WouldBlock | 始终以真实系统调用结果为准 |
| 自定义 AsyncFd 忘记清 readiness | Future 高频空转 | 正确使用 guard/clear_ready |
| 同方向多个 poll API 混用 | reserved Waker 可能被替换 | 遵守单读者/单写者约定或使用 readiness future |
| 持锁调用 wake | 被唤醒任务可能回入形成死锁 | Tokio 收集 Waker，释放锁后统一 wake |

## 可迁移知识

边沿事件与异步任务之间需要“状态 + 版本 + 等待者”三件套。只保存布尔 ready 无法区分旧观察与新事件，容易产生丢事件或错误清除。

> **面试锚点**
> - Tokio IO driver 和普通阻塞线程池有什么区别？
> - `poll_readiness` 为什么注册 Waker 后要再次检查？
> - readiness tick 解决了什么并发问题？

## Related

- [Task、RawTask 与 Waker](/notes/source/rust/tokio/task-waker/)
- [定时器与时间轮](/notes/source/rust/tokio/timer/)
- [Netty Reactor 与线程模型](/notes/source/java/base/netty/reactor-threading/)

