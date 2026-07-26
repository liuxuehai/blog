---
title: XA 模式
description: Seata XA 模式的两阶段提交原理、数据库原生协议、强一致与性能权衡。
category: Backend
tags:
  - Seata
  - XA Mode
  - Distributed Transaction
  - 2PC
order: 534
updatedDate: 2026-07-26
difficulty: advanced
status: stable
lastReviewed: 2026-07-26
draft: false
sidebar:
  order: 534
---

XA 模式是基于数据库 XA 协议的标准两阶段提交，由数据库自身保证事务的原子性，Seata 作为事务协调者调度各分支。

<!-- more -->

## 工作原理

XA 是 X/Open 组织定义的分布式事务规范，核心思想是**两阶段提交（2PC）**：

### 第一阶段：准备（Prepare）

```text
TC 通知所有 RM 准备事务
  ↓
各 RM 执行本地事务，但不提交
  ├─ 执行 SQL
  ├─ 持有数据库锁（行锁、间隙锁等）
  └─ 向 TC 回复 "准备就绪" 或 "准备失败"
```

### 第二阶段：提交/回滚（Commit/Rollback）

```text
TC 汇总所有 RM 的准备结果
  ├─ 全部就绪 → 通知所有 RM 提交
  └─ 有失败   → 通知所有 RM 回滚
  ↓
各 RM 执行提交或回滚，释放锁
```

### 与 AT 的关键区别

| 维度 | XA | AT |
|------|-----|-----|
| 锁持有时间 | 整个二阶段（prepare → commit） | 一阶段提交后即释放 |
| 一致性 | 强一致（数据库级别） | 最终一致（存在中间状态） |
| 隔离性 | 读已提交（数据库原生） | 读未提交（一阶段已提交） |
| 性能 | 低（锁持有时间长） | 中等 |
| 回滚方式 | 数据库原生回滚 | 框架生成逆向 SQL |
| undo_log | 不需要 | 需要 |

## Seata 中的 XA 实现

Seata 对 XA 的封装基于 JDBC XA 协议：

```java
@GlobalTransactional
public void transfer(String fromAccount, String toAccount, BigDecimal amount) {
    // 分支 1：扣减（XA 事务）
    accountService.debit(fromAccount, amount);
    // 分支 2：增加（XA 事务）
    accountService.credit(toAccount, amount);
}
```

底层实现：

```text
TM 开启全局事务
  ↓
RM1: XA START → 执行 SQL → XA END → XA PREPARE → 向 TC 注册分支
RM2: XA START → 执行 SQL → XA END → XA PREPARE → 向 TC 注册分支
  ↓
TC 汇总：
  ├─ 全部 prepare 成功 → XA COMMIT（所有分支）
  └─ 有失败 → XA ROLLBACK（所有分支）
```

## XA 的强一致保证

XA 模式的核心价值是**数据库级别的强一致**：

1. **Prepare 阶段不释放锁**：其他事务看不到中间状态
2. **Commit/Rollback 由数据库保证原子性**：不会出现部分提交
3. **没有脏读问题**：锁在二阶段完成前一直持有

```text
事务 A: XA START → UPDATE account SET balance = balance - 100 → XA END → XA PREPARE
  ↓ （此时 balance 已变但未提交，事务 B 读不到新值）
事务 B: SELECT balance → 读到的是旧值（数据库锁保护）
  ↓
事务 A: XA COMMIT → 事务 B 才能看到新值
```

## 性能代价

XA 的强一致是有代价的：

| 代价 | 说明 |
|------|------|
| **锁持有时间长** | 从 prepare 到 commit 期间一直持有数据库锁 |
| **并发能力差** | 多事务竞争同一行时，排队等待锁 |
| **吞吐量低** | 两次网络往返（prepare + commit）+ 锁等待 |
| **死锁风险** | 多分支事务交叉锁定可能导致死锁 |

> XA 的性能问题本质上是"强一致"和"高并发"的矛盾。锁持有时间越长，一致性越好，但并发越差。

## 适用场景

| 场景 | 原因 |
|------|------|
| **短事务** | 锁持有时间短，性能影响可控 |
| **强一致要求** | 不允许脏读、不允许中间状态可见 |
| **数据量小** | 涉及的行数少，锁竞争不激烈 |
| **跨数据库** | 不同服务使用不同数据库，需要数据库级别的原子性 |
| **合规要求** | 金融监管要求强一致，不能接受最终一致 |

## 不适用场景

| 场景 | 原因 |
|------|------|
| **高并发写入** | 锁竞争严重，吞吐量低 |
| **长事务** | 锁持有时间过长，影响其他事务 |
| **大数据量** | 涉及行数多，锁范围大 |
| **跨系统集成** | 非数据库资源（HTTP、MQ）不支持 XA |

## XA vs AT vs TCC 选型

| 维度 | XA | AT | TCC |
|------|-----|-----|-----|
| 一致性 | 强一致 | 最终一致 | 强一致 |
| 隔离性 | 读已提交 | 读未提交 | 可串行化 |
| 性能 | 低 | 中等 | 高 |
| 侵入性 | 低 | 低 | 高 |
| 锁持有时间 | 长（二阶段） | 短（一阶段后释放） | 自定义 |
| 适用场景 | 短事务、强一致 | 通用 CRUD | 高并发、精确资源控制 |

```text
选型决策：
  ├─ 需要强一致？
  │   ├─ 短事务、低并发 → XA
  │   └─ 高并发、精确资源控制 → TCC
  └─ 可以接受最终一致 → AT
```

> XA 模式适合"短事务 + 强一致"的场景。如果事务时间长或并发高，XA 的锁会成为瓶颈，应该考虑 AT 或 TCC。
