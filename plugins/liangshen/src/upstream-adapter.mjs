import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const LIANGSHEN_METADATA = {
  id: 'liangshen',
  name: '梁神模式',
  description: '主 Agent 与子 Agent 首轮均保持 Minimal 双工具，首次工具调用后开放完整目录，压缩后重新锚定。',
}

const LIANGSHEN_MESSAGES = {
  en: {
    name: 'Liangshen mode',
    description: 'Keeps the main agent and subagents on the Minimal two-tool bootstrap for the first model request, exposes the full catalog after the first tool call, and re-anchors after compaction.',
  },
  zh: {
    name: LIANGSHEN_METADATA.name,
    description: LIANGSHEN_METADATA.description,
  }
}

function replaceRequired(source, before, after, path) {
  if (source.includes(after)) return source
  const first = source.indexOf(before)
  if (first === -1 || source.indexOf(before, first + before.length) !== -1) {
    throw new Error(`Liangshen presentation adapter seam changed: ${path}`)
  }
  return source.slice(0, first) + after + source.slice(first + before.length)
}

function patchFile(path, replacements) {
  const source = readFileSync(path, 'utf8')
  const next = replacements.reduce(
    (current, [before, after]) => replaceRequired(current, before, after, path),
    source,
  )
  if (next !== source) writeFileSync(path, next)
}

/**
 * Adapt the pinned DSH browser preset renderer inside an assembled runtime.
 * Exact anchors make a DSH package change fail staging instead of silently
 * returning to mixed-language Liangshen copy.
 */
export function adaptDshLiangshenPresentation(runtimeRoot) {
  const path = dshAgentPresetClientPath(runtimeRoot)
  if (!existsSync(path)) {
    throw new Error('dsh-client-ui-agent-preset is missing from the staged runtime')
  }
  const englishAnchor = '\t\t\tpresetCordisDescription: "Built for creating custom agent presets, with all Standard mode capabilities plus runtime inspection, plugin experiments, and preset-authoring guidance.",'
  const chineseAnchor = '\t\t\tpresetCordisDescription: "用于创建自定义 Agent preset：具备标准模式的全部能力，并提供运行时检查、插件实验和 preset 创作指导。",'
  const mappingAnchor = [
    '\t\t\tcordis: {',
    '\t\t\t\tname: "presetCordisName",',
    '\t\t\t\tdescription: "presetCordisDescription"',
    '\t\t\t}',
  ].join('\n')
  const resolverAnchor = '\t\t\tconst keys = preset.trust === "system" ? BUILT_IN_PRESET_KEYS[preset.id] : void 0;'
  patchFile(path, [
    [englishAnchor, [
      englishAnchor,
      `\t\t\tpresetLiangshenName: ${JSON.stringify(LIANGSHEN_MESSAGES.en.name)},`,
      `\t\t\tpresetLiangshenDescription: ${JSON.stringify(LIANGSHEN_MESSAGES.en.description)},`,
    ].join('\n')],
    [chineseAnchor, [
      chineseAnchor,
      `\t\t\tpresetLiangshenName: ${JSON.stringify(LIANGSHEN_MESSAGES.zh.name)},`,
      `\t\t\tpresetLiangshenDescription: ${JSON.stringify(LIANGSHEN_MESSAGES.zh.description)},`,
    ].join('\n')],
    [mappingAnchor, [
      mappingAnchor + ',',
      '\t\t\tliangshen: {',
      '\t\t\t\tname: "presetLiangshenName",',
      '\t\t\t\tdescription: "presetLiangshenDescription"',
      '\t\t\t}',
    ].join('\n')],
    [resolverAnchor, [
      `\t\t\tconst isOhDshLiangshen = preset.id === ${JSON.stringify(LIANGSHEN_METADATA.id)}`,
      `\t\t\t\t&& preset.name === ${JSON.stringify(LIANGSHEN_METADATA.name)}`,
      `\t\t\t\t&& preset.description === ${JSON.stringify(LIANGSHEN_METADATA.description)};`,
      '\t\t\tconst keys = preset.trust === "system" || isOhDshLiangshen',
      '\t\t\t\t? BUILT_IN_PRESET_KEYS[preset.id]',
      '\t\t\t\t: void 0;',
    ].join('\n')],
  ])
}

