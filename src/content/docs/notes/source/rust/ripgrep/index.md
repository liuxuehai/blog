---
title: ripgrep
description: ripgrep 源码解析总览：crate 分层、ignore 遍历、正则匹配、并行搜索、输出与终端性能。
category: Backend
tags: [Source Reading, ripgrep, Rust, Search]
order: 8
updatedDate: 2026-08-22
difficulty: advanced
status: stable
lastReviewed: 2026-08-22
draft: false
sidebar:
  order: 8
---

ripgrep 的性能不是单一正则优化的结果，而是 CLI、ignore-aware 遍历、预过滤、正则 matcher、字节搜索器、并行 worker 与 printer 的协同：尽可能少读文件、少做 UTF-8 转换、少在线程间传递大对象。

<!-- more -->

## 本册问题地图

ripgrep 要沿着“发现文件 → 过滤路径 → 选择 matcher → 扫描文本 → 输出结果”来读：

1. **ignore-aware 遍历为何重要？** 搜索速度和结果正确性都取决于是否跳过 `.gitignore`、隐藏文件和二进制文件，遍历不是简单递归目录。
2. **literal prefilter 解决什么？** 正则匹配前先找固定字面量，能快速排除大量不可能命中的行；没有字面量时才退回更通用 matcher。
3. **Searcher 与 Sink 如何解耦？** Searcher 负责扫描和匹配，Sink 负责行号、颜色、上下文和写出格式，同一搜索结果可服务不同输出模式。
4. **并行为什么不能只开更多线程？** 文件粒度并行需要协调输出顺序、错误传播和共享终端，过度并行还会被磁盘和 stdout 反压。
5. **结果为空如何排查？** 先确认遍历过滤，再确认编码/二进制判断，最后看 matcher 选型和输出过滤，避免把“没搜到”误判成正则错误。

## 版本快照

| 项 | 值 |
| --- | --- |
| 仓库 | `BurntSushi/ripgrep` |
| 本地路径 | `E:\source\rust\ripgrep` |
| 分支 | `master` |
| Commit | `3fce3b5b`（2026-08-04） |
| ripgrep | `15.2.0` |
| MSRV | Rust `1.96` |

## crate 地图

```text
crates/core       rg CLI、参数、模式选择、主调度
├─ grep            matcher + searcher + printer facade
├─ regex            Rust regex backend
├─ pcre2            optional PCRE2 backend
├─ matcher         Matcher trait / literal prefilter
├─ searcher        line/stream search state machine + Sink
├─ printer         text/json/summary/color output
├─ ignore          gitignore-aware parallel walker
└─ globset         glob compilation and matching
```

关键坐标：二进制入口在 `crates/core/main.rs`；主 run/search 在 `:78`、`:113`、`:166`；matcher trait 在 `crates/matcher/src/lib.rs:546`；Searcher 在 `crates/searcher/src/searcher/mod.rs:597`；WalkBuilder 在 `crates/ignore/src/walk.rs:488`；Sink trait 在 `crates/searcher/src/sink.rs:102`。

## 主调用链

```text
rg args
  -> flags::ParseResult<HiArgs>
  -> search mode / matcher / printer / WalkBuilder
  -> sequential or parallel walk
  -> Searcher::search_path / search_reader
  -> Matcher + Sink
  -> printer writes line/json/summary
```

## 本册目录

- [整体架构](/notes/source/rust/ripgrep/architecture/)
- [CLI 与搜索流水线](/notes/source/rust/ripgrep/cli-pipeline/)
- [ignore-aware 并行遍历](/notes/source/rust/ripgrep/ignore-walk/)
- [正则、literal 与 matcher](/notes/source/rust/ripgrep/regex-matcher/)
- [Searcher 与 Sink](/notes/source/rust/ripgrep/searcher-sink/)
- [Printer、颜色与输出格式](/notes/source/rust/ripgrep/printer/)
- [面试专题](/notes/source/rust/ripgrep/interview/)

## Related

- [Rust 源码解析](/notes/source/rust/)
- [Tokio 调度器](/notes/source/rust/tokio/scheduler/)
- [Clap 解析状态机](/notes/source/rust/clap/parser-state-machine/)
