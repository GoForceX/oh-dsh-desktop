# Agent Note：Linux Marketplace 脚本预览隔离

Status: implemented

[English](2026-08-26-linux-marketplace-scripted-previews.md) | 中文

## 问题

Marketplace 的生命周期脚本需要进程级写入隔离。之前的实现只识别 macOS
Seatbelt，因此 Linux 用户无法预览或安装带脚本的插件，尽管打包的 Linux
运行时已经包含 Landlock 启动器。

## 决定

Linux x64 的 Marketplace 与预览运行时使用 staged 的 `landlock-run`，对主机
运行时提供只读访问，允许写入单一事务根目录，并显式授予 /dev/null 写权限，
以便构建脚本使用普通的空重定向。macOS 保留 Seatbelt。其他平台对脚本预览继续
fail-closed。安全启动器不可用时，只有直接的人类 UI 事务可以使用独立的不安全
构建确认；Agent 事务不能授权该模式。

## 曾考虑的替代方案

**以用户权限直接运行 Linux 脚本**：不采纳，因为环境变量重定向不是进程隔离，
会把主机文件和用户凭据暴露给第三方构建代码。

**把通用高风险或构建脚本确认视为充分授权**：不采纳，因为这会允许 Agent 或
过期的序列化命令授权无隔离执行。

## 影响

Linux x64 打包运行时必须包含可执行的 Landlock 启动器，且 Nix 组装需要注册与
staged 运行时一致的 desktop-frame/marketplace 插件，保证候选 profile 解析一致。
该启动器提供文件系统隔离，但不提供网络隔离。不安全模式仍是刻意的用户权限逃逸，
绝不能描述为隔离预览，也不得由其他确认隐式启用。
