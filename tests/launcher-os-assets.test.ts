import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import test from 'node:test'
import { LAUNCHER_OS_ASSETS, launcherOsAssetUrl } from '../src/launcher-os-assets.ts'

test('OS asset registry contains the 21 pinned finite assets and local URLs', async () => {
  assert.equal(LAUNCHER_OS_ASSETS.length, 21)
  assert.equal(new Set(LAUNCHER_OS_ASSETS.map(asset => asset.key)).size, 21)
  for (const asset of LAUNCHER_OS_ASSETS) {
    const source = await readFile(new URL(`../${asset.source}`, import.meta.url))
    assert.equal(createHash('sha256').update(source).digest('hex'), asset.hash, asset.key)
    assert.equal(launcherOsAssetUrl(asset.key), `./launcher-assets/${asset.fileName}`)
  }
  assert.equal(launcherOsAssetUrl('appearance-switcher'), './launcher-assets/appearance-switcher-dark.png')
  assert.equal(launcherOsAssetUrl('data:image/png;base64,AAAA'), undefined)
})

test('OS assets are not dynamic data URLs', () => {
  for (const asset of LAUNCHER_OS_ASSETS) assert.match(asset.fileName, /^[a-z0-9-]+\.(?:png|svg)$/u)
  assert.equal(LAUNCHER_OS_ASSETS.some(asset => asset.source.includes('dist/')), false)
})
