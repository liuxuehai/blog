export const profile = {
	name: "Max",
	role: "Senior Java Engineer & Software Architect",
	intro:
		"拥有 14+ 年 Java 开发、架构设计与项目交付经验，长期参与供应链、金融、支付和汽车金融系统建设，也持续实践 AI 辅助开发与个人产品工程。",
	principle:
		"关注系统边界、稳定性与可演进性，习惯从需求拆解开始，把架构设计、核心实现、代码审查、测试验证和交付串成完整闭环。",
};

export const focusAreas = [
	{
		title: "Backend Architecture",
		description: "Java、Spring Boot、微服务、领域拆分与分布式系统设计。",
	},
	{
		title: "Data & Messaging",
		description: "MySQL、Oracle、Redis、MongoDB、RocketMQ 与异步数据链路。",
	},
	{
		title: "Cloud & Delivery",
		description: "Kubernetes、GitLab CI/CD、监控体系与稳定性建设。",
	},
	{
		title: "AI Engineering",
		description: "智能体平台、多模型基础设施，以及 AI 辅助需求、编码、测试和文档工作流。",
	},
];

export const professionalWork = [
	{
		period: "2021 - Present",
		title: "Supply Chain Finance Center",
		role: "Technical Lead / Senior Java Engineer",
		description:
			"负责供应链业财中心的业务拆分、系统设计、核心研发、跨系统联调与交付，覆盖应收应付、收付款、清分核销、预收预付、费用及财务系统集成。",
		stack: ["Spring Boot", "MySQL", "Redis", "RocketMQ", "Kubernetes"],
	},
	{
		period: "2019 - 2021",
		title: "Automotive Finance Core Platform",
		role: "Java Architect",
		description:
			"参与核心系统架构治理、领域拆分、微服务改造和双活方案，推进监控、编码规范、架构评审与 Code Review。",
		stack: ["Microservices", "Domain Design", "Observability", "High Availability"],
	},
	{
		period: "2016 - 2018",
		title: "Payment, Account & Messaging Platform",
		role: "Senior Java Engineer",
		description:
			"建设支付路由、用户账户和消息服务，对接多家第三方支付渠道，并通过动态权重、优先级和额度规则进行渠道选择。",
		stack: ["Payment Routing", "Disruptor", "ZooKeeper", "Distributed Systems"],
	},
	{
		period: "2013 - 2016",
		title: "Supply Chain Finance Systems",
		role: "Java Engineer",
		description:
			"参与供应链金融、小额信贷、保理融资及个人征信数据报送系统的设计与开发，覆盖需求评审、系统设计、UAT 和交付支持。",
		stack: ["Java", "Spring", "MyBatis", "Oracle"],
	},
];
