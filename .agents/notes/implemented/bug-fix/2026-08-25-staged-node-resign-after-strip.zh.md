# Agent Note: macOS 上剥离符号后为暂存的 Node 二进制重新签名

Status: implemented

[English](2026-08-25-staged-node-resign-after-strip.md) | 中文

## Problem

`stage-dsh.mjs` 用 `strip -x` 剥离暂存 Node 二进制的符号以缩小发行包。Apple
Silicon 上的 Mach-O 必须携带有效代码签名；剥离会使签名失效，macOS 随即在每次
启动时杀死暂存的 Node（exit 137），`stage:dsh` 在自身的 `bin.js --version`
校验处失败。CI 一直没有暴露这个问题，因为 staging 任务跑在 Linux 上（没有签名
要求）；而 macOS-arm64 上的每次本地 staging、`make web` 和 `make desktop` 都是
坏的。

## Decision

在 darwin 上 `strip -x` 成功后，用 `/usr/bin/codesign --force --sign -` 对二进制
做 ad-hoc 重签名，与 `install-mac.mjs` 在安装时已有的做法一致。若 `codesign`
不可用或失败，打印警告并继续，而不是让 staging 失败：打包安装器在各自路径上
会自行重签。

## Alternatives considered

**在 macOS 上跳过剥离。** 不采纳：为了避免一次 codesign 调用，macOS 构建的包会
悄悄多出约 100 MB 符号。

**重签失败即让 staging 失败。** 不采纳：暂存树也是本地开发的便利设施；警告保留
了这一用途，同时若二进制真的不可用，运行时 `--version` 校验仍会大声失败。

## Consequences

- `stage:dsh`、`make web` 和 `make desktop` 在 macOS arm64 上恢复可用。
- macOS 构建的 Web/TUI 包携带重签过的剥离 Node，而不是被杀死的 Node。
- Linux 与 Windows 的 staging 路径不变。
