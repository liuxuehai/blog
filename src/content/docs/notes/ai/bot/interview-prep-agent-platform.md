---
title: Agent 平台项目面试准备
description: 基于仓库现状整理的 Agent 平台面试问答，区分已实现能力、设计边界与后续方案。
category: AI
tags:
  - AI Agent
  - Rust
  - Interview
  - System Design
order: 126
difficulty: advanced
status: stable
draft: false
sidebar:
  order: 126
---

# Agent 平台项目面试准备

> 基于当前仓库文档整理。面试时请结合自己实际负责的代码、决策和验证结果补充；不要把设计目标、文档描述或测试覆盖说成客户生产数据。

## 先记住项目画像

- 这是一个 Rust 2024 workspace 的 Agent 运行时/管理平台，不是单一聊天机器人；由 22 个 crate 组成，涵盖 Agent、LLM、工具、Prompt、Memory、Harness、Policy、SOP、Gateway、DB、Observability 等。
- 核心执行链路是会话上下文构建 → LLM 输出解析 → Policy 决策 → 工具执行 → 工具结果回注 → 完成或达到终止条件。工具调用采用严格 JSON 协议；不能解析为协议时按普通文本 final 处理。
- Coordinator 可通过 durable worker runtime 派发独立 worker；任务、分配、worker 状态和事件存入主库，支持恢复、通知、停止及受控能力申请/授权。
- Harness 收集交互与成败反馈、生成约束并辅助 Prompt；它本身不直接执行工具或阻断请求。Policy 是工具调用前唯一确定性 governor。
- Memory 与对话历史分开：原始会话/交互轨迹用于追溯，提炼后的事实和经验才进入长期记忆。DB 后端支持 PostgreSQL 全文检索、向量相似度及 hybrid merge。
- 仓库中没有足够依据证明有完整的企业知识库 RAG 评测/生产案例。面试可讲检索与记忆架构，但应明确系统边界。

## 90 秒项目介绍

我做的是一个基于 Rust 的 Agent 运行时与控制平台，目标不是只把模型接上工具，而是把模型调用、工具执行、多 Agent 协作和治理做成可追踪、可恢复的工程闭环。主链路里，Agent 负责维护会话和执行循环，工具调用在执行前经过 Policy 的确定性判定，工具结果再回到模型上下文；Harness 负责沉淀交互反馈、约束和运行经验，但不越权执行或拦截。复杂任务由 Coordinator 通过持久化的 worker runtime 派发，worker 的任务、状态和事件可追踪，并有能力申请与最小授权机制。项目还拆分了 Prompt、Memory、DB、Gateway 和 Observability 等边界。我会重点介绍我亲自负责的模块、遇到的具体故障/取舍，以及相应测试或运行证据；目前不会把它描述成已经验证过的政企客户生产系统。

## 一、Runtime 与 Harness

### Q1：从零设计企业级 Agent，你会怎么分层？

**答题要点：**

1. 接入与会话层：HTTP/SSE/WS 等入口、认证限流、会话标识。
2. Agent Runtime：上下文准备、LLM 交互、tool-call loop、超时/取消/终止。
3. 能力层：工具注册、参数 schema、执行器、外部服务/MCP。
4. 状态与记忆层：会话轨迹、任务/worker 状态、长期记忆和检索。
5. 治理与运维层：Policy、审批、审计、观测、评测与成本控制。

强调边界：模型负责概率性理解与生成；Harness/Runtime 将输入、工具、状态转换、失败处理和权限变成可控流程。项目里对应 `agent`、`tools`、`memory`、`harness`、`policy`、`gateway`、`observability` 等 crate。不要把“无状态 Runtime”说成项目现状：会话和 worker 状态是持久化的。

### Q2：怎么理解 Agent = Model + Harness？

**答题要点：**模型提供推理/生成能力，Harness 决定模型如何拿到上下文、使用工具、处理错误、记录状态和结束任务。模型能力是上限，Harness 影响能力能否稳定兑现。举本项目例子：Agent 解析 tool-call 后先经过 Policy gate，再执行并回注结果；设置最大步数，错误带有恢复提示，重复的 policy lecture 会去重。

### Q3：如何避免 Agent 无限循环？失败后如何恢复？

