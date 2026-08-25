import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { test } from 'node:test'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

function writeRegistryFixture(surface: string) {
  const fixture = mkdtempSync(join(tmpdir(), `oh-dsh-nix-registry-${surface}-`))
  const bundleRoot = join(fixture, 'bundle')
  const manifests = join(bundleRoot, 'manifests')
  const distRoot = join(fixture, 'dist')
  const preset = join(bundleRoot, 'tui-renderer', 'presets', 'liangshen')
  const runtime = join(fixture, 'runtime')

  mkdirSync(join(manifests), { recursive: true })
  mkdirSync(join(distRoot, 'plugins', 'liangshen'), { recursive: true })
  mkdirSync(join(distRoot, 'web'), { recursive: true })
  mkdirSync(preset, { recursive: true })
  mkdirSync(runtime, { recursive: true })

  writeFileSync(
    join(manifests, 'liangshen.json'),
    JSON.stringify({ name: '@oh-dsh/liangshen', version: '0.1.0', dependencies: {} }),
  )
  writeFileSync(
    join(manifests, 'web.json'),
    JSON.stringify({ name: '@oh-dsh/web', version: '0.1.8', dependencies: {} }),
  )
  writeFileSync(join(distRoot, 'plugins', 'liangshen', 'index.js'), 'export {}\n')
  writeFileSync(join(distRoot, 'web', 'index.js'), 'export {}\n')
  writeFileSync(join(preset, 'preset.yml'), 'id: liangshen\n')
  writeFileSync(
    join(runtime, 'package.json'),
    JSON.stringify({ name: '@deepseek-ai/dsh', dependencies: {} }),
  )
  return { bundleRoot, distRoot, runtime, fixture }
}

function runRegistry(fixture: { bundleRoot: string, distRoot: string, runtime: string }, surface: string) {
  const result = spawnSync(
    'python3',
    [join(root, 'nix', 'register-plugins.py'), fixture.bundleRoot, fixture.distRoot, fixture.runtime, surface],
    { encoding: 'utf8' },
  )
  assert.equal(result.status, 0, result.stderr)
}

function writeModulePackage(
  directory: string,
  manifest: object,
  entry: string,
  source: string,
): void {
  mkdirSync(dirname(join(directory, entry)), { recursive: true })
  writeFileSync(join(directory, 'package.json'), JSON.stringify(manifest))
  writeFileSync(join(directory, entry), source)
}

function writeAuthRegistryFixture() {
  const fixture = mkdtempSync(join(tmpdir(), 'oh-dsh-nix-auth-registry-'))
  const bundleRoot = join(fixture, 'bundle')
  const manifests = join(bundleRoot, 'manifests')
  const distRoot = join(fixture, 'dist')
  const renderer = join(bundleRoot, 'tui-renderer')
  const bundledAuth = join(bundleRoot, 'auth')
  const auth = join(bundleRoot, 'extra-deps', '@deepseek-harness-tui', 'dsh-auth')
  const runtime = join(fixture, 'runtime')
  const peer = join(runtime, 'node_modules', '@fixture', 'peer')
  const authManifest = {
    name: '@deepseek-harness-tui/dsh-auth',
    version: '0.1.0',
    type: 'module',
    exports: './lib/index.js',
    peerDependencies: { '@fixture/peer': '1.0.0' },
  }
  const authSource = "export { value as authValue } from '@fixture/peer'\n"

  mkdirSync(manifests, { recursive: true })
  mkdirSync(join(renderer, 'lib'), { recursive: true })
  mkdirSync(join(bundledAuth, 'lib'), { recursive: true })

  writeFileSync(join(manifests, 'tui-renderer.json'), JSON.stringify({
    name: '@deepseek-harness-tui/dsh-tui',
    version: '0.9.2',
    dependencies: { '@deepseek-harness-tui/dsh-auth': 'link:./dsh-auth' },
  }))
  writeFileSync(join(manifests, 'dsh-auth.json'), JSON.stringify(authManifest))
  writeFileSync(
    join(renderer, 'lib', 'index.js'),
    "export { authValue } from '@deepseek-harness-tui/dsh-auth'\n",
  )
  writeFileSync(join(bundledAuth, 'lib', 'index.js'), authSource)
  writeModulePackage(auth, authManifest, 'lib/index.js', authSource)
  writeModulePackage(peer, {
    name: '@fixture/peer',
    version: '1.0.0',
    type: 'module',
    exports: './index.js',
  }, 'index.js', "export const value = 'peer-ready'\n")
  writeFileSync(join(runtime, 'package.json'), JSON.stringify({
    name: '@deepseek-ai/dsh',
    dependencies: {},
  }))
  return { bundleRoot, distRoot, runtime, fixture }
}

test('Nix registry carries the Liangshen preset into web and full closures', () => {
  for (const surface of ['web', 'full']) {
    const fixture = writeRegistryFixture(surface)
    try {
      runRegistry(fixture, surface)
      const liangshen = join(fixture.runtime, 'node_modules', '@oh-dsh', 'liangshen')
      assert.equal(existsSync(join(liangshen, 'dist', 'index.js')), true, `${surface}: compiled plugin`)
      assert.equal(
        existsSync(join(liangshen, 'presets', 'liangshen', 'preset.yml')),
        true,
        `${surface}: packaged preset`,
      )
      const runtime = JSON.parse(readFileSync(join(fixture.runtime, 'package.json'), 'utf8'))
      assert.equal(runtime.dependencies['@oh-dsh/liangshen'], '0.1.0', `${surface}: profile dependency`)
    } finally {
      rmSync(fixture.fixture, { recursive: true, force: true })
    }
  }
})

test('Nix registry leaves the TUI closure on its upstream Liangshen preset', () => {
  const fixture = writeRegistryFixture('tui')
  try {
    runRegistry(fixture, 'tui')
    assert.equal(existsSync(join(fixture.runtime, 'node_modules', '@oh-dsh', 'liangshen')), false)
    const runtime = JSON.parse(readFileSync(join(fixture.runtime, 'package.json'), 'utf8'))
    assert.equal('@oh-dsh/liangshen' in runtime.dependencies, false)
  } finally {
    rmSync(fixture.fixture, { recursive: true, force: true })
  }
})

test('Nix renderers resolve dsh-auth peers through the final runtime graph', async () => {
  for (const surface of ['full', 'tui']) {
    const fixture = writeAuthRegistryFixture()
    try {
      runRegistry(fixture, surface)
      const scope = join(fixture.runtime, 'node_modules', '@deepseek-harness-tui')
      const runtimeAuth = join(scope, 'dsh-auth')
      const rendererRoot = join(scope, 'dsh-tui')
      const rendererAuth = join(
        rendererRoot,
        'node_modules',
        '@deepseek-harness-tui',
        'dsh-auth',
      )
      const renderer = await import(pathToFileURL(join(
        rendererRoot, 'lib', 'index.js',
      )).href)
      assert.equal(renderer.authValue, 'peer-ready', surface)
      assert.equal(existsSync(runtimeAuth), true, surface)
      assert.equal(realpathSync(rendererAuth), realpathSync(runtimeAuth), surface)
    } finally {
      rmSync(fixture.fixture, { recursive: true, force: true })
    }
  }
})
