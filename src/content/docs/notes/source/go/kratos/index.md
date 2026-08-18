---
title: Kratos
description: Kratos 源码解析总览：应用生命周期、传输层、中间件、服务发现与配置日志。
category: Backend
tags: [Source Reading, Kratos, Go, Microservices]
order: 4
updatedDate: 2026-08-16
difficulty: advanced
status: stable
lastReviewed: 2026-08-16
draft: false
sidebar:
  order: 4
---

Kratos 是一个把应用生命周期、HTTP/gRPC 传输、中间件、服务注册发现、配置和日志组合起来的 Go 微服务框架。本册沿着“应用启动、服务器运行、请求进入、客户端发现、配置变更、优雅退出”的主线阅读源码。

<!-- more -->

## 版本快照

| 项 | 值 |
| --- | --- |
| 仓库 | `go-kratos/kratos` |
| 本地路径 | `E:\source\go\kratos` |
| 分支 | `main` |
| Commit | `668db92c`（2026-06-26） |
| 最近 tag | `v3.0.0` |

> 本册源码坐标均基于该 commit；上游演进后行号可能漂移。

## 它解决什么问题

- 用 `App` 统一服务器启动、注册、信号处理和优雅停止。
- 用统一 `transport.Server` 抽象承载 HTTP 与 gRPC。
- 用 `middleware.Handler` 把鉴权、日志、恢复、限流等横切逻辑串成调用链。
- 用 `Registrar`、`Discovery` 和 resolver 把服务治理适配器隔离在框架外。
- 用可组合的 config source、watcher 和 slog handler 支撑动态配置与结构化日志。

## 模块地图

| 模块 | 职责 | 关键入口 |
| --- | --- | --- |
| 根包 | 应用元数据、生命周期和 hooks | `New`、`Run`、`Stop` |
| `transport` | server、endpoint、请求上下文 | `Server`、`Transporter` |
| `transport/http` | HTTP server/client、路由和编解码 | `NewServer`、`NewClient` |
| `transport/grpc` | gRPC server/client、拦截器和 resolver | `NewServer`、`NewClient` |
| `middleware` | 通用 handler 链和按 operation 选择 | `Chain`、`selector.Build` |
| `registry`、`selector` | 注册发现和节点选择 | `Registrar`、`Discovery`、`Selector` |
| `config`、`log` | 配置合并/watch 和 slog 装饰器 | `config.New`、`log.NewHandler` |

## 本册目录

- [整体架构](/notes/source/go/kratos/architecture/)：App、transport 和依赖边界
- [App 生命周期](/notes/source/go/kratos/app-lifecycle/)：启动、注册、信号与优雅停止
- [HTTP 传输](/notes/source/go/kratos/http-transport/)：路由、Context、编解码与客户端
- [gRPC 传输](/notes/source/go/kratos/grpc-transport/)：拦截器、健康检查、反射与客户端
- [Middleware 链](/notes/source/go/kratos/middleware/)：handler 组合、selector 与上下文
- [注册发现与负载选择](/notes/source/go/kratos/registry-selector/)：watch、resolver、subset 与 WRR
- [Config 与 Log](/notes/source/go/kratos/config-log/)：动态配置、slog handler 与上下文属性
- [错误、Metadata 与编码](/notes/source/go/kratos/errors-metadata/)：跨 HTTP/gRPC 的错误和元数据模型
- [面试专题](/notes/source/go/kratos/interview/)：源码级高频题与排障场景

## Related

- [Go 源码解析](/notes/source/go/)
- [etcd 源码解析](/notes/source/go/etcd/)
- [go-zero 源码解析](/notes/source/go/go-zero/)
