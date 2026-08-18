---
title: Radix 树路由匹配
description: Gin 如何用压缩 Radix tree 处理静态路由、参数路由、catch-all 和 trailing slash。
category: Backend
tags:
  - Source Reading
  - Gin
  - Radix Tree
order: 12
updatedDate: 2026-08-15
difficulty: advanced
status: stable
lastReviewed: 2026-08-15
draft: false
sidebar:
  order: 12
---

Gin 的路由树不是“每段一个节点”的普通 Trie，而是把连续静态字符压缩成一条边，并把动态段放到分支末端。

<!-- more -->

## 设计概览

```text
/                     root
└── /users             static edge
    ├── /new           static child
    └── /              param branch :id
        └── /posts     static child

/files/*path
└── /                  catch-all marker
    └── /*path         terminal wildcard
```

节点字段集中在 `tree.go:99`：`path` 是压缩边，`indices` 是孩子首字节索引，`wildChild` 标记动态孩子，`priority` 用于分支重排。

## 注册路径

`node.addRoute` 从 `tree.go:135` 开始，先计算最长公共前缀；如果新路径只覆盖节点的一部分，就在 `tree.go:154` 附近拆边，把旧节点下沉为 child。静态分支通过 `indices` 查找，见 `tree.go:191`；新分支插入后调用 `incrementChildPrio`，见 `tree.go:110`。

`insertChild` 在 `tree.go:288` 专门处理 wildcard。`findWildcard` 在 `tree.go:239` 检查 `:` 和 `*`，因此同一个 segment 中出现两个 wildcard、wildcard 没有名字，都会在注册期 panic，而不是把错误留到请求期。

参数节点要求按单个路径段消费字符：`tree.go:323` 创建 `param` 节点，后续 `/posts` 会再挂一个静态 child。catch-all 必须位于路径末尾，`tree.go:350` 到 `tree.go:390` 会拒绝不合法位置。

## 查询路径

`getValue` 在 `tree.go:418` 进入循环，先比较当前压缩前缀，再优先尝试静态孩子，见 `tree.go:432`。如果静态分支失败，才使用末尾 wildcard child；参数值在 `tree.go:477` 到 `tree.go:526` 中截取到下一个 `/`，catch-all 则在 `tree.go:531` 到 `tree.go:560` 吞掉剩余路径。

静态优先并不意味着动态分支被丢弃：匹配过程中会把候选保存为 `skippedNode`，见 `tree.go:437`，静态路径后续失败时回滚，见 `tree.go:451`。这保证了 `/users/new` 不会被 `/users/:id` 抢先匹配。

`nodeValue` 同时返回 handlers、params、`tsr` 和 `fullPath`，定义见 `tree.go:407`。`Engine.handleHTTPRequest` 在 `gin.go:690` 接收该结果；命中后把参数放入 `Context`，然后执行 chain。

## 优先级与复杂度

`priority` 在注册沿途递增，`incrementChildPrio` 会把高频分支向前移动，并同步调整 `indices`，见 `tree.go:110`。因此常见分支可以更早命中，但这不是运行期统计，而是注册路径数量产生的结构信息。

### 为什么用压缩 Radix tree 而不是逐段 Trie

**替代方案**：每个字符或每个 segment 固定创建一个节点。
**为什么不行**：大量静态前缀会产生更多节点和指针跳转，查询还要重复遍历相同前缀。
**证据**：`node.path` 保存最长公共边，`addRoute` 在 `tree.go:148` 进行前缀拆分；查询在 `tree.go:426` 一次比较整段 prefix。

## 边界与踩坑

| 场景 | 现象 | 原因 | 规避 |
| --- | --- | --- | --- |
| `:id` 后继续写同段字符 | 注册 panic 或路径冲突 | 参数必须独占一个 segment | 使用 `/:id/detail` |
| `*path` 不在末尾 | 注册 panic | catch-all 需要消费全部剩余路径 | 把 catch-all 放最后 |
| `/user/new` 与 `/user/:id` | 需要静态优先 | 动态节点是回退分支 | 不依赖注册顺序表达优先级 |
| 编码路径参数 | 参数值与 URL 原文不同 | `UnescapePathValues` 默认开启 | 需要签名校验时明确配置 |
| 末尾 `/` 不一致 | 发生 301/307 重定向 | `value.tsr` 被置位 | 明确 `RedirectTrailingSlash` 策略 |

## 可迁移知识

- 压缩 Trie 适合高共享前缀的字符串索引，如命令路由、文件路径和协议字段。
- “静态优先、动态回退”是确定性解析器常用的消歧策略。
- 查询函数返回诊断信息而不只返回结果，可把重定向、规范化和调试信息放在一次遍历里完成。

> **面试锚点**
> - Radix tree 相比 Trie 压缩了什么？
> - Gin 如何保证 `/new` 优先于 `/:id`？
> - `:param` 与 `*catchAll` 的匹配范围有什么区别？
> - 路由注册时为什么可能直接 panic？

## Related

- [整体架构](/notes/source/go/gin/architecture/)
- [中间件与 Abort](/notes/source/go/gin/middleware-and-abort/)
- [Context 复用与 sync.Pool](/notes/source/go/gin/context-pool/)
