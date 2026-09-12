import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { gzipSync, gunzipSync } from 'node:zlib'
import { createHash } from 'node:crypto'
import { decodeTrustedRaycastCanIUseData, TRUSTED_RAYCAST_CAN_I_USE_ASSET } from '../src/trusted-raycast-can-i-use-assets.ts'
import { searchTrustedRaycastCanIUseCatalog } from '../src/trusted-raycast-can-i-use-catalog.ts'
import { TRUSTED_RAYCAST_EXTENSION_IDS } from '../src/trusted-raycast-descriptors.ts'

const asset = new URL('../plugins/trusted-raycast/vendor/can-i-use-data.json.gz', import.meta.url)

test('the admitted snapshot supplies immutable real feature data without enabling a command or defaults', () => {
  const bytes = readFileSync(asset)
  const data = decodeTrustedRaycastCanIUseData(bytes)
  bytes.fill(0) // Returned data must not retain caller-owned buffers.
  assert.equal(data.catalog.totalCount, 581)
  assert.equal(data.catalog.entries.length, 581)
  assert.equal(data.canonicalTargets.length, 649)
  assert.ok(Object.isFrozen(data.canonicalTargets))
  assert.ok(data.canonicalTargets.includes('chrome 100'))
  const result = searchTrustedRaycastCanIUseCatalog(data.catalog, 'css-grid')
  const row = result.selected.find(row => row.slug === 'css-grid')!
  assert.ok(row)
  const identity = { slug: row.slug, sourceIndex: row.sourceIndex }
  assert.equal(data.detail(identity).status, 'cr')
  assert.equal(data.support(identity, 'chrome 100').allSupported, true)
  assert.equal(data.support(identity, 'ie 10').allSupported, false)
  assert.ok(Object.isFrozen(data))
  assert.ok(Object.isFrozen(data.catalog.entries))
  assert.ok(Object.isFrozen(row))
  assert.throws(() => data.support(identity, 'defaults'), { code: 'DATA_UNAVAILABLE' })
  assert.throws(() => data.support(identity, '> 1%'), { code: 'QUERY_UNSUPPORTED' })
  assert.deepEqual(TRUSTED_RAYCAST_EXTENSION_IDS, ['google-translate', 'kaomoji-search', 'can-i-use'])
})

test('missing, alternate, damaged and path-shaped inputs fail with a fixed error', () => {
  const bytes = readFileSync(asset)
  const changed = Buffer.from(bytes)
  changed[changed.length - 1] = changed[changed.length - 1]! ^ 1
  const inputs = [undefined, null, asset.pathname, {}, new Uint8Array(bytes), Buffer.alloc(0),
    bytes.subarray(1), Buffer.concat([bytes, Buffer.from([0])]), changed,
    gzipSync(gunzipSync(bytes), { level: 1 }),
    gzipSync(Buffer.from('{"runtimeAdmitted":true,"path":"private-input"}'))]
  for (const input of inputs) {
    assert.throws(() => decodeTrustedRaycastCanIUseData(input), {
      name: 'TrustedRaycastCanIUseError', code: 'DATA_UNAVAILABLE', message: 'DATA_UNAVAILABLE',
    })
  }
  assert.ok(Object.isFrozen(TRUSTED_RAYCAST_CAN_I_USE_ASSET))
})

test('retained storage preserves all original data and legal entry bytes', () => {
  const bytes = readFileSync(asset)
  const pin = TRUSTED_RAYCAST_CAN_I_USE_ASSET
  const sha = (value: Buffer) => createHash('sha256').update(value).digest('hex')
  assert.equal(bytes.length, pin.bytes)
  assert.equal(sha(bytes), pin.sha256)
  const capsule = gunzipSync(bytes, { maxOutputLength: pin.capsuleBytes })
  assert.equal(capsule.length, pin.capsuleBytes)
  assert.equal(sha(capsule), pin.capsuleSha256)
  const value = JSON.parse(capsule.toString('utf8'))
  assert.equal(value.runtimeAdmitted, false)
  assert.equal(value.entries.length, 14)
  let decodedBytes = 0
  const legal: string[] = []
  for (const entry of value.entries) {
    const content = Buffer.from(entry.base64, 'base64')
    assert.equal(content.length, entry.bytes)
    assert.equal(sha(content), entry.sha256)
    assert.equal(content.toString('base64'), entry.base64)
    decodedBytes += content.length
    if (entry.path.endsWith('.md') || entry.path.startsWith('licenses/')) {
      legal.push(entry.path)
      assert.ok(Buffer.from(content.toString('utf8')).equals(content))
    }
  }
  assert.equal(decodedBytes, 8473611)
  assert.deepEqual(legal.sort(), ['CAN_I_USE_ATTRIBUTION.md', 'THIRD_PARTY_NOTICES.md',
    'licenses/baseline-browser-mapping.txt', 'licenses/browserslist.txt', 'licenses/caniuse-api.txt',
    'licenses/caniuse-lite.txt', 'licenses/electron-to-chromium.txt', 'licenses/node-releases.txt',
    'licenses/raycast-extensions.txt'])
})
