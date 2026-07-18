#!/usr/bin/env node

/**
 * 文章创建脚本
 *
 * 用法:
 *   node scripts/new.mjs post "文章标题"
 *   node scripts/new.mjs note "笔记标题" --category ai
 *
 * 选项:
 *   --category, -c   指定分类目录 (默认: astro)
 *   --draft, -d      标记为草稿 (默认: true)
 */

import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const args = process.argv.slice(2);
const type = args[0];
const title = args[1];

if (!type || !title) {
  console.error(`用法:
  pnpm run new:post "文章标题"
  pnpm run new:note "笔记标题" [--category ai]

类型:
  post    创建博客文章
  note    创建笔记

选项:
  --category, -c   指定分类 (post 默认: 无子目录, note 默认: ai)
  --draft, -d      是否草稿 (默认: true)`);
  process.exit(1);
}

if (!["post", "note"].includes(type)) {
  console.error(`错误: 未知类型 "${type}"，支持 post 和 note`);
  process.exit(1);
}

// 解析选项
function getOption(flag, shortFlag, defaultValue) {
  for (let i = 2; i < args.length; i++) {
    if (args[i] === flag || args[i] === shortFlag) {
      return args[i + 1] ?? defaultValue;
    }
    // 支持 --flag=value 格式
    if (args[i].startsWith(flag + "=")) {
      return args[i].split("=")[1];
    }
  }
  return defaultValue;
}

function hasFlag(flag, shortFlag) {
  return args.some((a) => a === flag || a === shortFlag);
}

// 生成 slug
function toSlug(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9一-鿿]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// 获取已有文件的最大编号
function getNextIndex(dir) {
  if (!existsSync(dir)) return 1;
  const files = readdirSync(dir).filter((f) => f.endsWith(".md") || f.endsWith(".mdx"));
  let max = 0;
  for (const f of files) {
    const match = f.match(/^(\d{3})-/);
    if (match) max = Math.max(max, parseInt(match[1], 10));
  }
  return max + 1;
}

// 获取已有分类列表
function getCategories(baseDir) {
  if (!existsSync(baseDir)) return [];
  return readdirSync(baseDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
}

const today = new Date().toISOString().slice(0, 10);
const root = resolve(import.meta.dirname, "..");

if (type === "post") {
  const blogDir = join(root, "src/content/blog");
  const categories = getCategories(blogDir);

  console.log(`\n📂 可用分类: ${categories.join(", ")}`);
  console.log(`   不指定分类则直接放在 blog/ 根目录\n`);

  const category = getOption("--category", "-c", "");
  const slug = toSlug(title);
  const index = getNextIndex(category ? join(blogDir, category) : blogDir);
  const paddedIndex = String(index).padStart(3, "0");
  const filename = `${paddedIndex}-${slug}.md`;

  const targetDir = category ? join(blogDir, category) : blogDir;
  mkdirSync(targetDir, { recursive: true });

  const targetPath = join(targetDir, filename);

  if (existsSync(targetPath)) {
    console.error(`错误: 文件已存在 ${targetPath}`);
    process.exit(1);
  }

  const template = readFileSync(join(root, "src/content/templates/blog-post.md"), "utf8");

  const content = template
    .replace("title: 文章标题", `title: ${title}`)
    .replace("pubDate: 2026-07-13", `pubDate: ${today}`)
    .replace("updatedDate: 2026-07-13", `updatedDate: ${today}`)
    .replace("category: Astro", category ? `category: ${category.charAt(0).toUpperCase() + category.slice(1)}` : "category: Astro")
    .replace("  - Astro", `  - ${category ? category.charAt(0).toUpperCase() + category.slice(1) : "Astro"}`);

  writeFileSync(targetPath, content, "utf8");

  console.log(`✅ 博客文章已创建`);
  console.log(`   📄 ${targetPath}`);
  console.log(`   📝 标题: ${title}`);
  console.log(`   📁 分类: ${category || "(根目录)"}`);
  console.log(`   📅 日期: ${today}`);
} else if (type === "note") {
  const notesDir = join(root, "src/content/docs/notes");
  const categories = getCategories(notesDir);

  console.log(`\n📂 可用分类: ${categories.join(", ")}`);

  const category = getOption("--category", "-c", "ai");
  const slug = toSlug(title);
  const targetDir = join(notesDir, category);
  mkdirSync(targetDir, { recursive: true });

  const filename = `${slug}.md`;
  const targetPath = join(targetDir, filename);

  if (existsSync(targetPath)) {
    console.error(`错误: 文件已存在 ${targetPath}`);
    process.exit(1);
  }

  const template = readFileSync(join(root, "src/content/templates/note.md"), "utf8");

  const content = template
    .replace("title: 笔记标题", `title: ${title}`)
    .replace("updatedDate: 2026-07-13", `updatedDate: ${today}`)
    .replace("lastReviewed: 2026-07-13", `lastReviewed: ${today}`)
    .replace("category: Astro", `category: ${category.charAt(0).toUpperCase() + category.slice(1)}`)
    .replace("  - Astro", `  - ${category.charAt(0).toUpperCase() + category.slice(1)}`);

  writeFileSync(targetPath, content, "utf8");

  console.log(`✅ 笔记已创建`);
  console.log(`   📄 ${targetPath}`);
  console.log(`   📝 标题: ${title}`);
  console.log(`   📁 分类: ${category}`);
  console.log(`   📅 日期: ${today}`);
}
