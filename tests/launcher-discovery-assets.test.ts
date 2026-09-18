import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { LAUNCHER_DISCOVERY_ASSETS, launcherDiscoveryAssetUrl } from '../src/launcher-discovery-assets.ts'
import { LAUNCHER_LOCAL_EXTENSION_IMAGE_KEYS } from '../src/launcher-local-extension-assets.ts'

const root = new URL('../', import.meta.url)

test('discovery assets remain finite, pinned, and renderer-addressable', () => {
  assert.equal(LAUNCHER_DISCOVERY_ASSETS.length, 18)
  assert.equal(new Set(LAUNCHER_DISCOVERY_ASSETS.map(asset => asset.key)).size, 18)
  for (const asset of LAUNCHER_DISCOVERY_ASSETS) {
    const digest = createHash('sha256').update(readFileSync(new URL(asset.source, root))).digest('hex')
    assert.equal(digest, asset.hash, asset.key)
    assert.equal(launcherDiscoveryAssetUrl(asset.key), `./launcher-assets/${asset.fileName}`)
  }
  assert.equal(Object.keys(LAUNCHER_LOCAL_EXTENSION_IMAGE_KEYS).length + LAUNCHER_DISCOVERY_ASSETS.length, 25)
})

test('renderer discovery image resolver never accepts arbitrary asset keys', () => {
  assert.equal(launcherDiscoveryAssetUrl('browser-google-chrome'), './launcher-assets/browser-google-chrome.png')
  assert.equal(launcherDiscoveryAssetUrl('../vendor/ueli/icon.png'), undefined)
  assert.equal(launcherDiscoveryAssetUrl('https://example.test/icon.png'), undefined)
})
