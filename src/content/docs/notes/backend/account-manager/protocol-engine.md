---
title: 协议引擎
description: Canonical IR 设计、Client/Upstream Adapter 模式、双方向协议互转、流式事件模型、StreamCollector、OpenAI Chat/Responses 互转。
category: Backend
tags:
  - Rust
  - Protocol
  - Adapter
  - IR
  - Streaming
order: 203
updatedDate: 2024-10-12
difficulty: advanced
status: stable
lastReviewed: 2025-09-20
draft: false
sidebar:
  order: 203
---

协议引擎是整个系统最核心的设计资产——通过 Canonical IR 消除 O(N x M) 协议转换爆炸。新增一个客户端协议或上游 Runtime 时，你不需要写 N 个点对点适配器。

<!-- more -->

## 为什么需要 Canonical IR

### 问题

假设有 8 种客户端协议（OpenAI Chat、Claude Messages、Gemini、OpenAI Responses、OpenAI Images、OpenAI Audio、OpenAI Completions、MCP）和 8 种上游 Runtime（OpenAI、Anthropic、Gemini、Kiro、Z.AI、GitHub Copilot、Antigravity、Local），**点对点转换需要 64 个转换器**。新增一个协议要写 8 个新的。

### 解决方案

```text
Client → ClientAdapter → Canonical IR → UpstreamAdapter → Upstream
                          ↑ 中间表示
                          |
                    协议无关的语义模型
```

8 + 8 = 16 个适配器，新增一个协议只要写一个 adapter。

### Canonical IR 不是"超集"

这是关键的设计决策。Canonical IR **不做 LLM 所有特性的并集**，只包含共性的核心概念：

- Text、Image、Audio、File 内容块
- Tool 调用 (ToolCall、ToolResult)
- Reasoning / Thinking 内容
- Stream 事件模型
- Token 用量

如果一个协议有 Canonical IR 没有的概念（如 Claude 的 `cache_control`），它会被编码为 `CanonicalMetadata` 中的扩展字段。

> **面试怎么聊**：讲 IR 设计时重点讲"哪些进了 IR，哪些进了 metadata"。IR 是语义层——用于路由和选择。metadata 是保真层——用于无损还原协议。

## 分层架构

```text
┌────────────────────────────────────┐
│     Client Application             │
└────────────┬───────────────────────┘
             │ HTTP/HTTPS
┌────────────▼───────────────────────┐
│  API Routes (/v1/*, /internal/*)   │
└────────────┬───────────────────────┘
             │
┌────────────▼───────────────────────┐
│  Protocol Handler  (proxy/handlers) │
│  decode_request() -> CanonicalReq  │
└────────────┬───────────────────────┘
             │
┌────────────▼───────────────────────┐
│  CanONical IR  (protocol/ir/)      │
│  CanonicalReq / StreamEvent / Resp │
└────────────┬───────────────────────┘
             │
┌────────────▼───────────────────────┐
│  Routing + Account Selection       │
└────────────┬───────────────────────┘
             │
┌────────────▼───────────────────────┐
│  ProxyOrchestrator (retry+failover)│
└────────────┬───────────────────────┘
             │
┌────────────▼───────────────────────┐
│  Runtime → UpstreamAdapter         │
│  encode_request(IR) → 上游 JSON   │
└────────────┬───────────────────────┘
             │
┌────────────▼───────────────────────┐
│  Transport → 上游服务              │
└────────────┬───────────────────────┘
             │
┌────────────▼───────────────────────┐
│  decode_stream_event/response      │
│  → CanonicalStreamEvent/Response   │
└────────────┬───────────────────────┘
             │
┌────────────▼───────────────────────┐
│  StreamCollector (聚合)            │
└────────────┬───────────────────────┘
             │
┌────────────▼───────────────────────┐
│  client adapter encode → 客户端 SSE│
└────────────────────────────────────┘
```

## CanonicalRequest 核心结构

