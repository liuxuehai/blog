---
title: ripgrep Searcher 与 Sink
description: Searcher 如何按 buffer/line 读取输入，并通过 Sink 抽象传递匹配事件。
category: Backend
tags: [Source Reading, ripgrep, Rust, Searcher]
order: 84
updatedDate: 2026-08-18
difficulty: advanced
status: stable
lastReviewed: 2026-08-18
draft: false
sidebar:
  order: 84
---

`Searcher` 负责读取字节流、识别行边界、调用 matcher 并处理 context/multiline；`Sink` 负责消费事件。二者分离让相同搜索逻辑可连接普通文本、JSON printer、统计器或测试 sink。

<!-- more -->

## 调用链

```text
Searcher::search_path
  -> open/decompress/file reader
  -> search_reader
  -> buffer fill + line boundaries
  -> Matcher find spans
  -> Sink::begin / matched / context / end
  -> printer output
```

坐标：`Searcher::Config` 在 `crates/searcher/src/searcher/mod.rs:151`；`SearcherBuilder` 在 `:298`；`Searcher` 在 `:597`；`search_path()` 在 `:643`；`search_file()` 在 `:665`；`search_reader()` 在 `:727`；`search_slice()` 在 `:769`；`Sink` trait 在 `crates/searcher/src/sink.rs:102`。

## buffer 与行状态

Searcher 不要求 reader 一次返回完整文件。它维护 buffer、已消费位置和 line number，在跨 buffer 的行、CRLF、长行、binary detection 与 multiline 模式之间做状态转换。sink 接收到的是语义事件，而不是底层 read 调用。

## Sink 的反压边界

Sink 通常同步消费事件并返回 `Result`；printer 如果写 stdout 失败、下游关闭或用户 pipe 断开，应尽快传播错误，让 worker 停止读取更多文件。事件接口比把所有匹配收集成 Vec 更节省内存。

## 为什么不用 `Vec<Match>`

**替代方案**：Searcher 扫完文件后返回所有命中，再统一格式化。

**为什么不行**：大文件/大量命中会产生峰值内存和额外复制，用户也无法尽早看到结果。

**证据**：`Sink` 在匹配发生时接收 begin/match/context/end 事件，printer 可以流式输出。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| 超长单行 | 内存增长或输出慢 | 行边界无法及时结束 | 配置 max columns/line policy |
| binary 文件 | 输出乱码 | 字节流不适合作为文本 | binary detection 或 `-a` 明确覆盖 |
| broken pipe | 搜索继续大量读取 | sink 错误未传播 | 将 BrokenPipe 视为停止信号 |
| multiline 与 context 混用 | 行号/范围错乱 | 事件跨行 | 使用专门测试覆盖边界 |

> **面试锚点**
> - Searcher 与 Sink 的职责边界？
> - 为什么事件流比收集全部匹配更适合 CLI？
> - 如何处理跨 buffer 的长行和 multiline？

## Related

- [正则、literal 与 matcher](/notes/source/rust/ripgrep/regex-matcher/)
- [Printer、颜色与输出格式](/notes/source/rust/ripgrep/printer/)
- [ignore-aware 并行遍历](/notes/source/rust/ripgrep/ignore-walk/)
