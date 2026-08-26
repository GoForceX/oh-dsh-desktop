import assert from 'node:assert/strict'
import {
  cpSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { apply, installLiangshenPreset } from '../plugins/liangshen/src/index.ts'
import {
  adaptDshLiangshenPresentation,
  adaptTuiLiangshenPresentation,
} from '../plugins/liangshen/src/upstream-adapter.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const source = join(root, 'upstream', 'dsh-TUI', 'presets', 'liangshen')

test('Liangshen plugin installs and reconciles its managed preset', () => {
  const temp = mkdtempSync(join(tmpdir(), 'oh-dsh-liangshen-'))
  const sourceCopy = join(temp, 'source')
  const dataRoot = join(temp, 'data')
  try {
    cpSync(source, sourceCopy, { recursive: true })
    assert.equal(installLiangshenPreset({ dataRoot, sourceRoot: sourceCopy }), 'installed')
    const target = join(dataRoot, '.agent-presets', 'liangshen')
    assert.match(requireFile(join(target, 'agent.cordis.yml')), /tool-bootstrap/)
    assert.equal(installLiangshenPreset({ dataRoot, sourceRoot: sourceCopy }), 'current')

    writeFileSync(join(sourceCopy, '.dsh-tui-managed.json'), JSON.stringify({
      owner: '@deepseek-harness-tui/dsh-tui',
      preset: 'liangshen',
      revision: 'next',
    }) + '\n')
    assert.equal(installLiangshenPreset({ dataRoot, sourceRoot: sourceCopy }), 'installed')
    assert.match(requireFile(join(target, '.dsh-tui-managed.json')), /"revision":"next"/)
  } finally {
    rmSync(temp, { recursive: true, force: true })
  }
})

test('Liangshen plugin preserves an unmanaged user preset', () => {
  const temp = mkdtempSync(join(tmpdir(), 'oh-dsh-liangshen-conflict-'))
  const sourceCopy = join(temp, 'source')
  const dataRoot = join(temp, 'data')
  const target = join(dataRoot, '.agent-presets', 'liangshen')
  try {
    cpSync(source, sourceCopy, { recursive: true })
    mkdirSync(target, { recursive: true })
    writeFileSync(join(target, 'agent.cordis.yml'), 'user-owned\n')
    assert.equal(installLiangshenPreset({ dataRoot, sourceRoot: sourceCopy }), 'conflict')
    assert.equal(requireFile(join(target, 'agent.cordis.yml')), 'user-owned\n')
  } finally {
    rmSync(temp, { recursive: true, force: true })
  }
})

function requireFile(path: string): string {
  return readFileSync(path, 'utf8')
}

const AGENT_PRESET_CLIENT_PATH = join(
  'node_modules',
  '@deepseek-ai',
  'dsh-client-ui-agent-preset',
  'lib',
  'client.js',
)

function pinnedAgentPresetClient(): string {
  const store = join(root, 'node_modules', '.pnpm')
  const entry = readdirSync(store, { withFileTypes: true })
    .find(candidate => candidate.isDirectory()
      && existsSync(join(store, candidate.name, AGENT_PRESET_CLIENT_PATH)))
  assert.ok(entry, 'pinned dsh-client-ui-agent-preset package is unavailable')
  return join(store, entry.name, AGENT_PRESET_CLIENT_PATH)
}

test('Liangshen adapters localize the pinned browser and TUI preset renderers', () => {
  const temp = mkdtempSync(join(tmpdir(), 'oh-dsh-liangshen-presentation-'))
  try {
    const runtime = join(temp, 'runtime')
    const browserClient = join(
      runtime,
      'node_modules',
      '.pnpm',
      'virtual-store-hash',
      AGENT_PRESET_CLIENT_PATH,
    )
    mkdirSync(dirname(browserClient), { recursive: true })
    cpSync(pinnedAgentPresetClient(), browserClient)
    adaptDshLiangshenPresentation(runtime)
    const browserSource = requireFile(browserClient)
    assert.match(browserSource, /Liangshen mode/)
    assert.match(browserSource, /preset\.name === "梁神模式"/)
    assert.match(browserSource, /preset\.description === "主 Agent 与子 Agent/)

    const hoistedRuntime = join(temp, 'hoisted-runtime')
    const hoistedClient = join(
      hoistedRuntime,
      'node_modules',
      '@deepseek-ai',
      'dsh-client-ui-agent-preset',
      'lib',
      'client.js',
    )
    mkdirSync(dirname(hoistedClient), { recursive: true })
    cpSync(pinnedAgentPresetClient(), hoistedClient)
    adaptDshLiangshenPresentation(hoistedRuntime)
    assert.match(requireFile(hoistedClient), /Liangshen mode/)

    const tui = join(temp, 'tui')
    const tuiTypes = join(tui, 'lib', 'types')
    mkdirSync(join(tuiTypes, 'dsh-adapter'), { recursive: true })
    cpSync(join(root, 'upstream', 'dsh-TUI', 'lib', 'types', 'i18n.js'), join(tuiTypes, 'i18n.js'))
    cpSync(
      join(root, 'upstream', 'dsh-TUI', 'lib', 'types', 'dsh-adapter', 'channel.js'),
      join(tuiTypes, 'dsh-adapter', 'channel.js'),
    )
    adaptTuiLiangshenPresentation(tui)
    assert.match(requireFile(join(tuiTypes, 'i18n.js')), /Liangshen mode/)
    assert.match(requireFile(join(tuiTypes, 'dsh-adapter', 'channel.js')), /isOhDshLiangshen/)

    assert.doesNotThrow(() => {
      adaptDshLiangshenPresentation(runtime)
      adaptDshLiangshenPresentation(hoistedRuntime)
      adaptTuiLiangshenPresentation(tui)
    })
  } finally {
    rmSync(temp, { recursive: true, force: true })
  }
})

test('Nix applies Liangshen presentation adapters to its copied runtimes', () => {
  const nix = requireFile(join(root, 'nix', 'oh-dsh.nix'))
  assert.equal((nix.match(/plugins\/liangshen\/src\/upstream-adapter\.mjs/g) ?? []).length, 2)
  assert.match(nix, /tui-renderer/)
  assert.match(nix, /dsh \$out\/dsh-runtime/)
})

test('Liangshen plugin skips preset installation in read-only viewer mode', () => {
  const temp = mkdtempSync(join(tmpdir(), 'oh-dsh-liangshen-readonly-'))
  const sourceCopy = join(temp, 'source')
  const dataRoot = join(temp, 'data')
  const warnings: string[] = []
  const logger = { warn: (message: string) => { warnings.push(message) } }
  const previous = process.env.OH_DSH_READ_ONLY
  try {
    cpSync(source, sourceCopy, { recursive: true })
    const options = { dataRoot, sourceRoot: sourceCopy }

    process.env.OH_DSH_READ_ONLY = '1'
    apply({ logger }, options)
    assert.equal(existsSync(join(dataRoot, '.agent-presets', 'liangshen')), false)
    assert.deepEqual(warnings, [])

    delete process.env.OH_DSH_READ_ONLY
    apply({ logger }, options)
    assert.equal(existsSync(join(dataRoot, '.agent-presets', 'liangshen')), true)
    assert.deepEqual(warnings, [])
  } finally {
    if (previous === undefined) delete process.env.OH_DSH_READ_ONLY
    else process.env.OH_DSH_READ_ONLY = previous
    rmSync(temp, { recursive: true, force: true })
  }
})
