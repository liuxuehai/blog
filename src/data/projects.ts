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

export function getProjectsData(locale: string): Project[] {
	const isZh = locale === 'zh-CN';

	return [
		{
			id: "bot",
			name: "Bot",
			subtitle: isZh ? "本地优先的智能体执行平台" : "Local-first agent execution platform",
			description: isZh
				? "面向 AI 编码、测试、文档与研究任务的本地智能体系统，围绕可控执行、任务审计和复杂工作流协作设计。"
				: "A local agent system for AI coding, testing, documentation, and research tasks, designed around controllable execution, task auditing, and complex workflow collaboration.",
			category: "AI Systems",
			status: "active",
			stack: ["Agents", "Policy", "Tools", "Memory", "Skills"],
			highlights: isZh
				? [
					"支持多 Agent Worker 调度、任务拆解与并行结果汇总。",
					"将工具权限、能力授权、产物记忆和任务审计纳入统一执行模型。",
					"以 Coordinator-Worker 协作模式组织复杂任务的执行链路。",
				]
				: [
					"Supports multi-Agent Worker scheduling, task decomposition, and parallel result aggregation.",
					"Incorporates tool permissions, capability authorization, artifact memory, and task auditing into a unified execution model.",
					"Organizes complex task execution chains with Coordinator-Worker collaboration pattern.",
				],
			featured: true,
			links: [
				{ label: "GitHub", href: "#", primary: true },
				{ label: isZh ? "文档" : "Documentation", href: "#" },
			],
		},
		{
			id: "trader",
			name: "Trader",
			subtitle: isZh ? "Rust 量化交易系统" : "Rust quantitative trading system",
			description: isZh
				? "采用 Rust workspace 分层架构构建的量化交易系统，覆盖回测、行情回放、模拟交易和交易运行管理。"
				: "A quantitative trading system built with Rust workspace layered architecture, covering backtesting, market replay, simulated trading, and trading operation management.",
			category: "Trading Infrastructure",
			status: "active",
			stack: ["Rust", "OMS", "Risk", "Broker Adapter", "WebSocket"],
			highlights: isZh
				? [
					"覆盖策略、Alpha、组合构建、风控、执行和 OMS 等核心模块。",
					"提供指标分析、账户核算及 REST/WebSocket API。",
					"打通从策略信号到订单执行的完整链路，强调可回放、可审计与可扩展。",
				]
				: [
					"Covers core modules including strategy, Alpha, portfolio construction, risk control, execution, and OMS.",
					"Provides metrics analysis, account reconciliation, and REST/WebSocket API.",
					"Connects the complete chain from strategy signals to order execution, emphasizing replayability, auditability, and extensibility.",
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
			subtitle: isZh ? "AI 账号与代理管理" : "AI account and proxy management",
			description: isZh
				? "面向多模型、多账号场景的代理与管理基础设施，统一处理账号选择、凭据、模型可用性和调用日志。"
				: "Proxy and management infrastructure for multi-model, multi-account scenarios, unifying account selection, credentials, model availability, and call logs.",
			category: "AI Infrastructure",
			status: "active",
			stack: ["OpenAI", "Anthropic", "Gemini", "OpenRouter", "Local Models"],
			highlights: isZh
				? [
					"支持多个模型提供方和本地模型的统一接入。",
					"集中维护凭据、额度状态、模型可用性与请求日志。",
					"解耦协议转换、账号选择和上游执行，便于扩展不同供应商。",
				]
				: [
					"Supports unified access to multiple model providers and local models.",
					"Centrally maintains credentials, quota status, model availability, and request logs.",
					"Decouples protocol conversion, account selection, and upstream execution for easy extension to different providers.",
				],
			featured: false,
			links: [
				{ label: "GitHub", href: "#", primary: true },
			],
		},
		{
			id: "mark",
			name: "Mark",
			subtitle: isZh ? "全栈管理工作台" : "Full-stack management workspace",
			description: isZh
				? "用于承载内部管理流程的全栈工作台，并作为 Trader 与 Account Manager 的统一管理入口。"
				: "A full-stack workspace for internal management processes, serving as a unified management portal for Trader and Account Manager.",
			category: "Full-stack Platform",
			status: "active",
			stack: ["Bun", "Hono", "React", "Cloudflare D1/R2", "Drizzle ORM"],
			highlights: isZh
				? [
					"包含用户认证、组织成员、订阅、上传和用户管理等基础能力。",
					"提供数据表格与内部管理页面，形成可复用的后台工作台。",
					"使用 TypeScript、Better Auth 和 Cloudflare 数据服务构建完整应用链路。",
				]
				: [
					"Includes user authentication, organization members, subscriptions, uploads, and user management capabilities.",
					"Provides data tables and internal management pages, forming a reusable backend workspace.",
					"Builds a complete application chain using TypeScript, Better Auth, and Cloudflare data services.",
				],
			featured: false,
			links: [
				{ label: "GitHub", href: "#", primary: true },
				{ label: "Live Demo", href: "#" },
			],
		},
	];
}
