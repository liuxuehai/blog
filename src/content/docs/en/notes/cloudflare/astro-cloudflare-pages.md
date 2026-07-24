---
title: Deploying Astro to Cloudflare Pages
description: Build configuration, environment variables, and go-live checklist for the current static Astro site on Cloudflare Pages.
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

This project uses Astro static output; Cloudflare Pages only runs the build and hosts `dist/`.

## Pages Build Configuration

After connecting the Git repository in Cloudflare Pages, use the following configuration:

```text
Framework preset: Astro
Build command: pnpm run build
Build output directory: dist
Root directory: /
```

The repository uses `pnpm-lock.yaml` to lock dependencies, and Pages will use pnpm accordingly to install them.

## Production Domain

The production environment must set:

```text
SITE_URL=https://me.983768.xyz
```

`astro.config.mjs` uses this variable to set Astro's `site`:

```js
const site = process.env.SITE_URL ?? 'https://me.983768.xyz';

export default defineConfig({
  site,
});
```

This value affects canonical URLs, RSS, `robots.txt`, and Sitemap. The production environment should always use the official domain.

## Local Build Check

Before pushing, run:

```bash
pnpm run build
```

After the build completes, at least confirm these files exist:

```text
dist/index.html
dist/rss.xml
dist/robots.txt
dist/sitemap-index.xml
dist/_headers
```

The Pagefind search index is also generated during the build phase. If there are issues with Content Schema, internal links, or Starlight pages, they should be handled before deployment.

## Preview vs. Production

Cloudflare Pages creates preview URLs for branches and Pull Requests. It's recommended to split checks into two layers:

- Preview: Check page structure, mobile layout, dark mode, and internal links
- Production: Check custom domain, canonical, RSS, Sitemap, and cache response headers

Preview domains should not replace the production `SITE_URL`; otherwise, generated site metadata will point to temporary addresses.

## Limitations of Static Sites

The current site doesn't need SSR, so no Cloudflare adapter is required. If API routes or authentication pages that must run at request time are added later, evaluate `@astrojs/cloudflare` at that point — don't introduce runtime complexity prematurely.

## Related

- [Cloudflare Pages Security Headers and Caching](/en/notes/cloudflare/pages-headers-cache/)
- [Why This Site Chose Astro](/en/notes/astro/why-astro/)
