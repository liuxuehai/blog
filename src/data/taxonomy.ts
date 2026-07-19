export const NOTE_CATEGORIES = [
	"AI",
	"Astro",
	"Cloudflare",
	"Frontend",
	"Backend",
	"Database",
	"DevOps",
	"Linux",
] as const;

export const BLOG_CATEGORIES = [
	...NOTE_CATEGORIES,
	"Server",
	"Others",
] as const;

export type NoteCategory = (typeof NOTE_CATEGORIES)[number];
export type BlogCategory = (typeof BLOG_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<BlogCategory, Record<string, string>> = {
	AI: { 'zh-CN': 'AI', 'en': 'AI' },
	Astro: { 'zh-CN': 'Astro', 'en': 'Astro' },
	Cloudflare: { 'zh-CN': 'Cloudflare', 'en': 'Cloudflare' },
	Frontend: { 'zh-CN': '前端', 'en': 'Frontend' },
	Backend: { 'zh-CN': '后端', 'en': 'Backend' },
	Database: { 'zh-CN': '数据库', 'en': 'Database' },
	DevOps: { 'zh-CN': 'DevOps', 'en': 'DevOps' },
	Linux: { 'zh-CN': 'Linux', 'en': 'Linux' },
	Server: { 'zh-CN': '服务器', 'en': 'Server' },
	Others: { 'zh-CN': '其他', 'en': 'Others' },
};

export function getCategoryLabelLocalized(category: BlogCategory, locale: string = 'zh-CN'): string {
	return CATEGORY_LABELS[category]?.[locale] ?? category;
}

export const CATEGORY_SLUGS: Record<BlogCategory, string> = {
	AI: "ai",
	Astro: "astro",
	Cloudflare: "cloudflare",
	Frontend: "frontend",
	Backend: "backend",
	Database: "database",
	DevOps: "devops",
	Linux: "linux",
	Server: "server",
	Others: "others",
};

export const CATEGORY_BY_SLUG = Object.fromEntries(
	BLOG_CATEGORIES.map((category) => [CATEGORY_SLUGS[category], category]),
) as Record<string, BlogCategory>;
