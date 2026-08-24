---
title: Crypto 与 POI 扩展
description: Hutool Crypto、Excel/POI 扩展的适配层、资源生命周期和安全边界。
category: Backend
tags: [Source Reading, Hutool, Crypto, POI]
order: 95
updatedDate: 2026-08-24
difficulty: advanced
status: stable
lastReviewed: 2026-08-24
draft: false
sidebar:
  order: 95
---

Crypto 和 POI 是 Hutool 核心之外的专业模块，源码重点不是重新实现密码学或 Office 格式，而是把 JCA、Apache POI 的对象模型包装成较短的调用链。

<!-- more -->

## 先给答案：Crypto 和 POI 是 Hutool 核心之外的专业模块，源码重点不是重新实现密码学或 Office…

Crypto 和 POI 是 Hutool 核心之外的专业模块，源码重点不是重新实现密码学或 Office 格式，而是把 JCA、Apache POI 的对象模型包装成较短的调用链。 正文沿“Crypto 的分层 -> POI 读写模型 -> 模块边界”展开：先确认入口和状态归属，再跟踪控制流或数据流的推进，最后落到对外可观察的结果。

主要失效边界集中在“这些扩展模块不应被无条件放进基础服务的核心类路径”这些场景。它们破坏的是容量、顺序、并发或生命周期前提；排查时应先确认状态是否仍由正确对象持有，再核对推进条件和清理路径。

## Crypto 的分层

```text
SecureUtil / DigestUtil
        -> SymmetricCrypto / Sign / KeyUtil
        -> JCA Cipher / MessageDigest / Signature
        -> byte[] / hex / base64
```

`DigestUtil` 适合摘要和编码；对称加密、非对称加密和签名需要区分密钥、随机数、模式、padding 和验证方向。工具类可以简化初始化，不能改变算法参数的安全含义。

| 场景 | 不应混淆 |
| --- | --- |
| 摘要 | 不可逆完整性校验，不等于加密 |
| 加密 | 需要解密密钥与随机数管理 |
| 签名 | 私钥签名、公钥验证，不等于保密 |
| 密码存储 | 应使用专用慢哈希和盐，不是普通 MD5/SHA |

默认算法、固定 IV、弱随机数和把密钥写进配置文件，都是调用层需要主动审查的风险。

## POI 读写模型

Excel 模块通常围绕 `ExcelReader`、`ExcelWriter`、行/单元格转换和流生命周期组织：

```text
文件/流 -> Workbook -> Sheet/Row/Cell
         -> Bean/Map 映射或逐行回调
         -> 写出 -> flush / close
```

一次性把大表转成 List 方便，但会放大堆内存；逐行处理更适合导入任务。写入时还要关注样式对象数量、公式、日期和用户可控内容导致的 CSV/Excel 注入风险。

## 模块边界

这些扩展模块不应被无条件放进基础服务的核心类路径。使用时需确认依赖版本、许可证、线程安全和关闭责任；Hutool 的门面只降低 API 复杂度，不消除底层库的运行约束。

> **面试锚点**
> - 摘要、加密和签名的语义分别是什么？
> - 为什么 POI 大文件导入要优先考虑流式或逐行处理？
> - “封装第三方库”怎样避免把底层错误和安全配置隐藏掉？

## Related

- [整体架构](/notes/source/java/base/hutool/architecture/)
- [HTTP 与 JSON](/notes/source/java/base/hutool/http-and-json/)
- [反射与 Bean 操作](/notes/source/java/base/hutool/reflection-and-bean/)