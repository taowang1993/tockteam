import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { LAUNCHER_NETWORK_ASSETS, LAUNCHER_NETWORK_ASSET_URLS } from '../src/launcher-network-assets.ts'

const build = readFileSync(new URL('../scripts/build.mjs', import.meta.url), 'utf8')

test('network assets use the six exact pinned blobs and one package directory', () => {
  assert.equal(LAUNCHER_NETWORK_ASSETS.length, 6)
  assert.equal(new Set(LAUNCHER_NETWORK_ASSETS.map(asset => asset.key)).size, 6)
  for (const asset of LAUNCHER_NETWORK_ASSETS) {
    const bytes = readFileSync(new URL(`../${asset.source}`, import.meta.url))
    assert.equal(createHash('sha256').update(bytes).digest('hex'), asset.hash, asset.key)
    assert.equal(LAUNCHER_NETWORK_ASSET_URLS[asset.key], `./launcher-assets/${asset.fileName}`)
  }
  assert.match(build, /LAUNCHER_NETWORK_ASSETS/u)
  assert.match(build, /TockLauncher network asset drifted/u)
})
