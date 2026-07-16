# Max

个人技术网站，基于 Astro、Starlight 和 Content Collections 构建。

## 本地开发

```bash
pnpm install
pnpm run dev
```

## 构建

```bash
pnpm run build
```

构建产物输出到 `dist/`。

## 内容结构

```text
src/content/
├── blog/       # 博客文章
├── docs/       # Starlight Knowledge / Notes
├── changelog/  # 网站和项目更新记录
└── templates/  # 写作模板，不参与内容构建
```

分类和 slug 统一维护在：

```text
src/data/taxonomy.ts
src/data/knowledge.ts
src/lib/content.ts
```

页面层不要直接调用 `getCollection()`，统一通过 `src/lib/content.ts` 获取内容。

## 新增内容

博客文章使用：

```text
src/content/templates/blog-post.md
```

Knowledge / Notes 使用：

```text
src/content/templates/note.md
```

新增内容时先保持 `draft: true`，确认页面、RSS 和搜索表现正常后再改为 `draft: false`。

## Cloudflare Pages

推荐使用 Cloudflare Pages 部署当前静态站点。

Cloudflare Pages 构建配置：

```text
Framework preset: Astro
Build command: pnpm run build
Build output directory: dist
Root directory: /
```

生产环境变量：

```text
SITE_URL=https://me.983768.xyz
```

`SITE_URL` 会用于 Astro 的 `site` 配置，从而影响 canonical URL、RSS、robots.txt 和 sitemap。

## 部署前检查

```bash
pnpm run build
```

确认构建完成后检查：

```text
dist/index.html
dist/rss.xml
dist/robots.txt
dist/sitemap-index.xml
```

## Cloudflare Headers

`public/_headers` 会在 Cloudflare Pages 构建时复制到 `dist/_headers`，用于：

- 给全站添加基础安全响应头
- 给 `/_astro/*` 和 `/fonts/*` 设置长期缓存
- 给 RSS、robots 和 sitemap 设置短缓存
