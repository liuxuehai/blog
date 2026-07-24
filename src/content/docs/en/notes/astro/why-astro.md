---
title: Why This Site Chose Astro
description: "Recording the rationale for choosing Astro from three angles: content model, client-side JavaScript, and deployment approach."
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

This site includes Blog, Knowledge, Projects, and About simultaneously. It needs content-first pages and a small number of reusable interactive components, but it does not need to turn the entire site into a client-side application. Astro's boundaries align precisely with this requirement.

## Selection Criteria

The following constraints were prioritized during selection:

- Markdown and MDX are the primary content sources
- Blog and Notes require different schemas
- Default output is static HTML, minimizing client-side JavaScript
- Pages can still use component-based layouts
- Build output can be deployed directly to Cloudflare Pages

Astro's Content Collections handle content types, `.astro` components handle page organization, and static output handles deployment. There are no additional runtime dependencies between the three parts.

## Why Not a Standalone Blog Template

Typical blog templates organize content around publication dates, but Knowledge consists of continuously maintained notes that should not be displayed purely chronologically.

The current project splits content into two types:

```text
src/content/
├── blog/   # Time-sequential content with pubDate
└── docs/   # Knowledge content organized by category and topic
```

Both content types share titles, descriptions, tags, and draft status, while retaining their own specific fields. This way RSS only handles Blog, Starlight only manages Notes, and the homepage combines both through the content layer.

## JavaScript Boundary

Most of the homepage content is static information that does not require hydration. The theme toggle is a small piece of client-side interactivity; everything else — Hero, Knowledge, Latest Posts, and Projects — is generated at build time.

This default strategy has two direct benefits:

1. First paint does not depend on client-side framework initialization.
2. Page complexity grows with interactivity needs, not with component count.

## Deployment Boundary

The project uses static output:

```js
export default defineConfig({
  site,
  integrations: [starlight(/* ... */)],
});
```

After running `pnpm run build`, pages, RSS, Sitemap, and Pagefind index are all written to `dist/`. Cloudflare Pages only needs to host the build output — no long-running Node.js server is required.

## When It's Not a Good Fit

If the product is primarily a real-time application behind login, has extensive client-side state, or requires backend data access on every request, Astro may not be the sole or most direct choice.

The core of this site is publicly indexable, long-term maintainable content, making static-first an explicit engineering constraint rather than a pursuit of build speed alone.

## Related

- [Starlight as a Knowledge Module in the Site](/en/notes/astro/starlight-knowledge-module/)
- [Deploying Astro to Cloudflare Pages](/en/notes/cloudflare/astro-cloudflare-pages/)
