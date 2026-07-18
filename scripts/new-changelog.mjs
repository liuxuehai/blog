#!/usr/bin/env node

/**
 * Changelog 创建脚本
 *
 * 用法:
 *   node scripts/new.mjs changelog "更新标题" --version 2026.07
 *
 * 选项:
 *   --version, -v    版本号 (格式: YYYY.MM)
 */

import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const args = process.argv.slice(2);
const type = args[0];
const title = args[1];

if (type === "changelog" && !title) {
  console.error(`用法:
  pnpm run new:changelog "更新标题" [--version 2026.07]

选项:
  --version, -v   版本号 (格式: YYYY.MM)`);
  process.exit(1);
}

// 解析选项
function getOption(flag, shortFlag, defaultValue) {
  for (let i = 2; i < args.length; i++) {
    if (args[i] === flag || args[i] === shortFlag) {
      return args[i + 1] ?? defaultValue;
    }
    if (args[i].startsWith(flag + "=")) {
      return args[i].split("=")[1];
    }
  }
  return defaultValue;
}

// 生成 slug
function toSlug(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9一-鿿]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const today = new Date().toISOString().slice(0, 10);
const root = resolve(import.meta.dirname, "..");

if (type === "changelog") {
  const changelogDir = join(root, "src/content/changelog");
  mkdirSync(changelogDir, { recursive: true });

  const version = getOption("--version", "-v", today.slice(0, 7).replace("-", "."));
  const slug = toSlug(title);
  const filename = `${today}-${slug}.md`;
  const targetPath = join(changelogDir, filename);

  if (existsSync(targetPath)) {
    console.error(`错误: 文件已存在 ${targetPath}`);
    process.exit(1);
  }

  const template = `---
title: ${title}
description: 一句话概括这次更新。
date: ${today}
version: "${version}"
tags:
  - Astro
draft: true
---

## ✨ 新功能

-

## 🔧 改进

-

## 🐛 修复

-

## 📝 其他

-
`;

  writeFileSync(targetPath, template, "utf8");

  console.log(`✅ Changelog 已创建`);
  console.log(`   📄 ${targetPath}`);
  console.log(`   📝 标题: ${title}`);
  console.log(`   🏷️  版本: ${version}`);
  console.log(`   📅 日期: ${today}`);
  console.log(`\n💡 提示: 记得修改 draft: false 以发布`);
}
