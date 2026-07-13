---
title: Starlight 作为网站中的 Knowledge 模块
description: 在保留 Astro 首页和 Blog 的前提下，只让 Starlight 管理 /notes 路由。
category: Astro
tags:
  - Astro
  - Starlight
  - Knowledge
order: 22
updatedDate: 2026-07-13
difficulty: intermediate
status: stable
lastReviewed: 2026-07-13
draft: false
sidebar:
  order: 22
---

Starlight 不必接管整个网站。这个项目保留自定义首页、Blog、Projects 和 About，只把 `/notes` 交给 Starlight。

## 路由职责

```text
/            自定义 Astro 首页
/blog        时序文章
/projects    项目
/about       关于
/notes       Starlight Knowledge
```

这个边界让首页继续使用自己的视觉系统，同时让知识库获得侧边栏、目录、搜索和文档导航。

## 内容目录

Starlight 的文档 Collection 位于：

```text
src/content/docs/notes/
```

每个一级目录对应统一的 Knowledge 分类：

```text
notes/
├── ai/
├── astro/
├── cloudflare/
├── frontend/
├── backend/
├── database/
├── devops/
└── linux/
```

分类值由 `src/data/taxonomy.ts` 统一定义，并在 Content Schema 中使用 `z.enum()` 校验。拼错分类会在构建阶段失败，而不是生成一个孤立页面。

## 配置挂载

Starlight 作为 Astro integration 注册：

```js
starlight({
  title: 'Knowledge',
  defaultLocale: 'zh-CN',
  sidebar: [
    {
      label: 'Knowledge',
      items: [
        { label: 'Overview', link: '/notes/' },
        { label: 'AI', link: '/notes/ai/' },
        { label: 'Astro', link: '/notes/astro/' },
      ],
    },
  ],
})
```

侧边栏维护稳定的一级分类，分类页再承担具体笔记的索引职责。这样新增笔记时，不必把所有页面都堆进全局导航。

## 与主站共享什么

主站与 Starlight 共享的是内容模型和主题状态，不强行共享同一套页面 Layout。

- 首页通过 `getCollection("docs")` 的封装统计 Notes
- 分类 slug 来自同一份 taxonomy
- 主题状态使用 Starlight 的 `starlight-theme` 本地存储键
- 构建时统一生成 Pagefind 搜索索引

这比把 Starlight HTML 再包进 `BaseLayout` 更稳定，因为两套页面系统各自保留清晰的布局所有权。

## 新增一篇笔记

1. 从 `src/content/templates/note.md` 创建 Markdown。
2. 使用 taxonomy 中已有的 `category`。
3. 初稿保持 `draft: true`。
4. 运行 `pnpm run build` 检查 Schema、链接和搜索索引。
5. 发布时改为 `draft: false`，并在所属分类页添加入口。

## Related

- [为什么这个网站选择 Astro](/notes/astro/why-astro/)
- [Cloudflare Pages 部署流程](/notes/cloudflare/astro-cloudflare-pages/)
