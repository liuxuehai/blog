---
title: AT 模式
description: Seata AT 模式的原理、两阶段提交、undo_log 机制与脏写检测。
category: Backend
tags:
  - Seata
  - AT Mode
  - Distributed Transaction
order: 531
updatedDate: 2024-08-12
difficulty: advanced
status: stable
lastReviewed: 2025-02-10
draft: false
sidebar:
  order: 531
---

AT（Automatic Transaction）模式是 Seata 默认的事务模式，对业务代码零侵入——框架自动拦截 SQL、生成回滚日志、完成二阶段提交或回滚。

<!-- more -->

## 工作原理

### 第一阶段：业务执行与数据准备

```text
1. 解析 SQL        → 拦截业务 SQL，解析语义
2. 记录前镜像      → 执行 SQL 前，查询记录修改前的数据快照
3. 执行业务 SQL
4. 记录后镜像      → 执行 SQL 后，查询记录修改后的数据快照
5. 生成 undo_log   → 前镜像 + 后镜像 → 回滚日志，写入 undo_log 表
6. 本地事务提交    → 业务 SQL 和 undo_log 在同一个本地事务中提交
7. 注册分支事务    → 向 TC 注册分支，获取全局锁
```

### 第二阶段：提交或回滚

**提交（Commit）：** 异步删除 undo_log 记录，对业务几乎无影响。

**回滚（Rollback）：**

```text
1. 根据 undo_log 中的前镜像数据生成逆向 SQL
2. 执行逆向 SQL 还原数据
3. 验证数据的后镜像与当前数据是否一致（防止脏写）
4. 删除 undo_log
```

### 完整流程图

```text
TM 发起全局事务 → TC 分配 XID
  ↓
RM 执行业务 SQL
  ├─ 记录 before image
  ├─ 执行 SQL
  ├─ 记录 after image
  ├─ 写入 undo_log（本地事务）
  └─ 向 TC 注册分支，获取全局锁
  ↓
TC 汇总所有分支状态
  ├─ 全部成功 → 异步删除 undo_log（二阶段提交）
  └─ 有失败   → 生成逆向 SQL → 校验 after image → 执行回滚 → 删除 undo_log
```

## undo_log 表结构

```sql
CREATE TABLE `undo_log` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `branch_id` bigint(20) NOT NULL,
  `xid` varchar(100) NOT NULL,
  `context` varchar(128) NOT NULL,
  `rollback_info` longblob NOT NULL,
  `log_status` int(11) NOT NULL,
  `log_created` datetime NOT NULL,
  `log_modified` datetime NOT NULL,
  `ext` varchar(100) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `ux_undo_log` (`xid`,`branch_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;
```

每个分支事务在同一数据库中写入一条 undo_log，`rollback_info` 字段存储前镜像和后镜像的序列化数据。

## 脏写检测

回滚时 Seata 会拿后镜像与当前数据对比：

- **一致**：说明没有其他人改过这条数据，安全回滚
- **不一致**：说明发生了脏写，回滚失败，需要人工介入

这是 AT 模式的重要安全机制，防止回滚覆盖其他事务的修改。

## 全局锁机制

AT 模式在一阶段提交前需要向 TC 申请全局锁。全局锁的作用：

- 保证不同分支事务不会同时修改同一行数据
- 回滚时能安全执行逆向 SQL
- 防止二阶段回滚与其他事务冲突

**全局锁的代价：** 高并发场景下，多个分支事务竞争同一行的全局锁会导致等待，成为性能瓶颈。

## 使用示例

```java
@GlobalTransactional(timeoutMills = 60000, name = "create-order")
public void createOrder(OrderDTO orderDTO) {
    // 本地事务：创建订单
    orderService.create(orderDTO);
    // 远程调用：扣减库存（分支事务）
    storageService.deduct(orderDTO.getProductId(), orderDTO.getCount());
    // 远程调用：扣减余额（分支事务）
    accountService.debit(orderDTO.getUserId(), orderDTO.getMoney());
}
```

只需加一个 `@GlobalTransactional` 注解，框架自动处理分支注册、回滚日志、二阶段提交。

## 适用条件

| 条件 | 说明 |
|------|------|
| 基于支持本地事务的关系数据库 | MySQL、PostgreSQL、Oracle 等 |
| 使用 JDBC 访问数据库 | 框架需要拦截 SQL |
| 微服务间通过 RPC 调用 | Feign、Dubbo、gRPC 等 |

## 局限性

| 局限 | 说明 |
|------|------|
| **性能开销** | 每次写操作多两次查询（前/后镜像）+ 一次 undo_log 写入 |
| **脏写回滚失败** | 回滚时发现数据被其他事务修改，需要人工处理 |
| **全局锁等待** | 一阶段提交前需要获取全局锁，高并发下可能成为瓶颈 |
| **不支持非 SQL 操作** | Redis、MongoDB、HTTP 调用等不能自动回滚 |
| **undo_log 膨胀** | 大批量操作时 undo_log 数据量大，需要及时清理 |
| **读隔离性弱** | 一阶段提交后数据已变更，但全局事务可能还未完成，存在脏读 |

> AT 模式适合大多数 CRUD 业务。对于性能要求极高、需要精确资源锁定或涉及非 SQL 操作的场景，考虑 TCC 或 Saga。
