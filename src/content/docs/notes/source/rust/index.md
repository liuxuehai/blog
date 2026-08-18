---
title: Rust 源码解析
description: Tokio、Axum、Hyper、Actix Web、Serde、Clap、SQLx 与 ripgrep 的源码解析索引。
category: Backend
tags: [Source Reading, Rust]
order: 4
updatedDate: 2026-08-18
difficulty: advanced
status: learning
lastReviewed: 2026-08-18
draft: false
sidebar:
  order: 4
---

Rust 分组聚焦异步运行时、网络框架、序列化、命令行解析、数据库访问和高性能搜索工具，重点观察所有权、类型系统与零成本抽象如何进入工程实现。

<!-- more -->

## 分册

| 仓库 | 主题 | 状态 |
| --- | --- | --- |
| [Tokio](/notes/source/rust/tokio/) | Future/Waker、调度器、IO driver、定时器与同步原语 | ✅ 9 篇 |
| [Axum](/notes/source/rust/axum/) | Tower、Extractor、Handler、路由与状态共享 | ✅ 8 篇 |
| [Hyper](/notes/source/rust/hyper/) | HTTP/1 状态机、HTTP/2、Body 与单连接 API | ✅ 8 篇 |
| [Actix Web](/notes/source/rust/actix-web/) | Worker、ServiceFactory、Extractor、中间件与 WebSocket Actor | ✅ 9 篇 |
| [Serde](/notes/source/rust/serde/) | 数据模型、derive、Serializer/Deserializer 与零成本抽象 | ✅ 8 篇 |
| [Clap](/notes/source/rust/clap/) | Command/Arg、解析状态机、derive、帮助与补全 | ✅ 8 篇 |
| [SQLx](/notes/source/rust/sqlx/) | 编译期 SQL 校验、异步驱动、连接池与类型映射 | ✅ 8 篇 |
| [ripgrep](/notes/source/rust/ripgrep/) | crate 划分、并行遍历、正则搜索与 IO | ✅ 8 篇 |

## 阅读顺序

先读 Tokio，建立 Rust async 的执行模型；再读 Hyper 与 Axum，理解协议层和 Web 抽象如何叠加；随后对照 Actix Web 的运行模型，最后进入 Serde、Clap、SQLx 和 ripgrep 的类型驱动设计。

## Related

- [源码解析总览](/notes/source/)
- [Go 源码解析](/notes/source/go/)
- [Netty 源码解析](/notes/source/java/base/netty/)




