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

export const CATEGORY_LABELS: Record<BlogCategory, string> = {
	AI: "AI",
	Astro: "Astro",
	Cloudflare: "Cloudflare",
	Frontend: "前端",
	Backend: "后端",
	Database: "数据库",
	DevOps: "DevOps",
	Linux: "Linux",
	Server: "服务器",
	Others: "其他",
};

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
