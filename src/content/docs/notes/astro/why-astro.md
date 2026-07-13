---
title: 为什么这个网站选择 Astro
description: 从内容模型、客户端 JavaScript 和部署方式三个角度记录 Astro 的选型理由。
category: Astro
tags:
  - Astro
  - Architecture
  - Static Site
order: 21
updatedDate: 2026-07-13
difficulty: beginner
status: stable
lastReviewed: 2026-07-13
draft: false
sidebar:
  order: 21
---

这个网站同时包含 Blog、Knowledge、Projects 和 About。它需要内容优先的页面，也需要少量可复用的交互组件，但不需要把整个站点变成客户端应用。Astro 的边界正好符合这个需求。

## 选择标准

选型时优先考虑以下约束：

- Markdown 和 MDX 是主要内容来源
- Blog 与 Notes 需要不同的 Schema
- 默认输出静态 HTML，减少客户端 JavaScript
- 页面仍然可以使用组件化布局
- 构建结果能直接部署到 Cloudflare Pages

Astro 的 Content Collections 负责内容类型，`.astro` 组件负责页面组织，静态输出负责部署。三部分之间没有额外运行时依赖。

## 为什么不是单独的博客模板

普通博客模板通常围绕发布日期组织内容，但 Knowledge 属于持续维护的笔记，不应该完全按时间线展示。

当前项目把内容分成两类：

```text
src/content/
├── blog/   # 有 pubDate 的时序内容
└── docs/   # 按分类和主题维护的知识内容
```

两种内容共享标题、描述、标签和草稿状态，同时保留各自需要的字段。这样 RSS 只处理 Blog，Starlight 只管理 Notes，首页通过内容层组合两者。

## JavaScript 边界

首页的大部分内容是静态信息，不需要 hydration。主题开关是少量客户端交互，其余 Hero、Knowledge、Latest Posts 和 Projects 都在构建时生成。

这个默认策略有两个直接收益：

1. 首屏不依赖客户端框架启动。
2. 页面复杂度随交互需求增长，而不是随组件数量增长。

## 部署边界

项目使用静态输出：

```js
export default defineConfig({
  site,
  integrations: [starlight(/* ... */)],
});
```

执行 `pnpm run build` 后，页面、RSS、Sitemap 和 Pagefind 索引都会写入 `dist/`。Cloudflare Pages 只需要托管构建结果，不需要长期运行 Node.js 服务。

## 什么时候不适合

如果产品主要是登录后的实时应用、存在大量客户端状态，或者每次请求都必须访问后端数据，Astro 不一定是唯一或最直接的选择。

这个网站的核心是可索引、可长期维护的公开内容，因此静态优先是明确的工程约束，而不是单纯追求构建速度。

## Related

- [Starlight 作为网站中的 Knowledge 模块](/notes/astro/starlight-knowledge-module/)
- [Astro 部署到 Cloudflare Pages](/notes/cloudflare/astro-cloudflare-pages/)