**答题要点：**硬性最大步数（项目文档列出 `MAX_STEPS=6`）、取消 token、超时和明确终态；同类错误不能原样重复，要求模型诊断并改变策略。对于后台 worker，持久化状态、心跳和事件可支持 coordinator 重入时识别遗留运行任务并恢复/重新排队。区分两种恢复：单轮工具循环有上限；durable worker 的中断恢复依赖持久化状态。不要声称所有步骤均可精确 checkpoint 重放。

### Q4：Harness 和 LangChain 是什么关系？

**答题要点：**LangChain 是可选的应用框架/组件生态；Harness 是一组运行时控制与治理职责，不等同于某一个框架。可以基于框架实现，也可以自研。项目的 Harness 是内嵌 crate，负责交互记录、经验/约束反馈、领域识别和 Prompt 辅助；工具执行和阻断分别归 Agent/Tools、Policy。

### Q5：项目里 Harness、Policy、Hooks 的边界是什么？

**答题要点：**Hooks 转接运行时事件；Harness 将交互和失败信号转为经验、约束或提示；Policy 汇总确定性规则并在工具执行前给出 Allow/Deny/Defer。Harness 不拥有阻断权，Policy 不调用 LLM。这样避免提示层规则被误当作安全控制。

## 二、多 Agent 协作

### Q6：单 Agent 已经很强，为什么需要多 Agent？

**答题要点：**只在任务确实可并行、需要独立上下文/职责或需要独立审查时引入 worker；否则多 Agent 会增加协调、延迟、成本和错误传播面。项目采用 root Coordinator + 临时 worker，而不是每个任务都拆分；worker 通过真实 runtime 工具创建，不是 prompt 里虚构的“角色切换”。

### Q7：多个 Agent 怎么协调、处理冲突？

**答题要点：**Coordinator 分解任务并分配 worker；持久化 task、assignment、worker 及事件状态；worker 完成后通过通知回到 coordinator，由 coordinator 检查结果、证据和依赖再决定是否采纳。冲突不靠自由协商：按任务边界、权限和 checkpoint 处理，涉及高风险动作时走人工审批。

### Q8：怎么限制 Worker 权限？

**答题要点：**工具可用性不能只靠 prompt 隐藏。绑定 profile 的 worker 按 allow-list 执行；必要能力通过 request/grant 流程申请，Coordinator 审核并授予最小范围。每次工具调用仍要通过 Policy gate。注意项目文档指出无 profile worker 保留 legacy unrestricted 行为；不要声称所有 worker 默认都已最小权限。

### Q9：Worker 崩溃、超时或父任务重启怎么办？

**答题要点：**项目将 worker/task/assignment/event 落到主库，使用 heartbeat 和重入恢复逻辑识别残留运行状态；近期 heartbeat 的遗留 worker 可标为 interrupted，超阈值则 lost，关联 task 可回到 pending。说明这是有限恢复语义，不等于任意工具副作用都能回滚或 exactly-once 执行。

## 三、上下文工程与记忆

### Q10：Prompt Engineering 和 Context Engineering 有什么区别？

**答题要点：**Prompt Engineering 更关注指令如何表达；Context Engineering 还关注每一轮具体选择什么信息、何时注入、如何排序/裁剪。项目 Prompt Runtime 将静态 system sections 与动态 session/domain/constraints/memory/environment/skills 等内容分开构建；工具 schema 来自当前 ToolRegistry，而不是手写一份可能过期的工具清单。

### Q11：上下文超预算，优先怎么处理？

**答题要点：**先测 token 分布，保留 system 安全规则、当前任务和必要工具契约；历史对话优先摘要并保留最近轮次；检索结果先相关性排序、去重，再限制数量/长度；工具按任务收敛。任何裁剪策略要用任务集回归，避免为了省 token 把关键约束剪掉。项目文档能支持动态 Prompt 与最近历史读取的描述，但不要声称已经有完整的自动 token-budget 优化器，除非能指出代码和测量结果。

### Q12：长期记忆怎么设计，如何避免污染？

**答题要点：**短期会话历史与长期记忆分开；原始对话留在会话轨迹供审计追溯，不直接把整轮粗摘要写入长期记忆。提炼后的稳定事实、经验经 experience event、curation job 和 MemoryCurator 流程评估后再提升为长期 memory；检索按需注入。还应考虑所有者/作用域、TTL、删除和权限隔离。项目已有记忆治理/混合检索能力，但如被问用户级隔离的具体策略，要按代码现状回答。

