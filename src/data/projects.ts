export interface ProjectLink {
	label: string;
	href: string;
	primary?: boolean;
}

export interface Project {
	id: string;
	name: string;
	subtitle: string;
	description: string;
	category: string;
	status: "active" | "archived" | "prototype";
	stack: string[];
	highlights: string[];
	featured: boolean;
	links: ProjectLink[];
}

export const projects: Project[] = [
	{
		id: "bot",
		name: "Bot",
		subtitle: "Local-first agent execution platform",
		description:
			"面向 AI 编码、测试、文档与研究任务的本地智能体系统，围绕可控执行、任务审计和复杂工作流协作设计。",
		category: "AI Systems",
		status: "active",
		stack: ["Agents", "Policy", "Tools", "Memory", "Skills"],
		highlights: [
			"支持多 Agent Worker 调度、任务拆解与并行结果汇总。",
			"将工具权限、能力授权、产物记忆和任务审计纳入统一执行模型。",
			"以 Coordinator-Worker 协作模式组织复杂任务的执行链路。",
		],
		featured: true,
		links: [
			{ label: "GitHub", href: "#", primary: true },
			{ label: "Documentation", href: "#" },
		],
	},
	{
		id: "trader",
		name: "Trader",
		subtitle: "Rust quantitative trading system",
		description:
			"采用 Rust workspace 分层架构构建的量化交易系统，覆盖回测、行情回放、模拟交易和交易运行管理。",
		category: "Trading Infrastructure",
		status: "active",
		stack: ["Rust", "OMS", "Risk", "Broker Adapter", "WebSocket"],
		highlights: [
			"覆盖策略、Alpha、组合构建、风控、执行和 OMS 等核心模块。",
			"提供指标分析、账户核算及 REST/WebSocket API。",
			"打通从策略信号到订单执行的完整链路，强调可回放、可审计与可扩展。",
		],
		featured: true,
		links: [
			{ label: "GitHub", href: "#", primary: true },
			{ label: "API Docs", href: "#" },
		],
	},
	{
		id: "account-manager",
		name: "Account Manager",
		subtitle: "AI account and proxy management",
		description:
			"面向多模型、多账号场景的代理与管理基础设施，统一处理账号选择、凭据、模型可用性和调用日志。",
		category: "AI Infrastructure",
		status: "active",
		stack: ["OpenAI", "Anthropic", "Gemini", "OpenRouter", "Local Models"],
		highlights: [
			"支持多个模型提供方和本地模型的统一接入。",
			"集中维护凭据、额度状态、模型可用性与请求日志。",
			"解耦协议转换、账号选择和上游执行，便于扩展不同供应商。",
		],
		featured: false,
		links: [
			{ label: "GitHub", href: "#", primary: true },
		],
	},
	{
		id: "mark",
		name: "Mark",
		subtitle: "Full-stack management workspace",
		description:
			"用于承载内部管理流程的全栈工作台，并作为 Trader 与 Account Manager 的统一管理入口。",
		category: "Full-stack Platform",
		status: "active",
		stack: ["Bun", "Hono", "React", "Cloudflare D1/R2", "Drizzle ORM"],
		highlights: [
			"包含用户认证、组织成员、订阅、上传和用户管理等基础能力。",
			"提供数据表格与内部管理页面，形成可复用的后台工作台。",
			"使用 TypeScript、Better Auth 和 Cloudflare 数据服务构建完整应用链路。",
		],
		featured: false,
		links: [
			{ label: "GitHub", href: "#", primary: true },
			{ label: "Live Demo", href: "#" },
		],
	},
];
