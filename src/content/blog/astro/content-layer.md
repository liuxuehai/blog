---
title: "把个人网站改造成 Content Layer"
description: "记录这个 Astro 个人网站如何把 Blog、Notes、RSS、分类和标签统一到一套内容层。"
pubDate: 2026-07-12
category: Astro
tags:
  - Astro
  - Content Collection
  - Starlight
featured: true
draft: false
---

这个网站最初只是一个普通的 Astro Blog 结构。随着 Blog、Knowledge、Projects、RSS、Sitemap 和搜索入口逐渐增加，如果每个页面都直接读取 Markdown，很快就会出现重复逻辑：排序写一遍，草稿过滤写一遍，分类和标签又各写一遍。

所以我把内容读取集中到了 `src/lib/content.ts`。

## 内容类型

目前网站主要有两类内容：

- Blog：偏时间线，用于文章、实践记录和项目复盘。
- Notes：偏知识库，用于持续更新的技术笔记。

Blog 有发布时间、分类、标签、精选、草稿和系列字段。Notes 则更关注分类、标签、排序和更新时间。

## 分类统一

分类统一放在 `src/data/taxonomy.ts`，这样 Blog、Notes、首页 Knowledge、分类页和 Starlight 都可以共享同一套概念。

这可以避免一个很常见的问题：文章里写了 `Astroo`，页面却悄悄生成了错误分类。现在 schema 会直接报错。

## 页面只消费函数

页面层不再直接调用 `getCollection()`，而是通过内容层函数读取数据：

```ts
getLatestPosts()
getPostsByCategory()
getPostsByTag()
getRelatedPosts()
getNoteCountsByCategory()
```

这样后续要调整草稿过滤、排序、相关文章算法或 RSS 输出，只需要改一个地方。

## 下一步

接下来这个内容层还可以继续服务搜索、相关文章、系列文章、标签页和站内推荐。它不是为了复杂而复杂，而是为了让网站以后持续写内容时不需要反复改页面代码。
