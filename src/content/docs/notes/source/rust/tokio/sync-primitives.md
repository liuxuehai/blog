---
title: 同步原语与背压
description: Tokio Semaphore、Mutex、Notify、mpsc 与 watch 的等待队列、公平性、容量和状态传播语义。
category: Backend
tags: [Source Reading, Tokio, Rust, Sync, Channel]
order: 70
updatedDate: 2026-08-17
difficulty: advanced
status: stable
lastReviewed: 2026-08-17
draft: false
sidebar:
  order: 70
---

异步同步原语不能让 worker 阻塞在操作系统锁上。Tokio 的共同做法是：快速路径用原子状态尝试完成，失败后把当前任务的 Waker 放入等待队列，资源释放时再唤醒符合条件的 waiter。

<!-- more -->

## 语义地图

| 原语 | 保存什么 | 等待什么 | 典型用途 |
| --- | --- | --- | --- |
| `Semaphore` | permit 计数 | 足够许可 | 并发度、容量、速率门控 |
| `Mutex<T>` | 独占许可 + 数据 | 锁所有权 | 跨 `.await` 的共享状态 |
| `Notify` | 至多一个预存 permit + waiters | 一次通知 | 条件变化提示 |
| bounded `mpsc` | 消息队列 + 容量 permit | 发送容量或消息 | 有背压工作队列 |
| `watch` | 最新值 + version | 值发生变化 | 配置、状态广播 |

它们都能唤醒任务，但不能互换：`Notify` 不保存业务数据，`watch` 不保留全部历史，`mpsc` 才表示逐条消费。

## Semaphore 公平队列

公开 `Semaphore::acquire`、`acquire_many` 和 `acquire_owned` 分别位于 `tokio/src/sync/semaphore.rs:614-635`、`semaphore.rs:661-682`、`semaphore.rs:884-905`，实际队列实现在 `tokio/src/sync/batch_semaphore.rs`。

`batch_semaphore.rs:35-95` 定义 permit 原子计数和侵入式 waiter 链表；`poll_acquire` 在 `batch_semaphore.rs:397-520`，释放分配在 `batch_semaphore.rs:306-371`。waiter 按请求顺序服务，大请求位于队首时，后面的小请求也不会绕过它。

```text
acquire(n)
  -> 原子扣减成功 -> Ready
  -> permit 不足 -> waiter 入队 -> Pending

release(n)
  -> 从队首累计分配 permit
  -> 满足 waiter 后移出队列
  -> 释放锁后 wake
```

公平性避免饥饿，但 `acquire_many` 也可能造成队头阻塞，这是语义选择而不是实现缺陷。

## Mutex 建立在 Semaphore 上

异步 `Mutex` 定义于 `tokio/src/sync/mutex.rs:133-158`，`lock` 在 `mutex.rs:434-466`。它使用单 permit 信号量实现 FIFO 获取，并允许 guard 跨 `.await`。

若临界区不跨 `.await`，标准库或 parking_lot 的阻塞 mutex 往往更便宜；异步 mutex 的等待节点、Waker 和调度开销只在需要挂起任务时才值得承担。

## bounded mpsc 的背压

有界 channel 在 `tokio/src/sync/mpsc/bounded.rs:159-169` 创建，同时构造一个容量等于 buffer 的 batch semaphore。`send` 位于 `bounded.rs:816-829`，最终在 `bounded.rs:1287-1305` acquire 容量；receiver 消费后通过 `mpsc/chan.rs:304` 一带归还 permit。

```text
Sender::send(value)
  -> reserve 1 capacity permit
  -> value push 到无锁链表队列
  -> notify receiver

Receiver::poll_recv
  -> pop value
  -> return 1 permit
  -> 唤醒等待容量的 sender
```

因此 buffer 不是性能装饰，而是系统允许积压的上限。取消等待中的 `send` 会失去公平队列位置；若必须确保消息不丢，应先 `reserve` 获得 permit，再构造或提交消息。

## Notify 与 watch

`Notify` 定义于 `tokio/src/sync/notify.rs:199-229`，`notified`、`notify_one`、`notify_waiters` 分别位于 `notify.rs:562-578`、`notify.rs:657-708`、`notify.rs:740-784`。`notify_one` 在没有 waiter 时保存一个 permit，但多次调用不会累计为任意计数。

watch 的 sender/receiver 位于 `tokio/src/sync/watch.rs:185-210`，`channel` 在 `watch.rs:554-570`，`changed` 在 `watch.rs:818-846`。receiver 通过版本判断是否看过当前值；`borrow_and_update`（`watch.rs:676-709`）把读取和标记已见合并，避免检查与订阅之间的竞态。

## 边界与踩坑

| 场景 | 风险 | 处理 |
| --- | --- | --- |
| 用 Notify 传递事件数量 | 多次通知会合并 | 数量放原子计数/队列，Notify 只提示重查 |
| bounded channel 配成无限大效果 | 背压过晚导致内存峰值 | 按消费者吞吐和允许延迟确定容量 |
| async Mutex 包住纯 CPU 大临界区 | waiter 长时间无法推进 | 缩短临界区或重构所有权 |
| watch 接收方期待每个中间值 | 快速更新会被覆盖 | 需要历史时使用 mpsc/broadcast |

## 可迁移知识

选择并发原语前先问：要保存的是许可、消息、最新状态，还是仅仅“状态可能变化”的提示。唤醒机制相似，不代表交付语义相同。

> **面试锚点**
> - Tokio Semaphore 的公平性为什么会造成队头阻塞？
> - bounded mpsc 如何利用 permit 实现背压？
> - Notify、watch 和 mpsc 分别会丢失什么信息？

## Related

- [调度器与工作窃取](/notes/source/rust/tokio/scheduler/)
- [阻塞、取消与关闭](/notes/source/rust/tokio/blocking-cancellation/)
- [Disruptor RingBuffer](/notes/source/java/base/disruptor/ring-buffer/)
