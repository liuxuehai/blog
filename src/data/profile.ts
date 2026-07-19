import { GITHUB_URL } from "../consts";

export function getProfileData(locale: string) {
	const isZh = locale === 'zh-CN';

	return {
		profile: {
			name: "Max",
			role: isZh ? "高级 Java 工程师 & 软件架构师" : "Senior Java Engineer & Software Architect",
			intro: isZh
				? "拥有 14+ 年 Java 开发、架构设计与项目交付经验，长期参与供应链、金融、支付和汽车金融系统建设，也持续实践 AI 辅助开发与个人产品工程。"
				: "With 14+ years of experience in Java development, architecture design, and project delivery, I've been involved in supply chain, finance, payment, and automotive finance systems, while continuously practicing AI-assisted development and personal product engineering.",
			principle: isZh
				? "关注系统边界、稳定性与可演进性，习惯从需求拆解开始，把架构设计、核心实现、代码审查、测试验证和交付串成完整闭环。"
				: "Focusing on system boundaries, stability, and evolvability, I start from requirements breakdown, connecting architecture design, core implementation, code review, testing, and delivery into a complete closed loop.",
		},
		focusAreas: [
			{
				title: isZh ? "后端架构" : "Backend Architecture",
				description: isZh
					? "Java、Spring Boot、微服务、领域拆分与分布式系统设计。"
					: "Java, Spring Boot, microservices, domain decomposition, and distributed system design.",
			},
			{
				title: isZh ? "数据与消息" : "Data & Messaging",
				description: isZh
					? "MySQL、Oracle、Redis、MongoDB、RocketMQ 与异步数据链路。"
					: "MySQL, Oracle, Redis, MongoDB, RocketMQ, and async data pipelines.",
			},
			{
				title: isZh ? "云与交付" : "Cloud & Delivery",
				description: isZh
					? "Kubernetes、GitLab CI/CD、监控体系与稳定性建设。"
					: "Kubernetes, GitLab CI/CD, monitoring systems, and stability engineering.",
			},
			{
				title: isZh ? "AI 工程" : "AI Engineering",
				description: isZh
					? "智能体平台、多模型基础设施，以及 AI 辅助需求、编码、测试和文档工作流。"
					: "Agent platforms, multi-model infrastructure, and AI-assisted requirements, coding, testing, and documentation workflows.",
			},
		],
		professionalWork: [
			{
				period: "2021 - Present",
				title: isZh ? "供应链业财中心" : "Supply Chain Finance Center",
				role: isZh ? "技术负责人 / 高级 Java 工程师" : "Technical Lead / Senior Java Engineer",
				description: isZh
					? "负责供应链业财中心的业务拆分、系统设计、核心研发、跨系统联调与交付，覆盖应收应付、收付款、清分核销、预收预付、费用及财务系统集成。"
					: "Responsible for business decomposition, system design, core development, cross-system integration and delivery of the supply chain finance center, covering accounts receivable/payable, payments, clearing, prepayments, expenses, and financial system integration.",
				stack: ["Spring Boot", "MySQL", "Redis", "RocketMQ", "Kubernetes"],
			},
			{
				period: "2019 - 2021",
				title: isZh ? "汽车金融核心平台" : "Automotive Finance Core Platform",
				role: isZh ? "Java 架构师" : "Java Architect",
				description: isZh
					? "参与核心系统架构治理、领域拆分、微服务改造和双活方案，推进监控、编码规范、架构评审与 Code Review。"
					: "Participated in core system architecture governance, domain decomposition, microservice transformation, and dual-active solutions, advancing monitoring, coding standards, architecture review, and Code Review.",
				stack: ["Microservices", "Domain Design", "Observability", "High Availability"],
			},
			{
				period: "2016 - 2018",
				title: isZh ? "支付、账户与消息平台" : "Payment, Account & Messaging Platform",
				role: isZh ? "高级 Java 工程师" : "Senior Java Engineer",
				description: isZh
					? "建设支付路由、用户账户和消息服务，对接多家第三方支付渠道，并通过动态权重、优先级和额度规则进行渠道选择。"
					: "Built payment routing, user account, and messaging services, integrated with multiple third-party payment channels, and implemented channel selection through dynamic weights, priorities, and quota rules.",
				stack: ["Payment Routing", "Disruptor", "ZooKeeper", "Distributed Systems"],
			},
			{
				period: "2013 - 2016",
				title: isZh ? "供应链金融系统" : "Supply Chain Finance Systems",
				role: isZh ? "Java 工程师" : "Java Engineer",
				description: isZh
					? "参与供应链金融、小额信贷、保理融资及个人征信数据报送系统的设计与开发，覆盖需求评审、系统设计、UAT 和交付支持。"
					: "Participated in the design and development of supply chain finance, micro-lending, factoring financing, and personal credit data reporting systems, covering requirements review, system design, UAT, and delivery support.",
				stack: ["Java", "Spring", "MyBatis", "Oracle"],
			},
		],
	};
}
