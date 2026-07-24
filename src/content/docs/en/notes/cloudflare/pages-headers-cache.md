---
title: Cloudflare Pages Security Headers and Caching
description: Using public/_headers to configure basic security response headers and static asset caching policies.
category: Cloudflare
tags:
  - Cloudflare
  - Security
  - Cache
order: 32
updatedDate: 2026-07-13
difficulty: intermediate
status: stable
lastReviewed: 2026-07-13
draft: false
sidebar:
  order: 32
---

Cloudflare Pages reads the `_headers` file in the build output. This project places the source file at `public/_headers`, and Astro copies it as-is to `dist/_headers` during the build.

## Basic Security Response Headers

Applied site-wide:

```text
/*
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=()
```

These configurations serve the following purposes:

- Prevent the browser from guessing resource MIME types
- Prevent the page from being framed by other sites
- Limit referrer information sent with cross-origin requests
- Disable camera, microphone, and geolocation permissions by default, which the site doesn't need

Content Security Policy is not included in the base template. CSP needs to be tightened based on actual scripts, fonts, images, and comment system sources — it cannot be copied from an unverified rule and deployed.

## Fingerprinted Asset Long-Term Caching

Astro-generated `/_astro/*` files have content hashes in their filenames, making them safe for long-term caching:

```text
/_astro/*
  Cache-Control: public, max-age=31536000, immutable

/fonts/*
  Cache-Control: public, max-age=31536000, immutable
```

When file content changes, the filename changes too, so browsers can cache for a year without affecting updates.

## Metadata Short Caching

RSS, robots, and Sitemap change with content and should not use `immutable`:

```text
/rss.xml
  Cache-Control: public, max-age=3600

/robots.txt
  Cache-Control: public, max-age=3600

/sitemap-index.xml
  Cache-Control: public, max-age=3600
```

One-hour caching reduces repeated requests while letting search engines and subscribers see updates relatively quickly.

## Post-Deployment Verification

After deployment, check actual responses rather than just repository files:

```bash
curl -I https://me.983768.xyz/
curl -I https://me.983768.xyz/_astro/example.css
curl -I https://me.983768.xyz/rss.xml
```

Focus on confirming that security response headers exist and that fingerprinted assets and content indexes use different caching policies.

## Related

- [Deploying Astro to Cloudflare Pages](/en/notes/cloudflare/astro-cloudflare-pages/)
- [Cloudflare](/en/notes/cloudflare/)