## 四、检索与 RAG 评估

### Q13：这个项目是 RAG 系统吗？如何评估检索？

**答题要点：**准确描述为带长期 Memory 检索的 Agent 平台，不要直接说成完整知识库 RAG 产品。DB 后端有全文检索、向量相似度和 hybrid merge，可从检索质量角度使用 Recall@K、Precision@K、MRR、NDCG、Hit Rate；生成侧可评估依据充分性、相关性、引用准确率和任务成功率。需要固定查询集、相关文档标注和版本化数据集；仓库文档没有证明已运行完整 RAG benchmark，因此明确这是建议的评估方案，而非既有线上成绩。

### Q14：召回率低，你怎么排查？

**答题要点：**先核实目标事实是否入库、索引是否最新；再看切分与元数据；检查中文/领域 embedding 适配和 query 规范化；对比全文、向量、混合检索结果；调 Top-K/阈值/融合方式；最后查看过滤条件、权限范围和实际注入上下文。逐层记录命中与失败样本，避免只靠改 prompt。

### Q15：政企 Agent 的幻觉和误操作怎么治理？

**答题要点：**治理分层：检索证据与引用约束降低事实错误；无法确认时允许拒答/呈现来源；写操作经强类型工具、参数校验、权限策略和必要人工审批；所有关键决策记录可审计。项目中可具体讲 Policy gate、approval broker、工具 schema、append-only policy decision ledger 和 worker capability grant。Faithfulness 在线门禁/低分自动降级如果没有实现证据，只能作为后续方案，不能说成当前能力。

## 五、工程化追问

### Q16：模型输出格式错误或工具参数不合法怎么办？

**答题要点：**解析器先按严格 JSON 协议解析；非协议输出退化为普通 final。未知工具、参数 schema 错误、审批拒绝和执行异常会形成结构化 tool error 回到上下文，提示模型修正或停止；循环仍受最大步数约束。对高风险操作，不能把“让模型重试”当安全策略，仍需确定性校验和授权。

### Q17：如何做可观测与审计？

**答题要点：**沿请求传播 trace/session/worker/task 标识；记录 LLM、工具、错误类别和耗时等事件；Harness interaction 保存交互和 worker 事件并做敏感信息脱敏；Policy decision ledger 记录决策。要区分已有结构化日志/事件和未必已有的完整 Metrics/Tracing 产品化。仓库说明 Metrics 导出仍是后续事项。

### Q18：如何测试这类系统？

**答题要点：**分层测试：协议解析/策略规则/工具 schema 单元测试；DB migration 与持久化集成测试；Agent tool-call 主链路测试；worker 权限 grant、失败状态、通知与恢复测试；Gateway API 合约测试。关键是测试“越权被拒、错误不无限重试、状态重启后可恢复”，而不只测 happy path。回答时举自己实际运行过的测试命令和结果。

## 六、项目边界与诚实回答

面试官问“上线效果、客户规模、准确率提升、成本下降、并发量、RAG Faithfulness”等量化结果时，只报自己有日志/压测/业务验收依据的数据。当前仓库资料本身不能证明这些业务指标或客户生产部署。

可把回答拆成三类：

- **已实现并有测试/代码依据：**明确说模块与验证方式。
- **已设计但尚未完整产品化：**说明当前覆盖范围和缺口。
- **方案建议/下一步：**明确标为设计思路，不冒充当前功能。

资料中列出的后续项包括 Metrics 导出、LLM 路由策略、Skills 远端同步、Workspace 索引；另有部分 profile 绑定/版本固定事项。面试前应核对自己最近的实际改动，避免照搬旧计划状态。

## 面试前准备清单

- 选一个自己真实主导的功能，准备“背景 → 约束 → 方案取舍 → 实现 → 测试/证据 → 复盘”故事。
- 准备一条可白板讲清的调用链：用户消息 → Agent loop → Policy → Tool → tool_result → final。
- 准备一个失败案例：触发条件、根因、如何观测、修复如何验证、还有什么残余风险。
- 确认自己实际负责的 crate、提交/PR、测试命令和结果；不要把整个仓库都说成个人独立完成。
- 若对方重点是 RAG，主动说明项目中的 memory hybrid retrieval 与知识库 RAG 的差异，并准备一套检索/生成分层评测设计。
