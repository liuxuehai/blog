---
title: Astro 部署到 Cloudflare Pages
description: 当前静态 Astro 网站在 Cloudflare Pages 上的构建、环境变量和上线检查。
category: Cloudflare
tags:
  - Cloudflare
  - Astro
  - Deployment
order: 31
updatedDate: 2026-07-13
difficulty: beginner
status: stable
lastReviewed: 2026-07-13
draft: false
sidebar:
  order: 31
---

这个项目使用 Astro 静态输出，Cloudflare Pages 只负责执行构建并托管 `dist/`。

## Pages 构建配置

在 Cloudflare Pages 中连接 Git 仓库后，使用以下配置：

```text
Framework preset: Astro
Build command: pnpm run build
Build output directory: dist
Root directory: /
```

仓库使用 `pnpm-lock.yaml` 锁定依赖，Pages 会据此使用 pnpm 安装依赖。

## 生产域名

生产环境必须设置：

```text
SITE_URL=https://your-domain.com
```

`astro.config.mjs` 使用这个变量设置 Astro 的 `site`：

```js
const site = process.env.SITE_URL ?? 'https://example.com';

export default defineConfig({
  site,
});
```

这个值会影响 canonical URL、RSS、`robots.txt` 和 Sitemap。上线前不能继续使用默认的 `example.com`。

## 本地构建检查

推送前执行：

```bash
pnpm run build
```

构建完成后至少确认这些文件存在：

```text
dist/index.html
dist/rss.xml
dist/robots.txt
dist/sitemap-index.xml
dist/_headers
```

Pagefind 搜索索引也会在构建阶段生成。若 Content Schema、内部链接或 Starlight 页面存在问题，应在部署前处理。

## Preview 与 Production

Cloudflare Pages 会为分支和 Pull Request 创建预览地址。建议把检查分成两层：

- Preview：检查页面结构、移动端布局、暗色模式和内部链接
- Production：检查自定义域名、canonical、RSS、Sitemap 和缓存响应头

预览域名不应该替代生产环境的 `SITE_URL`，否则生成的站点元数据会指向临时地址。

## 静态站点的限制

当前站点不需要 SSR，因此不需要 Cloudflare adapter。未来如果增加必须在请求时运行的 API 或认证页面，再评估 `@astrojs/cloudflare`，不要提前引入运行时复杂度。

## Related

- [Cloudflare Pages 安全响应头与缓存](/notes/cloudflare/pages-headers-cache/)
- [为什么这个网站选择 Astro](/notes/astro/why-astro/)
