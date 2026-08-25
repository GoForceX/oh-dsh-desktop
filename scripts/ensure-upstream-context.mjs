import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// Builds the pinned dsh-context submodule with its own toolchain. Every
// staging path (make upstream, pnpm run build, the dist:* chains) funnels
// through here, so a fresh checkout produces upstream/dsh-context/lib before
// installDesktopPackages() tries to copy it. The stamp keeps incremental
// builds no-ops until the pinned gitlink moves.
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const contextDir = join(root, 'upstream', 'dsh-context')
const libEntry = join(contextDir, 'lib', 'index.js')
const stamp = join(root, '.stage', 'dsh-context-compile.stamp')

function currentRevision() {
  const result = spawnSync('git', ['-C', contextDir, 'rev-parse', 'HEAD'], { encoding: 'utf8' })
  if (result.status !== 0) {
    throw new Error(`cannot resolve upstream/dsh-context revision: ${result.stderr}`)
  }
  return result.stdout.trim()
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: contextDir,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })
  if (result.error !== undefined || result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed in upstream/dsh-context`)
  }
}

const revision = currentRevision()
let stamped
try {
  stamped = readFileSync(stamp, 'utf8').trim()
} catch {
  stamped = undefined
}
// Never process.exit() here: scripts/build.mjs imports this module, and an
// early exit would kill the whole root build and leave dist/ stale.
if (stamped !== revision || !existsSync(libEntry)) {
  // --ignore-workspace keeps this an isolated install of the submodule's own
  // pinned lockfile. --config.manage-package-manager-versions=false stops a
  // standalone CI pnpm from trying to re-verify its own native-binary
  // identity against the upstream lockfile (pinned to pnpm@11.9.0 by the
  // author's npm-installed build).
  run('pnpm', [
    'install',
    '--frozen-lockfile',
    '--ignore-scripts',
    '--ignore-workspace',
    '--config.manage-package-manager-versions=false',
  ])
  run('pnpm', ['run', 'build'])
  mkdirSync(dirname(stamp), { recursive: true })
  writeFileSync(stamp, `${revision}\n`)
  console.log(`Built upstream/dsh-context at ${revision}`)
}
