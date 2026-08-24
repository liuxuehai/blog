---
title: 连接借还生命周期
description: HikariPool 从 borrow 到代理返回、回收、补充和关闭的完整生命周期。
category: Backend
tags: [Source Reading, HikariCP, Connection Pool]
order: 44
updatedDate: 2026-08-24
difficulty: advanced
status: stable
lastReviewed: 2026-08-24
draft: false
sidebar:
  order: 44
---

HikariCP 的连接生命周期围绕 `PoolEntry` 展开：物理连接只由池创建和销毁，业务拿到的是带生命周期回调的代理连接。

<!-- more -->

## 先给答案：HikariCP 的连接生命周期围绕 PoolEntry 展开：物理连接只由池创建和销毁，业务拿到的是带生…

HikariCP 的连接生命周期围绕 PoolEntry 展开：物理连接只由池创建和销毁，业务拿到的是带生命周期回调的代理连接。 正文沿“借出 -> 归还 -> 创建与补充”展开：先确认入口和状态归属，再跟踪控制流或数据流的推进，最后落到对外可观察的结果。

主要失效边界集中在“借出超时、归还失败、minIdle 不足”这些场景。它们破坏的是容量、顺序、并发或生命周期前提；排查时应先确认状态是否仍由正确对象持有，再核对推进条件和清理路径。

## 借出

- `HikariPool#getConnection()`：`src/main/java/com/zaxxer/hikari/pool/HikariPool.java:140-142`。
- 带超时借出：`:152-183`。
- `connectionBag.borrow`：`:160`。
- 条目失效关闭：`:167`。
- 等待指标：`:171`。
- 代理创建：`:179`。
- `PoolEntry#createProxyConnection`：`PoolEntry.java:99-101`。

借出时如果拿到已标记驱逐或已死亡的条目，池会关闭它并继续尝试；只有有效条目才包装成代理返回。

## 归还

- `HikariPool#recycle`：`HikariPool.java:434-447`。
- 指标记录使用时间：`:436`。
- 已驱逐条目转关闭：`:438`。
- 正常条目回到 bag：`:447`。
- 物理关闭：`closeConnection` 在 `:457-463`。

## 创建与补充

- `createPoolEntry`：`HikariPool.java:485-504`。
- maxLifetime 定时任务：`:495`。
- keepalive 定时任务：`:498-503`。
- `addBagItem`：`:341`。
- 创建任务提交：`:528-533`。
- 新物理连接：`PoolBase.java:360-373`。

## 为什么归还时才重置而不是借出时重置

**替代方案**：每次借出前检查并修复所有 JDBC 状态。
**为什么不行**：状态污染应在上一个租借结束时收口，借出热路径只需确认条目可用；把重置延迟到 close 还能把异常归因到上一位使用者。
**证据**：`ProxyConnection.java:240-262` 关闭时先处理 rollback，再调用 `PoolEntry.resetConnectionState`，随后由 `HikariPool.recycle` 重新入 bag。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| 借出超时 | `SQLTransientConnectionException` | active 达上限且无空闲连接 | 调整池大小或减少持有时间 |
| 归还失败 | 连接被驱逐 | 状态重置或 close statement 出错 | 记录 closureReason 并重建 |
| minIdle 不足 | 高峰期创建延迟 | 后台补充尚未完成 | 结合启动策略和数据库容量配置 |

## 可迁移知识

池化资源必须区分“资源本体”和“租借代理”。代理负责把租借结束转换成统一回收动作，池才有机会在一个位置完成状态清理和故障判断。

> **面试锚点**
> - HikariPool 为什么返回代理连接？
> - 失效条目在借出过程中如何处理？
> - `recycle` 和物理 `close` 的区别是什么？

## Related

- [代理、状态重置与泄漏检测](/notes/source/java/storage/hikaricp/proxy-reset-leak/)
- [ConcurrentBag 并发容器](/notes/source/java/storage/hikaricp/concurrent-bag/)
- [保活、驱逐与故障检测](/notes/source/java/storage/hikaricp/eviction-keepalive/)
