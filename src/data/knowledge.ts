import { CATEGORY_SLUGS, type NoteCategory } from "./taxonomy";

export type KnowledgeIcon =
	| "brain"
	| "rocket"
	| "cloud"
	| "monitor"
	| "server"
	| "database"
	| "container"
	| "terminal";

export interface KnowledgeCategory {
	id: string;
	category: NoteCategory;
	title: string;
	icon: KnowledgeIcon;
	description: string;
	href: string;
	topics: string[];
	status?: string;
	color?: string;
}

export function getKnowledgeData(locale: string): KnowledgeCategory[] {
	const isZh = locale === 'zh-CN';

	return [
		{
			id: "ai",
			category: "AI",
			title: "AI",
			icon: "brain",
			description: isZh ? "模型、Agent、Prompt、MCP 与 AI 产品实践。" : "Models, Agent, Prompt, MCP, and AI product practices.",
			href: `/notes/${CATEGORY_SLUGS.AI}`,
			topics: ["MCP", "RAG", "Prompt"],
			status: "Coming Soon",
		},
		{
			id: "astro",
			category: "Astro",
			title: "Astro",
			icon: "rocket",
			description: isZh ? "Astro、SSR、Islands、Content Collections。" : "Astro, SSR, Islands, Content Collections.",
			href: `/notes/${CATEGORY_SLUGS.Astro}`,
			topics: ["SSR", "Islands", "Content"],
			status: "Coming Soon",
		},
		{
			id: "cloudflare",
			category: "Cloudflare",
			title: "Cloudflare",
			icon: "cloud",
			description: isZh ? "Pages、Workers、部署流程与边缘运行时。" : "Pages, Workers, deployment workflows, and edge runtime.",
			href: `/notes/${CATEGORY_SLUGS.Cloudflare}`,
			topics: ["Pages", "Workers", "Edge"],
			status: "Coming Soon",
		},
		{
			id: "frontend",
			category: "Frontend",
			title: "Frontend",
			icon: "monitor",
			description: isZh ? "React、UI 架构、组件设计与前端工程化。" : "React, UI architecture, component design, and frontend engineering.",
			href: `/notes/${CATEGORY_SLUGS.Frontend}`,
			topics: ["React", "UI", "State"],
			status: "Coming Soon",
		},
		{
			id: "backend",
			category: "Backend",
			title: "Backend",
			icon: "server",
			description: isZh ? "服务端架构、API、数据流与工程实践。" : "Server architecture, API, data flow, and engineering practices.",
			href: `/notes/${CATEGORY_SLUGS.Backend}`,
			topics: ["API", "Service", "Runtime"],
			status: "Coming Soon",
		},
		{
			id: "database",
			category: "Database",
			title: "Database",
			icon: "database",
			description: isZh ? "MySQL、Postgres、Redis 与数据建模。" : "MySQL, Postgres, Redis, and data modeling.",
			href: `/notes/${CATEGORY_SLUGS.Database}`,
			topics: ["MySQL", "Postgres", "Redis"],
			status: "Coming Soon",
		},
		{
			id: "devops",
			category: "DevOps",
			title: "DevOps",
			icon: "container",
			description: isZh ? "Docker、CI/CD、部署、监控与运维自动化。" : "Docker, CI/CD, deployment, monitoring, and ops automation.",
			href: `/notes/${CATEGORY_SLUGS.DevOps}`,
			topics: ["Docker", "CI/CD", "Deploy"],
			status: "Coming Soon",
		},
		{
			id: "linux",
			category: "Linux",
			title: "Linux",
			icon: "terminal",
			description: isZh ? "服务器配置、Shell 工作流与系统操作笔记。" : "Server configuration, Shell workflows, and system operation notes.",
			href: `/notes/${CATEGORY_SLUGS.Linux}`,
			topics: ["Shell", "Server", "Ops"],
			status: "Coming Soon",
		},
	];
}
