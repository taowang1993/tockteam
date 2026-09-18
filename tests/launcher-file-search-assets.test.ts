import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { LAUNCHER_FILE_SEARCH_ASSETS, LAUNCHER_FILE_SEARCH_ASSET_URLS } from '../src/launcher-file-search-assets.ts'

const build = readFileSync(new URL('../scripts/build.mjs', import.meta.url), 'utf8')
const settings = readFileSync(new URL('../src/launcher-file-search-settings.tsx', import.meta.url), 'utf8')

test('file-search assets remain pinned to the reviewed Ueli sources', () => {
  assert.equal(LAUNCHER_FILE_SEARCH_ASSETS.length, 5)
  for (const asset of LAUNCHER_FILE_SEARCH_ASSETS) {
    const bytes = readFileSync(new URL(`../${asset.source}`, import.meta.url))
    assert.equal(createHash('sha256').update(bytes).digest('hex'), asset.hash, asset.key)
    assert.equal(LAUNCHER_FILE_SEARCH_ASSET_URLS[asset.key], `./launcher-assets/${asset.fileName}`)
  }
  assert.match(build, /LAUNCHER_FILE_SEARCH_ASSETS/u)
})

test('file-search settings keep bounded roots and adapted new-root defaults', () => {
  assert.match(settings, /data-testid="tocklauncher-file-search-settings"/u)
  assert.match(settings, /recursive: true/u)
  assert.match(settings, /excludeHiddenFiles: true/u)
  assert.match(settings, /searchFor: 'filesAndFolders'/u)
  assert.match(settings, /folders\.length >= 16/u)
  assert.match(settings, /maxLength=\{4096\}/u)
  assert.match(settings, /next\.some\(folder => !absolutePath\(folder\.path\.trim\(\)\)\)/u)
  assert.match(settings, /New roots stay local until a nonempty absolute path is entered/u)
  assert.match(settings, /Indexed File Search is unsupported on Linux/u)
  assert.match(settings, /requires a configured Everything CLI executable/u)
})
