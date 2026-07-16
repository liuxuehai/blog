---
title: Cloudflare Pages 安全响应头与缓存
description: 使用 public/_headers 配置基础安全响应头和静态资源缓存策略。
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

Cloudflare Pages 会读取构建产物中的 `_headers`。当前项目把源文件放在 `public/_headers`，Astro 构建时会原样复制到 `dist/_headers`。

## 基础安全响应头

全站使用：

```text
/*
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=()
```

这些配置分别用于：

- 禁止浏览器猜测资源 MIME 类型
- 禁止页面被其他站点放入 frame
- 限制跨站请求携带的 referrer 信息
- 默认关闭站点不需要的摄像头、麦克风和定位权限

Content Security Policy 没有直接加入基础模板。CSP 需要根据实际脚本、字体、图片和评论系统来源收紧，不能复制一条未经验证的规则后上线。

## 指纹资源长期缓存

Astro 生成的 `/_astro/*` 文件名包含内容指纹，可以安全使用长期缓存：

```text
/_astro/*
  Cache-Control: public, max-age=31536000, immutable

/fonts/*
  Cache-Control: public, max-age=31536000, immutable
```

文件内容变化时，文件名也会变化，因此浏览器可以缓存一年而不影响发布更新。

## 元数据短缓存

RSS、robots 和 Sitemap 会随内容变化，不应使用 immutable：

```text
/rss.xml
  Cache-Control: public, max-age=3600

/robots.txt
  Cache-Control: public, max-age=3600

/sitemap-index.xml
  Cache-Control: public, max-age=3600
```

一小时缓存减少重复请求，同时让搜索引擎和订阅器较快看到更新。

## 上线后验证

部署完成后检查真实响应，而不只是检查仓库文件：

```bash
curl -I https://me.983768.xyz/
curl -I https://me.983768.xyz/_astro/example.css
curl -I https://me.983768.xyz/rss.xml
```

重点确认安全响应头存在，并且带指纹资源与内容索引使用不同缓存策略。

## Related

- [Astro 部署到 Cloudflare Pages](/notes/cloudflare/astro-cloudflare-pages/)
- [Cloudflare](/notes/cloudflare/)
