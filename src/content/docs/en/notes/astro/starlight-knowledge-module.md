---
title: Starlight as a Knowledge Module in the Site
description: Keeping Astro homepage and Blog intact while letting Starlight manage only the /notes routes.
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

Starlight doesn't have to take over the entire site. This project keeps custom homepage, Blog, Projects, and About, and hands only `/notes` to Starlight.

## Route Responsibilities

```text
/            Custom Astro homepage
/blog        Time-sequential articles
/projects    Projects
/about       About
/notes       Starlight Knowledge
```

This boundary lets the homepage continue using its own visual system while giving the knowledge base sidebar, table of contents, search, and document navigation.

## Content Directory

Starlight's docs Collection lives at:

```text
src/content/docs/notes/
```

Each top-level directory corresponds to a unified Knowledge category:

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

Category values are centrally defined in `src/data/taxonomy.ts` and validated with `z.enum()` in the Content Schema. A misspelled category fails at build time rather than generating an orphan page.

## Configuration Mount

Starlight registers as an Astro integration:

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

The sidebar maintains stable top-level categories, and category pages take on the responsibility of indexing specific notes. This way, adding a new note doesn't require pushing every page into the global navigation.

## What's Shared with the Main Site

The main site and Starlight share the content model and theme state, not a forced common page layout.

- The homepage counts Notes through a wrapper around `getCollection("docs")`
- Category slugs come from the same taxonomy
- Theme state uses Starlight's `starlight-theme` local storage key
- Pagefind search index is generated in a unified build

This is more stable than wrapping Starlight HTML in `BaseLayout`, because both page systems retain clear ownership of their own layouts.

## Adding a New Note

1. Create Markdown from `src/content/templates/note.md`.
2. Use an existing `category` from taxonomy.
3. Keep the initial draft as `draft: true`.
4. Run `pnpm run build` to check Schema, links, and search index.
5. Change to `draft: false` for publishing, and add an entry in the relevant category page.

## Related

- [Why This Site Chose Astro](/en/notes/astro/why-astro/)
- [Deploying Astro to Cloudflare Pages](/en/notes/cloudflare/astro-cloudflare-pages/)
