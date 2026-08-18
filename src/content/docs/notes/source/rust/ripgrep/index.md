---
title: ripgrep
description: ripgrep 源码解析总览：crate 分层、ignore 遍历、正则匹配、并行搜索、输出与终端性能。
category: Backend
tags: [Source Reading, ripgrep, Rust, Search]
order: 8
updatedDate: 2026-08-18
difficulty: advanced
status: stable
lastReviewed: 2026-08-18
draft: false
sidebar:
  order: 8
---

ripgrep 的性能不是单一正则优化的结果，而是 CLI、ignore-aware 遍历、预过滤、正则 matcher、字节搜索器、并行 worker 与 printer 的协同：尽可能少读文件、少做 UTF-8 转换、少在线程间传递大对象。

<!-- more -->

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
