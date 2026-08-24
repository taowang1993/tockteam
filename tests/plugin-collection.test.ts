import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import {
  BUNDLED_DESKTOP_CLIENT_PLUGINS,
  BUNDLED_DESKTOP_HOST_PLUGINS,
  BUNDLED_DESKTOP_PLUGINS,
} from '../src/profile.ts'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const ownedBundleDirectories = new Map<string, string>([
  ['@tockteam/tocktutor-workbench', 'tockteam-tocktutor-workbench'],
  ['tockbot-note-desktop', 'tockbot-note-desktop'],
  ['@tockteam/tocktutor-assistant', 'tockteam-tocktutor-assistant'],
  ['@tockteam/tocktutor-import-export', 'tockteam-tocktutor-import-export'],
  ['tockbot-web-clip', 'tockbot-web-clip'],
])

function packageDirectory(plugin: string): string {
  const ownedBundle = ownedBundleDirectories.get(plugin)
  if (ownedBundle !== undefined) {
    return join(root, 'plugins', 'tocktutor', 'packages', ownedBundle)
  }
  if (plugin === '@tockteam/desktop') return root
  return join(root, 'plugins', plugin.slice(plugin.lastIndexOf('/') + 1))
}

test('desktop bundle registers every packaged DSH plugin', () => {
  const patch = readFileSync(join(root, 'cordis.patch.yml'), 'utf8')
  const aggregatePatch = readFileSync(
    join(root, 'plugins', 'tocktutor', 'packages', 'tockteam-tocktutor', 'cordis.patch.yml'),
    'utf8',
  )
  assert.doesNotMatch(patch, /tockbot-note-vault/)
  assert.doesNotMatch(aggregatePatch, /tockbot-note-vault/)
  assert.equal((patch.match(/id: note-vault-runtime/g) ?? []).length, 1)
  assert.match(patch, /id: note-vault-runtime[\s\S]*stateRoot: null/)
  for (const plugin of BUNDLED_DESKTOP_PLUGINS) {
    const ownedPatch = ownedBundleDirectories.has(plugin) ? aggregatePatch : patch
    const registration = new RegExp(`name: ['"]?${plugin.replace('/', '\\/')}['"]?`, 'g')
    assert.equal((ownedPatch.match(registration) ?? []).length, 1)
  }
  for (const plugin of BUNDLED_DESKTOP_CLIENT_PLUGINS) {
    const manifest = JSON.parse(readFileSync(join(packageDirectory(plugin), 'package.json'), 'utf8'))
    assert.equal(manifest.name, plugin)
    assert.equal(manifest.dsh.client.platform, 'web')
    assert.equal(manifest.dshClient, undefined)
    if (ownedBundleDirectories.has(plugin)) {
      const clientExport = manifest.exports['./client'] as { browser?: string; default: string }
      const bundledPath = (clientExport.browser ?? clientExport.default).replace(/^\.\//u, '')
      const clientBundle = readFileSync(join(packageDirectory(plugin), bundledPath), 'utf8')
      assert.match(clientBundle, /__ModuleLoader__\.load/u)
      assert.match(clientBundle, new RegExp(plugin.replace('/', '\\/')))
    }
  }
  for (const plugin of BUNDLED_DESKTOP_HOST_PLUGINS) {
    const manifest = JSON.parse(readFileSync(join(packageDirectory(plugin), 'package.json'), 'utf8'))
    assert.equal(manifest.name, plugin)
    assert.equal(manifest.dsh, undefined)
  }
})
