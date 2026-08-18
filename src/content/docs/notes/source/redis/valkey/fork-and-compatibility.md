---
title: 分叉与兼容性
description: Valkey 如何在产品身份变化后维持协议、数据与工程生态兼容。
category: Database
tags:
  - Source Reading
  - Valkey
  - Compatibility
order: 32
updatedDate: 2026-08-15
difficulty: advanced
status: stable
lastReviewed: 2026-08-15
draft: false
sidebar:
  order: 32
---

分叉后的第一原则不是“所有名字都换掉”，而是区分兼容层级：客户端线上的协议兼容、持久化与数据语义兼容，以及构建和运维生态兼容。Valkey 的源码和 README 同时保留新身份与 Redis 兼容线索，正是这个取舍的结果。

<!-- more -->

## 三层兼容模型

```text
协议层     RESP、命令参数、错误语义、URI
数据层     RDB/AOF 读写、复制与集群交互
工程层     redis-server 名称、Redis/Valkey 链接、构建脚本
```

## 版本宏为什么双轨存在

`src/version.h` 同时定义 `VALKEY_VERSION` 和 `REDIS_VERSION 7.2.4`。前者用于产品版本与发布身份，后者为仍需判断 Redis 兼容行为的代码保留基线。单纯把所有 `REDIS_*` 符号机械替换成 `VALKEY_*`，会破坏模块 API、脚本和已有构建逻辑。

## 工程生态的兼容

README 仍说明可通过 Redis 命名符号启动，支持 Redis/Valkey URI、TLS 和 RDMA 等构建与连接入口。这种兼容不是“品牌没有变化”，而是降低迁移成本：老的脚本、容器入口和客户端配置不必在同一天全部改名。

```text
old tooling/config
      | redis-server name / redis:// URI
      v
Valkey process
      | VALKEY_VERSION = new identity
      | REDIS_VERSION  = compatibility reference
```

## 为什么不承诺无限兼容

兼容层越厚，维护成本越高。Valkey 可以保持线协议和核心数据语义，却不应假设所有 Redis 私有实现、模块 ABI、未文档化错误文本都永久稳定。`src/version.h` 的双轨更像“有意识的迁移边界”，不是无限期的别名承诺。

## 边界与坑

- 客户端看到能连通，不等于所有命令、模块和集群拓扑行为完全一致。
- 依赖 Redis 私有符号或未文档化内存布局的模块，不能只靠 RESP 兼容判断可迁移。
- 版本比较必须明确比较的是 Valkey 产品版本还是 Redis 兼容基线，不能混用。

## 可迁移知识

分叉项目应把兼容性写成矩阵，而不是一句“兼容”。对每层列出保持项、变化项和测试证据；在代码中保留兼容宏或适配器，把迁移成本集中在边界处。

> 面试锚点：为什么 Valkey 还保留 Redis 版本宏？协议兼容、数据兼容和 ABI 兼容有什么区别？

## Related

- [总体架构](/notes/source/redis/valkey/architecture/)
- [IO Threads 队列与任务生命周期](/notes/source/redis/valkey/io-threads/)
- [Redis 系索引](../)


