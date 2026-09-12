import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { decodeTrustedRaycastCanIUseData, TRUSTED_RAYCAST_CAN_I_USE_ASSET } from '../src/trusted-raycast-can-i-use-assets.ts'
import { TrustedRaycastCanIUseActionRegistry } from '../src/trusted-raycast-can-i-use-actions.ts'
import { prepareTrustedRaycastCanIUseRoot } from '../src/trusted-raycast-can-i-use-command.ts'
import { createTrustedRaycastCanIUseSourceRoot } from '../src/trusted-raycast-can-i-use-source-root.ts'
import { createTrustedRaycastCanIUseCatalog } from '../src/trusted-raycast-can-i-use-catalog.ts'
import { TRUSTED_RAYCAST_CAN_I_USE_PREFERENCE_DEFAULTS } from '../src/trusted-raycast-can-i-use-preferences.ts'

const data = decodeTrustedRaycastCanIUseData(readFileSync(new URL('../plugins/trusted-raycast/vendor/can-i-use-data.json.gz', import.meta.url)))
const preferences = { ...TRUSTED_RAYCAST_CAN_I_USE_PREFERENCE_DEFAULTS, defaultQuery: 'chrome 100' }
const context = { extensionId: 'can-i-use', command: 'index', sessionId: 'main-session', workspaceId: 'no-workspace',
  snapshotIdentity: TRUSTED_RAYCAST_CAN_I_USE_ASSET.sha256, snapshotGeneration: 0 }

test('main selects at most 64 features and searches the entire admitted catalog before source materialization', () => {
  const registry = new TrustedRaycastCanIUseActionRegistry()
  const initial = prepareTrustedRaycastCanIUseRoot(data, preferences, context, registry, '')
  const packet = JSON.parse(initial.message)
  assert.equal(packet.features.length, 64)
  assert.equal(packet.matchCount, 581)
  assert.equal(packet.totalCount, 581)
  assert.equal(packet.snapshot.targets.length, 1)
  assert.ok(Buffer.byteLength(initial.message) < 32768)
  const target = data.catalog.entries[500]!
  assert.ok(!packet.features.some((row: { slug: string }) => row.slug === target.slug))
  const found = prepareTrustedRaycastCanIUseRoot(data, preferences, context, registry, target.slug)
  assert.ok(found.rows.some(row => row.slug === target.slug))
  assert.equal(JSON.parse(found.message).query, target.slug)
  assert.equal(registry.stats().liveHandleCount, 0, 'no authority before a matching source projection is accepted')
})

test('the child sees only current selected feature identities and the exact prepared browser query', () => {
  const registry = new TrustedRaycastCanIUseActionRegistry()
  const root = prepareTrustedRaycastCanIUseRoot(data, preferences, context, registry, 'css-grid')
  const aliases = createTrustedRaycastCanIUseSourceRoot(root.message, context, revision => revision === registry.stats().revision)
  assert.equal(aliases.feature(aliases.features['css-grid']).title, 'CSS Grid Layout (level 1)')
  assert.equal(aliases.feature(aliases.features['css-grid']).status, 'cr')
  assert.equal(aliases.isSupported('css-grid', aliases.browserslist('chrome 100')), true)
  assert.ok(Object.isFrozen(aliases.features))
  assert.ok(Object.isFrozen(aliases.feature(aliases.features['css-grid'])))
  assert.throws(() => aliases.feature({}), { code: 'DATA_UNAVAILABLE' })
  assert.throws(() => aliases.isSupported('css-grid', ['firefox 100']), { code: 'QUERY_UNSUPPORTED' })
  assert.throws(() => aliases.isSupported('__proto__', ['chrome 100']), { code: 'QUERY_UNSUPPORTED' })
  assert.throws(() => aliases.os.homedir(), { code: 'PATH_UNSUPPORTED' })
  assert.throws(() => aliases.path.default.join('private-input'), { code: 'PATH_UNSUPPORTED' })
  let getter = 0
  const browsers = Object.defineProperty(['chrome 100'], '0', { get() { getter++; return 'chrome 100' } })
  assert.throws(() => aliases.isSupported('css-grid', browsers), { code: 'QUERY_UNSUPPORTED' })
  assert.equal(getter, 0)
  prepareTrustedRaycastCanIUseRoot(data, preferences, context, registry, 'flexbox')
  assert.throws(() => aliases.feature(aliases.features['css-grid']), { code: 'SNAPSHOT_STALE' })
  assert.throws(() => aliases.browserslist('chrome 100'), { code: 'SNAPSHOT_STALE' })
  assert.throws(() => aliases.isSupported('css-grid', ['chrome 100']), { code: 'SNAPSHOT_STALE' })
})

