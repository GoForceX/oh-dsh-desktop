# Agent Note: 内置 dsh-context 作为上下文洞察插件

Status: implemented

[English](2026-08-25-bundle-dsh-context.md) | 中文

## Problem

Issue #136 希望三端统一展示上下文容量/余量统计。此前唯一内置信号是 DSH composer
的 context ring；更丰富的洞察需要每个用户自行寻找并安装第三方 `dsh-context`
npm 插件。Oh-DSH 需要为一个自带完整 DSH 插件构建体系的外部插件确定内置策略。

## Decision

- 以 `upstream/dsh-context` 子模块固定在 release tag `v0.31.1`，与其他固定源一
  致；`.gitmodules` 跟踪 `main`，gitlink 固定 tag。升级通过移动指针、经评审后
  完成——绝不在安装时跟随 npm latest。
- 在子模块内用上游自己的 tsdown 配置构建（`scripts/ensure-upstream-context.mjs`，
  与 dsh-TUI 编译相同的 stamp 防陈旧守卫）。`make upstream` 与 `pnpm run build`
  都会调用它，因此所有暂存路径——dist:* 链和从不执行 make 的 CI runtime
  任务——都会在暂存前产出 `upstream/dsh-context/lib`。并按 dsh-TUI 的暂存先例，
  用上游 manifest 把预构建的 `lib/` 以上游 npm 名 `dsh-context` 暂存——不做
  `plugins/` 适配层。host 保持未修改的普通 Cordis 插件；浏览器端就是上游自己的
  `window.__ModuleLoader__` bundle，面板与 `/context` 命令的行为与上游发布完全
  一致。
- 通过根目录和 `web/` 的 `cordis.patch.yml` insert 行挂载到 Desktop 与 Web；列入
  `BUNDLED_DESKTOP_CLIENT_PLUGINS`，让 runtime snapshot 与 smoke 套件断言客户端
  图注册。TUI 排除：插件围绕交互式面板构建，上游维护者不面向 TUI。
- host 的 import（`@deepseek-ai/dsh-session`、`dsh-settings`、
  `@deepseek-ai/schemastery`、`zod`）经由暂存运行时的 hoisted 树解析；不引入
  适配 manifest 或依赖镜像。也正因如此，Windows 依赖 deploy 只对声明了运行时
  `dependencies`/`optionalDependencies` 的 manifest 执行——只有 peer 的上游包不在
  pnpm workspace 内，deploy 的 filter 永远匹配不到它。
- `dist:*` 打包脚本现在按各自的 `--surface` 选择器（desktop/web/tui）暂存。此前
  它们暂存 `all`，这会把仅限 Desktop/Web 的 dsh-context 打进 TUI 发行包——而且
  一直以来每个发行包都混入了其他面的插件。`runtime-release.yml` 的全面运行时
  bundle 按设计继续暂存 `all`。

## Alternatives considered

**按上游作者建议跟随 npm latest。** 不采纳：这会让发行版中的插件不可评审、不可
按版本修复，也违背仓库的固定源规则与 release-only 更新策略。固定指针仍通过经过
评审的 PR 升级。

**像 dsh-vision 那样把源码适配进 `plugins/dsh-context`。** 不采纳：dsh-context
不是 Oh-DSH 需要改写的接缝——它是自带构建的自包含插件；适配副本会在毫无架构收益
的情况下分叉面板，并让升级工作翻倍。

**像 better-sidebar-runtime 那样做 manifest-only 适配层。** 不采纳：那个适配层
存在是因为 Oh-DSH 要用仓库控制的 externals 自行编译上游 host。dsh-context 自建
产物已经正确；重复一份 manifest 只会与上游版本漂移。

**纳入 TUI。** 不采纳，与 issue 讨论一致：价值在交互式仪表盘；上游明确不面向
TUI。

## Consequences

- Desktop 与 Web 用户开箱即得 Context 面板与 `/context`；面板与 composer 的
  context ring 并存（同样的事实，独立 tab）。
- `make upstream` 现在会执行 `pnpm --dir upstream/dsh-context install
  --frozen-lockfile --ignore-scripts && run build`；CI 与本地构建依赖该安装成功。
- `tests/plugin-collection.test.ts` 从子模块 manifest 解析 `dsh-context`；今后
  每个由上游 manifest 暂存的内置插件都要扩展该映射。
- 固定的 DSH 运行时必须继续提供插件的 host import（zod、scoped
  schemastery/cordis peer）——一旦运行时升级移除它们，staging 会在 smoke 阶段
  大声失败，而不是静默缺失。
