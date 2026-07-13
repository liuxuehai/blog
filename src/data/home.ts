import { GITHUB_URL } from "../consts";

export const hero = {
	eyebrow: "Independent developer",
	title: "Max",
	statement: "Building with AI, cloud, and the web.",
	description: "记录 AI、Astro、Cloudflare 与现代 Web 开发中的实践、判断和长期笔记。",
	primaryAction: {
		label: "Explore Notes",
		href: "/notes",
	},
	secondaryAction: {
		label: GITHUB_URL ? "GitHub" : "View Projects",
		href: GITHUB_URL || "/projects",
		external: Boolean(GITHUB_URL),
	},
	techStack: ["Astro", "Cloudflare", "AI", "React", "Node.js"],
	panel: {
		title: "Current focus",
		items: [
			{
				label: "AI systems",
				detail: "Agent, RAG, MCP",
			},
			{
				label: "Cloud platforms",
				detail: "Workers, Pages, edge",
			},
			{
				label: "Content architecture",
				detail: "Astro, Starlight, search",
			},
		],
	},
};
