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
    files: string[]
    scripts: Record<string, string>
  }
  const pluginWorkspace = readFileSync(
    new URL('../plugins/tocktutor/pnpm-workspace.yaml', import.meta.url),
    'utf8',
  )
  const workspacePackage = JSON.parse(readFileSync(
    new URL('../plugins/tocktutor/package.json', import.meta.url),
    'utf8',
  )) as { scripts: Record<string, string> }
  const installer = readFileSync(
    new URL('../scripts/install-tocktutor.mjs', import.meta.url),
    'utf8',
  )
  const bundle = JSON.parse(readFileSync(new URL('../plugins/tocktutor/packages/tockteam-tocktutor/package.json', import.meta.url), 'utf8')) as {
    dependencies: Record<string, string>
    peerDependencies: Record<string, string>
    version: string
  }
  const runtime = JSON.parse(readFileSync(new URL('../plugins/tocktutor/packages/tockbot-note-runtime/package.json', import.meta.url), 'utf8')) as {
    peerDependencies: Record<string, string>
    version: string
  }
  const vault = JSON.parse(readFileSync(new URL('../plugins/tocktutor/packages/tockbot-note-vault/package.json', import.meta.url), 'utf8')) as {
    version: string
  }
  const tools = JSON.parse(readFileSync(new URL('../plugins/tocktutor/packages/tockteam-note-vault-tools/package.json', import.meta.url), 'utf8')) as {
    peerDependencies: Record<string, string>
    peerDependenciesMeta: Record<string, { optional: boolean }>
    version: string
  }
  const workbench = JSON.parse(readFileSync(new URL('../plugins/tocktutor/packages/tockteam-tocktutor-workbench/package.json', import.meta.url), 'utf8')) as {
    peerDependencies: Record<string, string>
    version: string
  }
  const desktopAdapter = JSON.parse(readFileSync(new URL('../plugins/tocktutor/packages/tockbot-note-desktop/package.json', import.meta.url), 'utf8')) as {
    peerDependencies: Record<string, string>
    version: string
  }
  const assistant = JSON.parse(readFileSync(new URL('../plugins/tocktutor/packages/tockteam-tocktutor-assistant/package.json', import.meta.url), 'utf8')) as {
    peerDependencies: Record<string, string>
    version: string
  }
  const importExport = JSON.parse(readFileSync(new URL('../plugins/tocktutor/packages/tockteam-tocktutor-import-export/package.json', import.meta.url), 'utf8')) as {
    peerDependencies: Record<string, string>
    version: string
  }
  const webClip = JSON.parse(readFileSync(new URL('../plugins/tocktutor/packages/tockbot-web-clip/package.json', import.meta.url), 'utf8')) as {
    peerDependencies: Record<string, string>
    version: string
  }
  assert.deepEqual(packageJson.dependencies, {
    color: '4.2.3',
    'electron-updater': '6.8.3',
    'fast-xml-parser': '5.7.0',
    'fuse.js': '7.1.0',
    fuzzysort: '3.1.0',
    mathjs: '15.2.0',
    uuid: '14.0.0',
  })
  assert.equal(
    packageJson.scripts['install:tocktutor'],
    'node scripts/install-tocktutor.mjs',
  )
  for (const name of ['build', 'test', 'typecheck']) {
    assert.match(workspacePackage.scripts[name] ?? '', /--filter='!@tockteam\/tocktutor-workspace'/u)
  }
  assert.match(workspacePackage.scripts.test ?? '', /--workspace-concurrency=1/u)
  assert.doesNotMatch(pluginWorkspace, /dsh-source|'@deepseek-ai\/[^']+': link:/u)
  assert.doesNotMatch(installer, /build:dsh|DSH_SOURCE/u)
  assert.match(installer, /install',\s*'--frozen-lockfile'/u)
  assert.equal(packageJson.devDependencies['tockbot-note-runtime'], 'file:plugins/tocktutor/packages/tockbot-note-runtime')
  assert.equal(packageJson.devDependencies['tockbot-note-vault'], 'file:plugins/tocktutor/packages/tockbot-note-vault')
  assert.equal(packageJson.devDependencies['@tockteam/note-vault-tools'], 'file:plugins/tocktutor/packages/tockteam-note-vault-tools')
  assert.ok(packageJson.files.includes('plugins/tocktutor/packages/*/package.json'))
  assert.ok(packageJson.files.includes('plugins/tocktutor/packages/*/cordis.patch.yml'))
  assert.ok(packageJson.files.includes('plugins/tocktutor/packages/*/lib/**'))
  assert.ok(packageJson.files.includes('plugins/tocktutor/packages/*/dist/**'))
  assert.equal(packageJson.files.some(path => path.startsWith('vendor/')), false)
  assert.equal(bundle.version, '0.1.1')
  assert.equal(bundle.peerDependencies['@tockteam/desktop'], '>=0.1.11 <0.2.0')
  assert.equal(bundle.dependencies['tockbot-note-runtime'], '0.1.2')
  assert.equal(bundle.dependencies['tockbot-note-vault'], '0.6.0')
  assert.equal(bundle.dependencies['@tockteam/tocktutor-workbench'], '0.1.7')
  assert.equal(bundle.dependencies['tockbot-note-desktop'], '0.1.2')
  assert.equal(bundle.dependencies['@tockteam/tocktutor-assistant'], '0.1.5')
  assert.equal(bundle.dependencies['@tockteam/tocktutor-import-export'], '0.1.1')
  assert.equal(bundle.dependencies['tockbot-web-clip'], '0.1.2')
  assert.equal(runtime.version, '0.1.2')
  assert.equal(runtime.peerDependencies['tockbot-note-vault'], '0.6.0')
  assert.equal(vault.version, '0.6.0')
  assert.equal(tools.version, '0.1.2')
  assert.equal(tools.peerDependencies['@deepseek-ai/dsh-tools'], '0.1.2-rc.1')
  assert.equal(tools.peerDependenciesMeta['@deepseek-ai/dsh-tools']?.optional, true)
  assert.equal(tools.peerDependencies['tockbot-note-runtime'], '0.1.2')
  assert.equal(workbench.version, '0.1.7')
  assert.equal(workbench.peerDependencies['@tockteam/desktop'], '>=0.1.6 <0.2.0')
  assert.equal(workbench.peerDependencies['tockbot-note-runtime'], '0.1.2')
  assert.equal(desktopAdapter.version, '0.1.2')
  assert.equal(desktopAdapter.peerDependencies['@tockteam/desktop'], '>=0.1.11 <0.2.0')
  assert.equal(desktopAdapter.peerDependencies['@tockteam/tocktutor-workbench'], '0.1.7')
  assert.equal(desktopAdapter.peerDependencies['tockbot-note-runtime'], '0.1.2')
  assert.equal(assistant.version, '0.1.5')
  assert.equal(assistant.peerDependencies['@tockteam/tocktutor-workbench'], '0.1.7')
  assert.equal(assistant.peerDependencies['tockbot-note-runtime'], '0.1.2')
  assert.equal(importExport.version, '0.1.1')
  assert.equal(importExport.peerDependencies['@tockteam/desktop'], '>=0.1.11 <0.2.0')
  assert.equal(importExport.peerDependencies['@tockteam/tocktutor-workbench'], '>=0.1.7 <0.2.0')
  assert.equal(importExport.peerDependencies['tockbot-note-runtime'], '0.1.2')
  assert.equal(webClip.version, '0.1.2')
  assert.equal(webClip.peerDependencies['tockbot-note-runtime'], '0.1.2')
  assert.deepEqual(DESKTOP_BUNDLES, [
    '@deepseek-ai/dsh-base',
    '@tockteam/tocktutor',
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
    manifest.dependencies['@tockteam/tocktutor-workbench'] = '0.1.4'
    manifest.dsh.profile.bundles = [
      'tockbot-note-vault',
      '@tockteam/tocktutor-workbench',
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
    assert.equal(upgraded.dependencies['@tockteam/tocktutor-workbench'], undefined)
    assert.equal(upgraded.dsh.profile.bundles.includes('tockbot-note-vault'), false)
    assert.equal(upgraded.dsh.profile.bundles.includes('@tockteam/tocktutor-workbench'), false)
    assert.match(readFileSync(join(second.profileDir, 'cordis.patch.yml'), 'utf8'), /custom/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