```rust
pub struct CanonicalRequest {
    pub trace_id: String,
    pub requested_model: String,        // 客户端原始请求模型
    pub resolved_model: Option<String>, // 路由解析后的模型（路由前为空）
    pub target_runtime: Option<String>, // 路由解析后的 runtime（路由前为空）
    pub instructions: Vec<InstructionPart>,
    pub messages: Vec<CanonicalMessage>,
    pub tools: Vec<ToolDefinition>,
    pub tool_choice: Option<ToolChoice>,
    pub stream: bool,
    pub generation: GenerationConfig,
    pub capabilities_required: CapabilitySet,
    pub metadata: CanonicalMetadata,
}
```

### Message 的挤压规则

前导 `system`/`developer` 消息被转换为结构化 `instructions`；后续出现的保留在 `messages` 中。这是最关键的挤压步骤——让 IR 的语义更清晰，不需要 downstream adapter 去重新扫描 messages 数组。

### 三段模型链

```
requested_model  → 路由时解析 →  resolved_model  → 上游时转换 →  upstream_model
  |                  |               |                  |
  "gpt-4o"           model_mapping   "gpt-4o-mini"     upstream adapter
```

每一步转换都可追溯。`provider` 管理器中的别名和 fallback 必须可观测，不能悄悄被转换。

## CanonicalStreamEvent（13 种事件）

| 事件 | 含义 | 流式阶段 |
|------|------|----------|
| `MessageStart` | 消息开始 | 带 id 和 role |
| `ContentBlockStart` | 内容块开始 (Text/Reasoning/ToolCall) | index + kind |
| `TextDelta` | 文本增量 | 新增文本 |
| `ReasoningDelta` | 思维增量 | delta + visibility |
| `ToolCallStart` | 工具调用开始 | id + name + index |
| `ToolCallArgumentsDelta` | 工具参数增量 | id + raw delta string |
| `ToolCallEnd` | 工具调用结束 | id + parsed arguments |
| `Usage` | Token 用量 | UsageInfo |
| `Metadata` | 元数据 | 扩展字段 |
| `Finish` | 完成原因 | FinishReason |
| `MessageEnd` | 消息结束 | — |
| `Error` | 错误 | CanonicalError |
| `Done` | 终止哨兵 | 流结束 |

**三个终止事件的区别**：

- `Finish`：表示 reason（stop、tool_calls、max_tokens 等）
- `MessageEnd`：表示消息结构结束
- `Done`：流的终止哨兵

三者缺一不可——客户端 adapter 在 `MessageEnd` 后关闭消息结构，在 `Done` 后发送 `[DONE]`。

## Upstream Adapter 模式

每个 upstream adapter 实现三个核心函数：

```rust
// 编码 CanonicalRequest 为上游请求
fn encode_request(request: &CanonlyRequest, ctx: &EncodeContext)
    -> Result<Value, CanonicalError>

// 解码上游流事件
fn decode_stream_event(event: &Value, ctx: &DecodeContext)
    -> Result<Vec<CanonicalStreamEvent>, CanonicalError>

// 解码上游错误
fn decode_error(status: u16, body: &str) -> CanonicalError
```

### 关键 Adapter

**Codex (OpenAI Responses API)**：
- CanonicalRequest → Responses request JSON
- Responses event JSON → CanonicalStreamEvent
- `tool_choice: null` → `"auto"`，纯文本 content 归一化

**Kiro (AWS EventStream)**：
- CanonicalRequest → KiroPayload
- EventStream JSON → CanonicalStreamEvent
- thinking signature 编码为 ProviderExtension
- base64 图片输入 → Kiro images 数组

**Anthropic (Messages API)**：
- CanonicalRequest → Messages request
- Anthropic SSE → CanonicalStreamEvent
- `input_json_delta` 正确携带 tool call id

**Gemini**：
- v1internal request/response ↔ Canonical IR
- Antigravity 和 Gemini 共用 adapter，另一 userAgent 区分

## 双方向协议转换示例

### OpenAI Chat ↔ Responses 互转

这是维护量最大的协议转换——两个协议必须通过 Canonical IR 无损互转：

**Chat 入 → Responses 出**：
```
/v1/chat/completions → CanonicalRequest → OpenAI Responses 上游
Responses SSE events → CanonicalStreamEvent → Chat SSE chunks
```

