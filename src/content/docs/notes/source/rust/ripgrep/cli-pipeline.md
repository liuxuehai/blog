---
title: ripgrep CLI 与搜索流水线
description: rg 参数、搜索模式、串行/并行分支和核心组件组装过程。
category: Backend
tags: [Source Reading, ripgrep, Rust, CLI]
order: 81
updatedDate: 2026-08-24
difficulty: advanced
status: stable
lastReviewed: 2026-08-24
draft: false
sidebar:
  order: 81
---

`rg` 的主函数不直接“搜索一个文件”，而是先把 flag 组合压缩成 `HiArgs` 和 `SearchMode`，再构造 matcher、searcher、printer、walker，最后选择串行或并行执行。

<!-- more -->

## 先给答案：rg 的主函数不直接“搜索一个文件”，而是先把 flag 组合压缩成 HiArgs 和 SearchMod…

rg 的主函数不直接“搜索一个文件”，而是先把 flag 组合压缩成 HiArgs 和 SearchMode，再构造 matcher、searcher、printer、walker，最后选择串行或并行执行。 正文沿“流水线 -> SearchMode 的价值 -> 串行与并行”展开：先确认入口和状态归属，再跟踪控制流或数据流的推进，最后落到对外可观察的结果。

主要失效边界集中在“stdin 与 path 参数混用、开启 PCRE2 后结果差异、并行输出顺序变化”这些场景。它们破坏的是容量、顺序、并发或生命周期前提；排查时应先确认状态是否仍由正确对象持有，再核对推进条件和清理路径。

## 流水线

```text
argv / config
  -> flags parse -> ParseResult<HiArgs>
  -> detect mode: stdin / paths / files / zip / search-only
  -> build matcher + searcher + printer + walker
  -> search() or search_parallel()
  -> exit code: match / no match / error
```

坐标：`run()` 在 `crates/core/main.rs:78`；`search()` 在 `:113`；`search_parallel()` 在 `:166`；`HiArgs::search_worker()` 在 `crates/core/flags/hiargs.rs:705`；`HiArgs::searcher()` 在 `:722`；`HiArgs::walk_builder()` 在 `:885`；文件搜索入口在 `crates/core/search.rs:245`；路径和 reader 搜索在 `:342`、`:362`。

## SearchMode 的价值

不同输入不能共用完全相同的处理：stdin 不需要 walker，单文件可避免目录并行，zip/decompression 需要预处理，索引模式还会改变 matcher 来源。先决定模式，再构造组件，避免所有路径都付出最大复杂度。

## 串行与并行

| 模式 | 适用 | 主要成本 |
| --- | --- | --- |
| sequential | stdin、单文件、小目录、需要稳定顺序 | 不能隐藏 IO 延迟 |
| parallel | 多文件、大目录、CPU/IO 可并行 | channel、排序/输出协调 |

并行不是简单把 `search_path` 放进 rayon：遍历 worker、搜索 worker 与 printer 之间要明确 ownership 和错误传播，且要避免终端输出互相穿插。

## 为什么返回 exit code

Unix grep 约定“找到匹配”和“发生错误”不是同一个状态。core 的 run/search 需要把业务结果映射为不同 `ExitCode`，调用者才可在 shell 脚本中区分 no-match 与 failure。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| stdin 与 path 参数混用 | 输入策略不清 | 两种来源的生命周期不同 | 明确 `-` 语义并测试 |
| 开启 PCRE2 后结果差异 | 特性行为变化 | backend 语法/flag 不同 | 输出 matcher backend 与兼容性测试 |
| 并行输出顺序变化 | golden test 不稳定 | 文件完成顺序非遍历顺序 | 使用稳定排序模式或只断言集合 |
| 搜索错误被吞掉 | 误报 no-match | worker 错误与业务结果混合 | 分离 match/no-match/error 通道 |

> **面试锚点**
> - core 为什么先选 SearchMode？
> - no-match 和 error 为什么必须区分？
> - 并行搜索如何协调输出与错误？

## Related

- [ripgrep 整体架构](/notes/source/rust/ripgrep/architecture/)
- [ignore-aware 并行遍历](/notes/source/rust/ripgrep/ignore-walk/)
- [Printer、颜色与输出格式](/notes/source/rust/ripgrep/printer/)
