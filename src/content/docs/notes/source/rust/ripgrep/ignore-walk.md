---
title: ripgrep ignore-aware 并行遍历
description: WalkBuilder、gitignore 规则、目录裁剪和 worker 遍历模型。
category: Backend
tags: [Source Reading, ripgrep, Rust, Ignore, Parallelism]
order: 82
updatedDate: 2026-08-18
difficulty: advanced
status: stable
lastReviewed: 2026-08-18
draft: false
sidebar:
  order: 82
---

ripgrep 的“递归搜索”首先是一个策略化文件遍历器：它同时理解 gitignore、hidden、遵循 symlink、glob、文件类型和权限错误，再把合格的 `DirEntry` 交给搜索层。

<!-- more -->

## Walker 结构

```text
WalkBuilder
├─ overrides / types / hidden / gitignore options
├─ max_filesize / follow_links / same_file_system
├─ thread count / channel
└─ build / run
       |
     Worker::run -> run_one(Work)
       |
     DirEntry / Error events
```

坐标：`WalkBuilder` 在 `crates/ignore/src/walk.rs:488`；运行入口 `run()` 在 `:1428`；目录读取在 `:1616`；`Worker` 在 `:1721`；worker 主循环在 `:1761`，单个 work 处理在 `:1769`；core 构造 walker 在 `crates/core/flags/hiargs.rs:885`。

## 规则优先级

遍历器不是遇到 `.gitignore` 就简单跳过：规则有来源、深度、白名单/反向规则和 override。目录级忽略可以减少进入子树的成本，但反向规则可能要求继续访问目录，因此 walker 必须保留足够上下文。

## 并行 ownership

每个 worker 拥有自己的目录读取状态和规则上下文；通过 channel 把 `DirEntry` 或 error 发给消费者。共享的不是整个 walker，而是不可变配置和事件通道，从而减少锁竞争。

## 为什么过滤要早

**替代方案**：先把所有路径收集出来，再交给 matcher 过滤。

**为什么不行**：被忽略的大目录可能包含数十万文件；晚过滤已经付出了目录读取、stat、路径分配和 channel 成本。

**证据**：`WalkBuilder` 将 hidden、gitignore、glob、type 和 max filesize 作为遍历策略，worker 在产生 entry 的过程中执行裁剪。

## 错误策略

权限错误、损坏 symlink、读取失败不一定应终止整个搜索。walker 将错误作为事件交给上层，由 core 根据 `--no-messages`、是否标准输入和 exit policy 决定输出与退出。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| `--no-ignore` 仍漏文件 | 还有 hidden/type/size 过滤 | ignore 不是唯一策略 | 分别检查各类过滤 flag |
| 白名单规则不生效 | 父目录已被裁剪 | 进入目录前无法发现反向规则 | 从规则根目录执行并保留 parent context |
| follow symlink 后循环 | 遍历不结束 | 图结构不再是树 | 使用 same-file-system/visited 策略 |
| worker 数量盲目增加 | 变慢 | IO、锁和 printer 成为瓶颈 | 按磁盘和 workload 基准调节 |

> **面试锚点**
> - ignore-aware walker 为什么不能用简单递归？
> - 过滤为什么必须尽量前移？
> - 并行 worker 如何避免共享可变遍历状态？

## Related

- [CLI 与搜索流水线](/notes/source/rust/ripgrep/cli-pipeline/)
- [Searcher 与 Sink](/notes/source/rust/ripgrep/searcher-sink/)
- [Tokio 调度器](/notes/source/rust/tokio/scheduler/)
