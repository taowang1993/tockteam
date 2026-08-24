import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import { dshRoot, repositoryRoot } from '../../../test-utils.ts'

const run = promisify(execFile)
const root = dirname(dirname(fileURLToPath(import.meta.url)))
const { loadOverlayPatches } = await import(pathToFileURL(
  join(dshRoot, 'packages/boot/app-boot/lib/index.js'),
).href)

const dependencies = {
  'tockbot-note-runtime': '0.1.2',
  'tockbot-note-vault': '0.6.0',
  '@tockteam/note-vault-tools': '0.1.2',
  '@tockteam/tocktutor-workbench': '0.1.7',
  'tockbot-note-desktop': '0.1.2',
  '@tockteam/tocktutor-assistant': '0.1.5',
  '@tockteam/tocktutor-import-export': '0.1.1',
  'tockbot-web-clip': '0.1.2',
}

const rows = [
  {
    id: 'note-vault-runtime',
    name: 'tockbot-note-runtime',
    config: { vaultRoot: null },
  },
  { id: 'note-vault-tools', name: '@tockteam/note-vault-tools' },
  { id: 'tocktutor-workbench', name: '@tockteam/tocktutor-workbench' },
  { id: 'tockbot-note-desktop', name: 'tockbot-note-desktop' },
  {
    id: 'tocktutor-assistant',
    name: '@tockteam/tocktutor-assistant',
    config: {},
  },
  {
    id: 'tocktutor-import-export',
    name: '@tockteam/tocktutor-import-export',
  },
  { id: 'web-clip', name: 'tockbot-web-clip' },
]

test('declares one authority-free aggregate over exact immutable dependencies', async () => {
  const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
  assert.equal(manifest.name, '@tockteam/tocktutor')
  assert.equal(manifest.version, '0.1.1')
  assert.deepEqual(manifest.files, ['cordis.patch.yml'])
  assert.deepEqual(manifest.dsh, { bundle: { patch: './cordis.patch.yml' } })
  assert.deepEqual(manifest.dependencies, dependencies)
  assert.deepEqual(manifest.peerDependencies, {
    '@tockteam/desktop': '>=0.1.11 <0.2.0',
  })
  assert.equal(manifest.devDependencies['@tockteam/desktop'], 'workspace:*')
  assert.equal('main' in manifest, false)
  assert.equal('exports' in manifest, false)
})

test('inserts each approved Host/client row once and no standalone scanner', () => {
  const patches = loadOverlayPatches('tocktutor-bundle-test', join(root, 'cordis.patch.yml'))
  assert.deepEqual(patches, [{ insert: rows }])
  assert.equal(new Set(rows.map(row => row.id)).size, rows.length)
  assert.equal(rows.filter(row => row.id === 'note-vault-runtime').length, 1)
  assert.equal(rows.some(row => row.name === 'tockbot-note-vault'), false)
})

test('fresh artifact contains only the manifest and patch', async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'tocktutor-bundle-pack-'))
  try {
    await run('pnpm', ['pack', '--pack-destination', temporary], { cwd: root })
    const fresh = join(temporary, 'tockteam-tocktutor-0.1.1.tgz')
    const listing = (await run('tar', ['-tzf', fresh])).stdout.trim().split('\n').sort()
    assert.deepEqual(listing, ['package/cordis.patch.yml', 'package/package.json'])
    const [packedManifest, packedPatch, sourceManifest, sourcePatch] = await Promise.all([
      run('tar', ['-xOf', fresh, 'package/package.json']).then(result => result.stdout),
      run('tar', ['-xOf', fresh, 'package/cordis.patch.yml']).then(result => result.stdout),
      readFile(join(root, 'package.json'), 'utf8'),
      readFile(join(root, 'cordis.patch.yml'), 'utf8'),
    ])
    const packedPackage = JSON.parse(packedManifest)
    const sourcePackage = JSON.parse(sourceManifest)
    const desktopPackage = JSON.parse(await readFile(join(repositoryRoot, 'package.json'), 'utf8'))
    for (const [name, specifier] of Object.entries(sourcePackage.dependencies as Record<string, string>)) {
      sourcePackage.dependencies[name] = specifier.replace(/^workspace:/u, '')
    }
    sourcePackage.devDependencies['@tockteam/desktop'] = desktopPackage.version
    delete sourcePackage.packageManager
    assert.deepEqual(packedPackage, sourcePackage)
    assert.equal(packedPatch, sourcePatch)
  } finally {
    await rm(temporary, { force: true, recursive: true })
  }
})
