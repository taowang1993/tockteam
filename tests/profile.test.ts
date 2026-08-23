import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { DESKTOP_BUNDLES, ensureDesktopProfile } from '../src/profile.ts'

test('desktop profile pins the released TockTutor runtime and peer package', () => {
  const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
    dependencies?: Record<string, string>
    devDependencies: Record<string, string>
  }
  const runtime = JSON.parse(readFileSync(new URL('../vendor/tockbot-note-runtime/package.json', import.meta.url), 'utf8')) as {
    peerDependencies: Record<string, string>
    version: string
  }
  const vault = JSON.parse(readFileSync(new URL('../vendor/tockbot-note-vault/package.json', import.meta.url), 'utf8')) as {
    version: string
  }
  const tools = JSON.parse(readFileSync(new URL('../vendor/tockteam-note-vault-tools/package.json', import.meta.url), 'utf8')) as {
    peerDependencies: Record<string, string>
    version: string
  }
  assert.equal(packageJson.dependencies, undefined)
  assert.equal(packageJson.devDependencies['tockbot-note-runtime'], 'file:vendor/tockbot-note-runtime-0.1.2.tgz')
  assert.equal(packageJson.devDependencies['tockbot-note-vault'], 'file:vendor/tockbot-note-vault-0.6.0.tgz')
  assert.equal(packageJson.devDependencies['@tockteam/note-vault-tools'], 'file:vendor/tockteam-note-vault-tools-0.1.2.tgz')
  assert.equal(runtime.version, '0.1.2')
  assert.equal(runtime.peerDependencies['tockbot-note-vault'], '0.6.0')
  assert.equal(vault.version, '0.6.0')
  assert.equal(tools.version, '0.1.2')
  assert.equal(tools.peerDependencies['tockbot-note-runtime'], '0.1.2')
  assert.deepEqual(DESKTOP_BUNDLES.slice(0, 5), [
    '@deepseek-ai/dsh-base',
    'tockbot-note-runtime',
    '@tockteam/note-vault-tools',
    '@deepseek-ai/dsh-web-app',
    '@tockteam/desktop',
  ])
  assert.equal((DESKTOP_BUNDLES as readonly string[]).includes('tockbot-note-vault'), false)
})

test('desktop retains the vault inspection package without enrolling its bundle', async () => {
  const inspection = await import('tockbot-note-vault/inspection')
  assert.equal(typeof inspection.createVaultInspection, 'function')
  assert.equal((DESKTOP_BUNDLES as readonly string[]).includes('tockbot-note-vault'), false)
})

test('desktop profile initializes required bundles and preserves user plugins', () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-desktop-profile-'))
  try {
    const first = ensureDesktopProfile(join(root, 'home'))
    const manifestPath = join(first.profileDir, 'package.json')
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    assert.deepEqual(manifest.dsh.profile.bundles, DESKTOP_BUNDLES)

    manifest.dependencies['example-plugin'] = '1.0.0'
    manifest.dependencies['tockbot-note-vault'] = '0.6.0'
    manifest.dsh.profile.bundles = [
      'tockbot-note-vault',
      'example-plugin',
      '@tockteam/desktop',
    ]
    writeFileSync(manifestPath, JSON.stringify(manifest, undefined, 2) + '\n')
    writeFileSync(join(first.profileDir, 'cordis.patch.yml'), '- id: custom\n  disabled: true\n')

    const second = ensureDesktopProfile(join(root, 'home'))
    const upgraded = JSON.parse(readFileSync(join(second.profileDir, 'package.json'), 'utf8'))
    assert.deepEqual(upgraded.dsh.profile.bundles, [...DESKTOP_BUNDLES, 'example-plugin'])
    assert.equal(upgraded.dependencies['example-plugin'], '1.0.0')
    assert.equal(upgraded.dependencies['tockbot-note-vault'], undefined)
    assert.equal(upgraded.dsh.profile.bundles.includes('tockbot-note-vault'), false)
    assert.match(readFileSync(join(second.profileDir, 'cordis.patch.yml'), 'utf8'), /custom/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
