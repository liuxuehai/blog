---
title: HTTP 与 JSON
description: Hutool HTTP 请求对象、响应资源、JSON 树模型和第三方 JSON 适配边界。
category: Backend
tags: [Source Reading, Hutool, HTTP, JSON]
order: 94
updatedDate: 2026-08-24
difficulty: advanced
status: stable
lastReviewed: 2026-08-24
draft: false
sidebar:
  order: 94
---

Hutool 的 HTTP 和 JSON 模块都采用“静态快速入口 + 对象化复杂流程”。前者隐藏连接、请求头和响应读取细节，后者把文本解析为树模型，方便路径访问和简单转换。

<!-- more -->

## 先给答案：Hutool 的 HTTP 和 JSON 模块都采用“静态快速入口 + 对象化复杂流程”

Hutool 的 HTTP 和 JSON 模块都采用“静态快速入口 + 对象化复杂流程”。前者隐藏连接、请求头和响应读取细节，后者把文本解析为树模型，方便路径访问和简单转换。 正文沿“HTTP 请求路径 -> 关键边界 -> JSON 树模型”展开：先确认入口和状态归属，再跟踪控制流或数据流的推进，最后落到对外可观察的结果。

主要失效边界集中在“超时、编码、重试”这些场景。它们破坏的是容量、顺序、并发或生命周期前提；排查时应先确认状态是否仍由正确对象持有，再核对推进条件和清理路径。

## HTTP 请求路径

```text
HttpUtil.get/post
      -> HttpRequest.newRequest
      -> method / header / body / timeout
      -> execute
      -> HttpResponse
      -> bodyString / bodyBytes / close
```

`HttpRequest` 保存请求配置，`HttpResponse` 保存状态码、头和响应体。这个拆分比把所有参数塞进一个静态方法更适合上传、认证、代理和多次配置，但也意味着调用者必须关注响应关闭和大响应体的内存占用。

## 关键边界

| 风险 | 说明 |
| --- | --- |
| 超时 | 连接、读取和写入超时语义不能混为一个业务超时 |
| 编码 | Content-Type、响应头和默认 charset 可能不一致 |
| 重试 | 工具层不应默认重试所有 POST 或非幂等请求 |
| 资源 | 响应流未关闭会泄漏连接或文件描述符 |
| 日志 | Authorization、Cookie 和请求体不能无条件打印 |

## JSON 树模型

`JSONUtil.parseObj`、`parseArray` 等入口通常先选择对象树类型，再委托 JSON 引擎完成解析。树模型方便动态字段访问，但比类型化 Bean 付出更多运行时检查和对象分配。

```text
文本/字节 -> JSON 解析器 -> JSONObject / JSONArray
          -> get / getByPath / toBean
          -> Convert 或 BeanUtil
```

要注意 JSON 模块的版本适配和引擎差异：数字精度、日期格式、未知字段、null 处理和多态类型都应由业务明确配置，不应依赖“看起来能转”。

## 选择建议

- 固定契约、批量数据：优先类型化对象和明确的 serializer 配置。
- 动态配置、少量字段：树模型更适合快速访问。
- 外部输入：限制类型转换和多态行为，避免把 JSON 中的类名直接交给反射实例化。

> **面试锚点**
> - 为什么 HttpRequest 与 HttpResponse 必须区分生命周期？
> - JSON 树模型与 Bean 映射的成本差异是什么？
> - 工具库为什么不应该替业务决定重试和敏感日志策略？

## Related

- [转换与配置](/notes/source/java/base/hutool/convert-and-setting/)
- [Crypto 与 POI 扩展](/notes/source/java/base/hutool/crypto-and-poi/)
- [反射与 Bean 操作](/notes/source/java/base/hutool/reflection-and-bean/)