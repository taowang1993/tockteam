import assert from 'node:assert/strict'
import { copyFileSync, mkdtempSync, mkdirSync, rmSync, symlinkSync, truncateSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test } from 'node:test'
import { createTrustedRaycastCanIUseRuntime, loadTrustedRaycastCanIUseData } from '../src/trusted-raycast-can-i-use-runtime.ts'
import { TRUSTED_RAYCAST_CAN_I_USE_ASSET } from '../src/trusted-raycast-can-i-use-assets.ts'

const vendor = resolve('plugins/trusted-raycast/vendor')
const filename = TRUSTED_RAYCAST_CAN_I_USE_ASSET.file
const unavailable = (error: unknown) => error instanceof Error && error.message === 'DATA_UNAVAILABLE'

test('Host loads only the pinned Can I Use asset from its selected runtime directory', () => {
  const data = loadTrustedRaycastCanIUseData(vendor)
  assert.equal(data.catalog.entries.length, 581)
  assert.ok(Object.isFrozen(data))
  const grid = data.catalog.entries.find(row => row.slug === 'css-grid')!
  assert.equal(data.support({ slug: grid.slug, sourceIndex: grid.sourceIndex }, 'chrome 100').allSupported, true)
})

test('an invalid source publication revokes the previously published search capability', () => {
  const runtime = createTrustedRaycastCanIUseRuntime(vendor, 'publication-test', { showReleaseDate: true, showPartialSupport: false, briefMode: false, defaultQuery: 'chrome 100', path: '', environment: '' })
  const packet = JSON.parse(runtime.initialMessage)
  const root = { type: 'root', props: { navigationDepth: 0, visibleCount: packet.features.length, matchCount: packet.matchCount, totalCount: packet.totalCount },
    children: packet.features.map((row: { slug: string; title: string }) => ({ type: 'raycast-list-item', props: { title: row.title, featureName: row.slug }, children: ['Show Details', 'Open in Browser'].map(title => ({ type: 'raycast-action', props: { title, unavailable: true }, children: [] })) })) }
  assert.throws(() => runtime.search('css-grid'), /SNAPSHOT_STALE/)
  runtime.publish(root)
  assert.throws(() => runtime.publish({ ...root, props: { ...root.props, visibleCount: 65 } }), /RENDER_INVALID/)
  assert.throws(() => runtime.search('css-grid'), /SNAPSHOT_STALE/)
  runtime.close()
})

test('missing, changed, oversized, directory and symlink assets fail without falling back to repository data', () => {
  const directory = mkdtempSync(join(tmpdir(), 'tockteam-can-i-use-host-read-'))
  const file = join(directory, filename)
  try {
    assert.throws(() => loadTrustedRaycastCanIUseData(directory), unavailable)
    writeFileSync(file, 'not the admitted snapshot')
    assert.throws(() => loadTrustedRaycastCanIUseData(directory), unavailable)
    truncateSync(file, TRUSTED_RAYCAST_CAN_I_USE_ASSET.bytes + 1)
    assert.throws(() => loadTrustedRaycastCanIUseData(directory), unavailable)
    rmSync(file)
    mkdirSync(file)
    assert.throws(() => loadTrustedRaycastCanIUseData(directory), unavailable)
    rmSync(file, { recursive: true })
    symlinkSync(join(vendor, filename), file)
    assert.throws(() => loadTrustedRaycastCanIUseData(directory), unavailable)
    rmSync(file)
    copyFileSync(join(vendor, filename), file)
    assert.equal(loadTrustedRaycastCanIUseData(directory).catalog.entries.length, 581)
    writeFileSync(file, 'replaced after a successful load')
    assert.throws(() => loadTrustedRaycastCanIUseData(directory), unavailable, 'a prior success must not bypass current file custody')
  } finally { rmSync(directory, { recursive: true, force: true }) }
})