test('failed preferences or searches revoke published root authority before failing', () => {
  for (const [input, query, code] of [[TRUSTED_RAYCAST_CAN_I_USE_PREFERENCE_DEFAULTS, '', 'DATA_UNAVAILABLE'],
    [{ ...preferences, path: '.' }, '', 'WORKSPACE_UNAVAILABLE'], [preferences, '\u0000', 'QUERY_UNSUPPORTED']] as const) {
    const registry = new TrustedRaycastCanIUseActionRegistry()
    const root = prepareTrustedRaycastCanIUseRoot(data, preferences, context, registry, '')
    assert.equal(registry.publishRoot(root.ticket, root.rows).length, 128)
    assert.throws(() => prepareTrustedRaycastCanIUseRoot(data, input, context, registry, query), { code })
    assert.equal(registry.stats().liveHandleCount, 0)
  }
})

test('an Opera Mini-only selection omits support indicators and oversized packets leave no authority', () => {
  const registry = new TrustedRaycastCanIUseActionRegistry()
  const root = prepareTrustedRaycastCanIUseRoot(data, { ...preferences, defaultQuery: 'op_mini all' }, context, registry, 'css-grid')
  assert.ok(JSON.parse(root.message).features.every((row: { supported: unknown }) => row.supported === null))
  const aliases = createTrustedRaycastCanIUseSourceRoot(root.message, context, () => true)
  assert.deepEqual(aliases.browserslist('op_mini all'), ['op_mini all'])
  assert.throws(() => aliases.isSupported('css-grid', []), { code: 'QUERY_UNSUPPORTED' })
  registry.publishRoot(root.ticket, root.rows)
  // Synthetic maximum-length titles exercise the transport guard, not upstream data semantics.
  const longTitles = { ...data, catalog: createTrustedRaycastCanIUseCatalog(data.catalog.entries.map(row => ({ ...row, title: 'a'.repeat(1024) }))) }
  assert.throws(() => prepareTrustedRaycastCanIUseRoot(longTitles, preferences, context, registry, ''), { code: 'LIMIT_EXCEEDED' })
  assert.equal(registry.stats().liveHandleCount, 0)
  assert.equal(registry.stats().state, 'error')
})

test('source packets reject cross-session data, malformed rows and oversized input', () => {
  const registry = new TrustedRaycastCanIUseActionRegistry()
  const root = prepareTrustedRaycastCanIUseRoot(data, preferences, context, registry, 'css-grid')
  assert.throws(() => createTrustedRaycastCanIUseSourceRoot(root.message, { ...context, sessionId: 'other' }, () => true), { code: 'SNAPSHOT_STALE' })
  assert.throws(() => createTrustedRaycastCanIUseSourceRoot(root.message, context, () => { throw new Error('private-input') }), { code: 'SNAPSHOT_STALE', message: 'SNAPSHOT_STALE' })
  for (const change of [
    (value: any) => { value.extra = true },
    (value: any) => { value.features[0].extra = true },
    (value: any) => { value.features[0].status = 'private-input' },
    (value: any) => { value.features[0].supported = null },
    (value: any) => { value.features = Array(65).fill(value.features[0]) },
    (value: any) => { value.revision = -1 },
    (value: any) => { value.type = 'eval' },
  ]) {
    const value = JSON.parse(root.message)
    change(value)
    assert.throws(() => createTrustedRaycastCanIUseSourceRoot(JSON.stringify(value), context, () => true), { code: 'RENDER_INVALID' })
  }
  assert.throws(() => createTrustedRaycastCanIUseSourceRoot('{private-input', context, () => true), { code: 'RENDER_INVALID', message: 'RENDER_INVALID' })
  assert.throws(() => createTrustedRaycastCanIUseSourceRoot({}, context, () => true), { code: 'RENDER_INVALID' })
  assert.throws(() => createTrustedRaycastCanIUseSourceRoot(' '.repeat(32769), context, () => true), { code: 'LIMIT_EXCEEDED' })
})