**Responses 入 → Chat 出**：
```
/v1/responses → CanonicalRequest → OpenAI Chat 上游
Chat SSE chunks → CanonicalStreamEvent → Reponses SSE events
```

**工具调用的关键维护规则**（代码中的硬约束）：

1. Chat SSE 的 `choices[*].delta.tool_calls[*]` 必须转为 `ToolCallStart`、`ToolCallArgumentsDelta`、`ToolCallEnd`，再编码为 Responses SSE
2. Responses 的 `response.output_item.added`、`response.function_call_arguments.delta` 必须转为 Chat SSE 的 `delta.tool_calls`
3. 工具参数在流式阶段保持 raw string 增量，只在 `ToolCallEnd` 或 collector `finish()` 阶段才解析 JSON
4. 多个并行 tool call 按 call id 独立累积状态，不能共用 single pending slot
5. `finish_reason` 为 `tool_calls` 时不能提前当普通 text stop 结束

### OpenAI → Claude 以及反向

**消息转换**：OpenAI 的 content 是 string → Claude 是 content block 数组
**系统消息**：OpenAI 在 messages 数组里 → Claude 在独立的 system 参数
**工具调用**：OpenAI 的 tool_calls → Claude 的 tool_use content block
**思维链**：Claude thinking → reasoning_content（如果目标协议支持）

## StreamCollector

`CanonicalResponseCollector` 负责将 `CanonicalStreamEvent` 聚合为 `CanonicalResponse`，流式和非流式路径共享此逻辑。

```
CanonicalStreamEvent × N  →  Collector  →  CanonicalResponse
                                           ├─ assistant_text
                                           ├─ reasoning_parts
                                           ├─ tool_calls
                                           ├─ usage
                                           └─ finish_reason
```

关键行为：
- 累积 assistant 文本和推理
- 跟踪 content block 生命周期
- ToolCallEnd 或 finish() 时解析 JSON 参数
- JSON 参数解析失败时保留 raw_arguments + policy_record
- 收集 errors、metadata、policy_records

调用时机：非流式请求直接用 `collector.finish()` 获取完整响应；流式请求在 `Done` 事件后调用。

## 协议迁移历史

关键节点（从 ~6790 行硬编码到 ~106 行 facade 再到全量删除）：

1. Claude handler → Canonical IR 两步管道
2. OpenAI chat handler → 脱离 mapper model
3. Kiro runtime → 脱离旧 mapper，payload 走 canonical
4. Anthropic/  wire types 上移到 protocol/
5. `providers/mappers/` 全量删除

新增协议的正确方式：**client adapter**（解码客户端请求）→ **Canonical IR** → **upstream adapter**（编码上游请求）。

## 面试高频问题

**Q：为什么选择自身实现 IR 而不使用 JSON Schema/OpenAPI 路由？**

A：LLM 协议不只是字段映射——每个协议在流式事件语义上有根本差异。OpenAI Chat 用 `choices[*].delta.tool_calls` 的增量装置，Anthropic 用 `content_block_start/stop`，Kiro 用 AWS EventStream。JSON Schema 路由无法处理"哪个 delta 事件对应哪个 tool call"这类状态追踪——必须 IR + Collector 才有足够的语义表达能力。

**Q：Canonical IR 如何保证无损？**

A：三线保护：（1）IR 字段映射有明确规则，不能默认丢失；（2）不 IR 的特殊字段进 `metadata.provider_extensions`，保证还原；（3）streamming 的 suppress 通过 `ToolCallArgumentsDelta(raw_string)` 保持流式增量精度。

**Q：为什么 OpenAI Chat/Responses 互转那么复杂？**

A：两者的 surface area 有重叠但不完全一致。Chat 的 `tool_calls` 是 `delta.tool_calls[*]` 增量，Responses 是 `response.output_item.added/done` 事件。最坑的是 `finish_reason`——Chat 说 `tool_calls` 时还不结束，Responses 说 `response.output_item.done` 就是块结束。转换层必须精确追踪这一点，不能用单一状态变量。