/**
 * Adapt the pinned dsh-TUI preset renderer inside its copied package.
 * The renderer receives localized metadata only for the canonical managed
 * copy; another user-authored `liangshen` preset keeps its own display text.
 */
export function adaptTuiLiangshenPresentation(packageDir) {
  const types = join(packageDir, 'lib', 'types')
  const messagesPath = join(types, 'i18n.js')
  const messagesAnchor = "    'preset-unavailable': { zh: 'Preset 不可用——当前组合未挂载 agent-presets 名册', en: 'Preset unavailable — the agent-presets roster is not mounted' },"
  patchFile(messagesPath, [[messagesAnchor, [
      messagesAnchor,
      `    'preset-liangshen-name': { zh: ${JSON.stringify(LIANGSHEN_MESSAGES.zh.name)}, en: ${JSON.stringify(LIANGSHEN_MESSAGES.en.name)} },`,
      `    'preset-liangshen-description': { zh: ${JSON.stringify(LIANGSHEN_MESSAGES.zh.description)}, en: ${JSON.stringify(LIANGSHEN_MESSAGES.en.description)} },`,
    ].join('\n')]])

  const channelPath = join(types, 'dsh-adapter', 'channel.js')
  const channelAnchor = [
      '                return list.map(preset => ({',
      '                    id: preset.id,',
      '                    ...(preset.name === undefined ? {} : { name: preset.name }),',
      '                    ...(preset.description === undefined ? {} : { description: preset.description }),',
      '                    ...(preset.broken === undefined ? {} : { broken: preset.broken }),',
      '                    isDefault: preset.id === presets.defaultId,',
      '                }));',
    ].join('\n')
  const channelReplacement = [
      '                return list.map(preset => {',
      `                    const isOhDshLiangshen = preset.id === ${JSON.stringify(LIANGSHEN_METADATA.id)}`,
      `                        && preset.name === ${JSON.stringify(LIANGSHEN_METADATA.name)}`,
      `                        && preset.description === ${JSON.stringify(LIANGSHEN_METADATA.description)};`,
      '                    return {',
      '                        id: preset.id,',
      "                        ...(isOhDshLiangshen ? { name: t('preset-liangshen-name') }",
      '                            : preset.name === undefined ? {} : { name: preset.name }),',
      "                        ...(isOhDshLiangshen ? { description: t('preset-liangshen-description') }",
      '                            : preset.description === undefined ? {} : { description: preset.description }),',
      '                        ...(preset.broken === undefined ? {} : { broken: preset.broken }),',
      '                        isDefault: preset.id === presets.defaultId,',
      '                    };',
      '                });',
    ].join('\n')
  patchFile(channelPath, [[channelAnchor, channelReplacement]])
}

/** Resolve the pinned DSH browser bundle in pnpm or hoisted deployments. */
function dshAgentPresetClientPath(runtimeRoot) {
  const hoisted = join(
    runtimeRoot,
    'node_modules',
    '@deepseek-ai',
    'dsh-client-ui-agent-preset',
    'lib',
    'client.js',
  )
  if (existsSync(hoisted)) return hoisted

  const store = join(runtimeRoot, 'node_modules', '.pnpm')
  if (existsSync(store)) {
    const entry = readdirSync(store, { withFileTypes: true })
      .find(candidate => candidate.isDirectory()
        && candidate.name.startsWith('@deepseek-ai+dsh-client-ui-agent-preset@'))
    if (entry !== undefined) {
      return join(
        store,
        entry.name,
        'node_modules',
        '@deepseek-ai',
        'dsh-client-ui-agent-preset',
        'lib',
        'client.js',
      )
    }
  }
  return hoisted
}

const invokedPath = process.argv[1] === undefined
  ? null
  : pathToFileURL(resolve(process.argv[1])).href
if (invokedPath === import.meta.url) {
  const [surface, target] = process.argv.slice(2)
  if (target === undefined || process.argv.length !== 4) {
    throw new Error('usage: node upstream-adapter.mjs <dsh|tui> <runtime-or-package-root>')
  }
  if (surface === 'dsh') adaptDshLiangshenPresentation(resolve(target))
  else if (surface === 'tui') adaptTuiLiangshenPresentation(resolve(target))
  else throw new Error(`unknown Liangshen presentation surface: ${String(surface)}`)
}
