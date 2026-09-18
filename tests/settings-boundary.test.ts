import assert from 'node:assert/strict'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { restoreSettingsBoundary } from '../scripts/settings-boundary.mjs'

function fixture(layout: 'pnpm' | 'hoisted' = 'pnpm') {
  const root = mkdtempSync(join(tmpdir(), 'tockteam-settings-boundary-'))
  const index = layout === 'hoisted'
    ? join(root, 'node_modules', '@deepseek-ai', 'dsh-api-settings-controller', 'lib', 'index.js')
    : join(
      root,
      'node_modules',
      '.pnpm',
      '@deepseek-ai+dsh-api-settings-controller@0.1.2-rc.1_fixture',
      'node_modules',
      '@deepseek-ai',
      'dsh-api-settings-controller',
      'lib',
      'index.js',
    )
  mkdirSync(dirname(index), { recursive: true })
  writeFileSync(index, [
    'import { RemoteError } from "@deepseek-ai/dsh-typert-protocol";',
    'const MAX_DESCRIBE_REFS = 64;',
    'const snapshot = {',
    '  namespaces: settings.describe({ redactSecrets: true }).map(namespaceView)',
    '};',
    'const namespace = parsed.data.ns;',
  ].join('\n'))
  return { root, index }
}

test('settings boundary patches the rc.1 controller descriptions and writes idempotently', () => {
  const { root, index } = fixture()
  try {
    restoreSettingsBoundary(root)
    const once = readFileSync(index, 'utf8')
    restoreSettingsBoundary(root)

    assert.equal(readFileSync(index, 'utf8'), once)
    assert.match(once, /WEB_SETTINGS_NAMESPACES/u)
    assert.match(once, /\.filter\(\(descriptor\) =>/u)
    assert.match(once, /this\.ctx\.get\("llm"\)/u)
    assert.match(once, /settings-not-exposed/u)
    assert.match(once, /"agent-presets"/u)
    assert.doesNotMatch(once, /oh-dsh/u)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('settings boundary supports hoisted Windows runtime layouts', () => {
  const { root, index } = fixture('hoisted')
  try {
    restoreSettingsBoundary(root)
    assert.match(readFileSync(index, 'utf8'), /settings-not-exposed/u)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('settings boundary fails closed when the pinned controller shape changes', () => {
  const { root, index } = fixture()
  try {
    writeFileSync(index, 'const MAX_DESCRIBE_REFS = 64;\n')
    assert.throws(
      () => { restoreSettingsBoundary(root) },
      /settings boundary anchor missing/u,
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('regular and Nix assemblies apply the shared settings boundary', () => {
  const stage = readFileSync(new URL('../scripts/stage-dsh.mjs', import.meta.url), 'utf8')
  const nix = readFileSync(new URL('../nix/dsh-runtime-pinned.nix', import.meta.url), 'utf8')

  assert.match(stage, /restoreSettingsBoundary\(runtime\)/u)
  assert.match(nix, /\$\{\.\.\/scripts\/settings-boundary\.mjs\}/u)
})
