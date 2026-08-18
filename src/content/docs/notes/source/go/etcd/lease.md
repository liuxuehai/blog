---
title: Lease 与 KeepAlive
description: etcd lessor 的 TTL、主节点、过期队列、级联删除和 checkpoint。
category: Backend
tags: [Source Reading, etcd, Go, Lease]
order: 36
updatedDate: 2026-08-16
difficulty: advanced
status: stable
lastReviewed: 2026-08-16
draft: false
sidebar:
  order: 36
---

Lease 为 key 提供自动过期语义，常用于服务注册、临时锁和 leader 选举。etcd 的 lessor 负责本地 TTL 管理，但真正的 lease grant、revoke 和绑定键删除仍通过一致性状态机完成。

<!-- more -->

## 生命周期

```text
LeaseGrant -> leaseMap + persist
     |
     +--> Attach(key)
     |
KeepAlive -> Renew -> refresh expiry
     |
expiry queue -> ExpiredLeasesC -> Revoke
                                      |
                                      +--> sorted range deletes
                                      +--> delete lease metadata
                                      +--> Watch delete events
```

`NewLessor` 初始化 lease map、过期通知队列、checkpoint heap 并启动 `runLoop`：`server/lease/lessor.go:208-247`。Grant、Revoke、Checkpoint、Renew 入口在 `:281-458`。

## primary lessor

只有 Raft leader 作为 primary 管理 lease 过期和续租调度：`isPrimary` 位于 `server/lease/lessor.go:249-279`。follower 可以持有恢复出来的 lease，但不会独立决定过期删除，避免多个节点同时产生不同的删除提案。

## Revoke 的事务边界

Revoke 会先收集并排序 lease 绑定的 keys，再通过 range deleter 删除，最后在同一个 backend transaction 中删除 lease 元数据：`server/lease/lessor.go:326-365`。排序是为了让所有成员对批量删除产生一致的 backend hash。

## checkpoint

长 TTL lease 可以定期持久化剩余 TTL，避免 leader 切换后恢复出过大的有效期。`Checkpoint` 更新 remaining TTL，并根据版本/配置决定是否写入 backend：`server/lease/lessor.go:367-394`。

## 为什么过期删除不能只靠本地 timer

**替代方案**：每个节点 timer 到期后直接删除绑定 key。
**为什么不行**：网络分区和调度差异会造成不同节点的删除顺序、事件和 backend hash 不同。
**设计**：本地 timer 只负责发现到期 lease，删除动作被转成 Raft 提案，由状态机统一应用。

## 边界与踩坑

| 场景 | 风险 | 处理 |
| --- | --- | --- |
| KeepAlive 发给 follower | 续租失败或延迟 | 客户端通过 endpoint 选择和重试找到 primary |
| 删除键后遗漏 lease 元数据 | 反复过期/资源泄漏 | 同一事务删除 key 和 lease |
| TTL 与 wall clock 混淆 | 切主后期限异常 | 使用 remaining TTL/checkpoint 语义 |
| lease 绑定大量 key | revoke 阻塞 | 控制绑定规模并监控 revoke backlog |

## 可迁移知识

时间驱动的业务事件也要经过一致性状态机；本地时钟可以触发提案，但不能直接改变共享状态。

> **面试锚点**
> - 为什么 etcd 只有 primary lessor 负责过期？
> - Lease revoke 如何保证 key 删除和 lease 删除原子关联？
> - checkpoint 解决 leader 切换中的什么问题？

## Related

- [Watch 事件流](/notes/source/go/etcd/watch/)
- [Raft 请求与应用](/notes/source/go/etcd/raft/)
- [ZooKeeper 会话与临时节点](/notes/source/java/base/zookeeper/session/)
