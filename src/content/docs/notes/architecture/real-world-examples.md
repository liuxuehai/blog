---
title: 工程实践
description: 业财系统建模、支付渠道路由、老系统引入 DDD、避免伪 DDD。
category: Architecture
tags:
  - DDD
  - Practice
  - Payment
  - Billing
order: 35
updatedDate: 2026-07-26
difficulty: advanced
status: stable
lastReviewed: 2026-07-26
draft: false
sidebar:
  order: 35
---

概念讲完不如看例子。这里用业财系统和支付渠道路由两个场景，展示 DDD 怎么落地。

<!-- more -->

## 业财系统建模示例

可以把业财中心拆成几个领域：收款域、付款域、清分域、对账域、账务域、结算域。

### 收款域

**实体 / 聚合：**

| 类型 | 名称 | 说明 |
|------|------|------|
| 聚合根 | ReceiptOrder | 收款单 |
| 内部对象 | ReceiptDetail | 收款明细 |
| 内部对象 | Deduction | 抵扣记录 |

**值对象：** Money、AccountNo、PaymentChannel、BusinessNo

**领域行为：** 创建收款单、确认收款、发起抵扣、撤销抵扣、完成清分

**领域事件：** ReceiptConfirmed、DeductionApplied、ClearingCompleted

**应用服务编排：** 查询收款单 → 开启事务 → 调用收款聚合确认收款 → 保存聚合 → 发布事件给清分或账务模块

## 支付渠道路由

支付渠道选择可以建模为领域服务：

```text
PaymentRouteService
  输入：支付金额、业务类型、可用渠道、渠道额度、优先级、权重、风控结果
  输出：选中的支付渠道
```

**领域规则：**

- 渠道是否启用
- 单笔限额是否满足
- 当日额度是否充足
- 业务类型是否支持
- 成本或优先级排序
- 失败后是否允许切换渠道

不要把这些规则都写在 if-else 很长的应用服务里，可以通过策略模式或规则对象封装。

## 如何避免伪 DDD

**常见伪 DDD：**

- 只建了 domain 包，但业务逻辑仍全在 Service
- Entity 只有 getter/setter
- Repository 只是 Mapper 换了名字
- 聚合没有一致性规则
- 领域事件只是 MQ 消息 DTO

**避免方式：**

- 先识别核心业务规则
- 让聚合方法表达状态变更
- 用值对象封装业务概念
- 应用服务只做编排
- Repository 面向聚合

## 在老系统中引入 DDD

不要一次性重构。

**建议步骤：**

1. 找复杂且变化频繁的核心业务
2. 先梳理统一语言和状态流转
3. 在新需求或局部模块中引入聚合和值对象
4. 保持旧 DAO/Service 可用，通过防腐层隔离
5. 逐步把核心规则迁移到领域模型
