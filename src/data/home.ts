import { GITHUB_URL } from "../consts";
import { useTranslations } from "../lib/i18n";

export function getHeroData(locale: string) {
	const isZh = locale === 'zh-CN';

	return {
		eyebrow: isZh ? "独立开发者" : "Independent developer",
		title: "Max",
		statement: isZh ? "用 AI、云和 Web 构建。" : "Building with AI, cloud, and the web.",
		description: isZh
			? "记录 AI、Astro、Cloudflare 与现代 Web 开发中的实践、判断和长期笔记。"
			: "Notes on practices, decisions, and long-term engineering in AI, Astro, Cloudflare, and modern web development.",
		primaryAction: {
			label: isZh ? "探索笔记" : "Explore Notes",
			href: "/notes",
		},
		secondaryAction: {
			label: GITHUB_URL ? "GitHub" : (isZh ? "查看项目" : "View Projects"),
			href: GITHUB_URL || "/projects",
			external: Boolean(GITHUB_URL),
		},
		techStack: ["Astro", "Cloudflare", "AI", "React", "Node.js"],
		panel: {
			title: isZh ? "当前重点" : "Current focus",
			items: [
				{
					label: isZh ? "AI 系统" : "AI systems",
					detail: "Agent, RAG, MCP",
				},
				{
					label: isZh ? "云平台" : "Cloud platforms",
					detail: "Workers, Pages, edge",
				},
				{
					label: isZh ? "内容架构" : "Content architecture",
					detail: "Astro, Starlight, search",
				},
			],
		},
	};
}
