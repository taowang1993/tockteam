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
  ['tockbot-web-clip', 'tockbot-web-clip'],
])

function packageDirectory(plugin: string): string {
  const ownedBundle = ownedBundleDirectories.get(plugin)
  if (ownedBundle !== undefined) return join(root, 'vendor', ownedBundle)
  if (plugin === '@tockteam/desktop') return root
  return join(root, 'plugins', plugin.slice(plugin.lastIndexOf('/') + 1))
}

test('desktop bundle registers every packaged DSH plugin', () => {
  const patch = readFileSync(join(root, 'cordis.patch.yml'), 'utf8')
  assert.doesNotMatch(patch, /tockbot-note-vault/)
  assert.equal((patch.match(/id: note-vault-runtime/g) ?? []).length, 1)
  assert.match(patch, /id: note-vault-runtime[\s\S]*stateRoot: null/)
  for (const plugin of BUNDLED_DESKTOP_PLUGINS) {
    const ownedPatch = ownedBundleDirectories.has(plugin)
      ? readFileSync(join(packageDirectory(plugin), 'cordis.patch.yml'), 'utf8')
      : patch
    assert.match(ownedPatch, new RegExp(`name: ['"]?${plugin.replace('/', '\\/')}['"]?`))
  }
  for (const plugin of BUNDLED_DESKTOP_CLIENT_PLUGINS) {
    const manifest = JSON.parse(readFileSync(join(packageDirectory(plugin), 'package.json'), 'utf8'))
    assert.equal(manifest.name, plugin)
    assert.equal(manifest.dsh.client.platform, 'web')
    assert.equal(manifest.dshClient, undefined)
  }
  for (const plugin of BUNDLED_DESKTOP_HOST_PLUGINS) {
    const manifest = JSON.parse(readFileSync(join(packageDirectory(plugin), 'package.json'), 'utf8'))
    assert.equal(manifest.name, plugin)
    assert.equal(manifest.dsh, undefined)
  }
})
