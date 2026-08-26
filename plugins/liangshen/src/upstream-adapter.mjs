import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const LIANGSHEN_METADATA = {
  id: 'liangshen',
  name: '梁神模式',
  description: '主 Agent 与子 Agent 首轮均保持 Minimal 双工具，首次工具调用后开放完整目录，压缩后重新锚定。',
}
const LIANGSHEN_OWNER = '@deepseek-harness-tui/dsh-tui'
const LIANGSHEN_MARKER = '.dsh-tui-managed.json'

const LIANGSHEN_MESSAGES = {
  en: {
    name: 'Liangshen mode',
    description: 'Keeps the main agent and subagents on the Minimal two-tool bootstrap for the first model request, exposes the full catalog after the first tool call, and re-anchors after compaction.',
  },
  zh: {
    name: LIANGSHEN_METADATA.name,
    description: LIANGSHEN_METADATA.description,
  },
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
 * Carry the managed-preset marker through the pinned Host roster and API.
 * Display strings stay ordinary user metadata; only the package-owned marker
 * can authorize the downstream presentation adapters.
 */
export function adaptDshLiangshenOwnership(runtimeRoot) {
  const rosterPath = dshPackageFilePath(
    runtimeRoot,
    'dsh-agent-presets',
    'lib',
    'index.js',
  )
  const apiPath = dshPackageFilePath(
    runtimeRoot,
    'dsh-host-apiproxy',
    'lib',
    'index.js',
  )
  for (const path of [rosterPath, apiPath]) {
    if (!existsSync(path)) {
      throw new Error(`Liangshen ownership adapter dependency is missing: ${path}`)
    }
  }

  const metadataAnchor = 'const METADATA_FILE = "preset.yml";'
  const scanAnchor = 'async function scanRoot(root) {'
  const rosterAnchor = [
    '\t\tconst metadata = await readPresetMetadata(directory);',
    '\t\tfound.push({',
    '\t\t\tid: child.name,',
    '\t\t\ttrust: root.trust,',
    '\t\t\tpath,',
    '\t\t\t...metadata,',
    '\t\t\t...broken === void 0 ? {} : { broken }',
    '\t\t});',
  ].join('\n')
  patchFile(rosterPath, [
    [metadataAnchor, [
      metadataAnchor,
      `const OH_DSH_LIANGSHEN_MARKER = ${JSON.stringify(LIANGSHEN_MARKER)};`,
      `const OH_DSH_LIANGSHEN_OWNER = ${JSON.stringify(LIANGSHEN_OWNER)};`,
    ].join('\n')],
    [scanAnchor, [
      'async function ohDshManagedPresetOwner(directory, id) {',
      `\tif (id !== ${JSON.stringify(LIANGSHEN_METADATA.id)}) return void 0;`,
      '\ttry {',
      '\t\tconst marker = JSON.parse(await readFile(join(directory, OH_DSH_LIANGSHEN_MARKER), "utf8"));',
      '\t\treturn typeof marker === "object" && marker !== null && !Array.isArray(marker)',
      '\t\t\t&& marker.owner === OH_DSH_LIANGSHEN_OWNER && marker.preset === id',
      '\t\t\t? marker.owner',
      '\t\t\t: void 0;',
      '\t} catch {',
      '\t\treturn void 0;',
      '\t}',
      '}',
      scanAnchor,
    ].join('\n')],
    [rosterAnchor, [
      '\t\tconst metadata = await readPresetMetadata(directory);',
      '\t\tconst managedBy = await ohDshManagedPresetOwner(directory, child.name);',
      '\t\tfound.push({',
      '\t\t\tid: child.name,',
      '\t\t\ttrust: root.trust,',
      '\t\t\tpath,',
      '\t\t\t...managedBy === void 0 ? {} : { managedBy },',
      '\t\t\t...metadata,',
      '\t\t\t...broken === void 0 ? {} : { broken }',
      '\t\t});',
    ].join('\n')],
  ])

  const apiRosterAnchor = [
    '\t\t\t\t\t\tid: preset.id,',
    '\t\t\t\t\t\ttrust: preset.trust,',
    '\t\t\t\t\t\tisDefault: preset.id === defaultId,',
  ].join('\n')
  const apiSchemaAnchor = [
    '\tid: z$1.string().min(1),',
    '\ttrust: z$1.union([z$1.literal("system"), z$1.literal("user")]),',
    '\tisDefault: z$1.boolean(),',
  ].join('\n')
  patchFile(apiPath, [
    [apiRosterAnchor, [
      '\t\t\t\t\t\tid: preset.id,',
      '\t\t\t\t\t\ttrust: preset.trust,',
      '\t\t\t\t\t\t...preset.managedBy === void 0 ? {} : { managedBy: preset.managedBy },',
      '\t\t\t\t\t\tisDefault: preset.id === defaultId,',
    ].join('\n')],
    [apiSchemaAnchor, [
      '\tid: z$1.string().min(1),',
      '\ttrust: z$1.union([z$1.literal("system"), z$1.literal("user")]),',
      '\tmanagedBy: z$1.string().min(1).optional(),',
      '\tisDefault: z$1.boolean(),',
    ].join('\n')],
  ])
}

/**
 * Adapt the pinned DSH browser preset renderer inside an assembled runtime.
 * Exact anchors make a DSH package change fail staging instead of silently
 * returning to mixed-language Liangshen copy.
 */
export function adaptDshLiangshenPresentation(runtimeRoot) {
  const path = dshPackageFilePath(
    runtimeRoot,
    'dsh-client-ui-agent-preset',
    'lib',
    'client.js',
  )
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
      `\t\t\tconst isOhDshLiangshen = preset.managedBy === ${JSON.stringify(LIANGSHEN_OWNER)}`,
      `\t\t\t\t&& preset.id === ${JSON.stringify(LIANGSHEN_METADATA.id)}`,
      `\t\t\t\t&& preset.name === ${JSON.stringify(LIANGSHEN_METADATA.name)}`,
      `\t\t\t\t&& preset.description === ${JSON.stringify(LIANGSHEN_METADATA.description)};`,
      '\t\t\tconst keys = preset.trust === "system" || isOhDshLiangshen',
      '\t\t\t\t? BUILT_IN_PRESET_KEYS[preset.id]',
      '\t\t\t\t: void 0;',
    ].join('\n')],
    [[
      '\t\t\t\tid: preset.id,',
      '\t\t\t\ttrust: preset.trust,',
      '\t\t\t\t...preset.name === void 0 ? {} : { name: preset.name },',
    ].join('\n'), [
      '\t\t\t\tid: preset.id,',
      '\t\t\t\ttrust: preset.trust,',
      '\t\t\t\t...preset.managedBy === void 0 ? {} : { managedBy: preset.managedBy },',
      '\t\t\t\t...preset.name === void 0 ? {} : { name: preset.name },',
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
      `                    const isOhDshLiangshen = preset.managedBy === ${JSON.stringify(LIANGSHEN_OWNER)}`,
      `                        && preset.id === ${JSON.stringify(LIANGSHEN_METADATA.id)}`,
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

/** Resolve one pinned DSH package file in pnpm or hoisted deployments. */
function dshPackageFilePath(runtimeRoot, packageName, ...segments) {
  const packagePath = join(
    'node_modules',
    '@deepseek-ai',
    packageName,
    ...segments,
  )
  const hoisted = join(runtimeRoot, packagePath)
  if (existsSync(hoisted)) return hoisted

  const store = join(runtimeRoot, 'node_modules', '.pnpm')
  if (existsSync(store)) {
    const entry = readdirSync(store, { withFileTypes: true })
      .find(candidate => candidate.isDirectory()
        && existsSync(join(store, candidate.name, packagePath)))
    if (entry !== undefined) {
      return join(store, entry.name, packagePath)
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
    throw new Error('usage: node upstream-adapter.mjs <ownership|dsh|tui> <runtime-or-package-root>')
  }
  if (surface === 'ownership') adaptDshLiangshenOwnership(resolve(target))
  else if (surface === 'dsh') adaptDshLiangshenPresentation(resolve(target))
  else if (surface === 'tui') adaptTuiLiangshenPresentation(resolve(target))
  else throw new Error(`unknown Liangshen presentation surface: ${String(surface)}`)
}
