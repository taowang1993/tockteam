import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createTrustedRaycastCanIUseAliases,
  createTrustedRaycastCanIUseSnapshot,
} from '../src/trusted-raycast-can-i-use-aliases.ts'
import {
  TRUSTED_RAYCAST_CAN_I_USE_ERROR_CODES,
  TrustedRaycastCanIUseError,
} from '../src/trusted-raycast-can-i-use-errors.ts'

const canonicalTargets = [
  'firefox 121',
  'chrome 120',
]

function assertCode(code: TrustedRaycastCanIUseError['code'], action: () => unknown): void {
  assert.throws(action, error => error instanceof TrustedRaycastCanIUseError && error.code === code)
}

test('binds exact finite os, path, and Browserslist alias surfaces', () => {
  const snapshot = createTrustedRaycastCanIUseSnapshot({
    identity: 'snapshot-1',
    generation: 7,
    defaultQuery: ' firefox\t121, chrome 120 ',
    environment: 'production',
    canonicalTargets,
  })
  let current = true
  const calls: Array<[string, number]> = []
  const aliases = createTrustedRaycastCanIUseAliases(snapshot, (identity, generation) => {
    calls.push([identity, generation])
    return current && identity === 'snapshot-1' && generation === 7
  })

  assert.deepEqual(Object.keys(aliases), ['os', 'path', 'browserslist'])
  assert.deepEqual(Object.keys(aliases.os), ['homedir'])
  assert.deepEqual(Object.keys(aliases.path), ['default'])
  assert.deepEqual(Object.keys(aliases.path.default), ['join'])
  assert.equal(snapshot.defaultQuery, 'chrome 120,firefox 121')
  assert.deepEqual(aliases.browserslist(snapshot.defaultQuery), ['chrome 120', 'firefox 121'])
  assert.deepEqual(aliases.browserslist(null, { path: '@workspace-config-v1', env: 'production' }), [
    'chrome 120',
    'firefox 121',
  ])
  assert.deepEqual(calls, [
    ['snapshot-1', 7],
    ['snapshot-1', 7],
  ])

  const first = aliases.browserslist(snapshot.defaultQuery)
  first.reverse()
  assert.deepEqual(aliases.browserslist(snapshot.defaultQuery), ['chrome 120', 'firefox 121'])
  assert.deepEqual(snapshot.targets, ['chrome 120', 'firefox 121'])
  assert.equal(Object.isFrozen(snapshot), true)
  assert.equal(Object.isFrozen(snapshot.targets), true)
})

test('throws fixed path errors and never supplies a home or lexical join fallback', () => {
  const aliases = createTrustedRaycastCanIUseAliases(createTrustedRaycastCanIUseSnapshot({
    identity: 'snapshot-2',
    generation: 1,
    defaultQuery: 'chrome 120',
    environment: 'production',
    canonicalTargets,
  }), () => true)
  assertCode(TRUSTED_RAYCAST_CAN_I_USE_ERROR_CODES.PATH_UNSUPPORTED, () => aliases.os.homedir())
  assertCode(TRUSTED_RAYCAST_CAN_I_USE_ERROR_CODES.PATH_UNSUPPORTED, () => aliases.path.default.join('~', 'config'))
})

test('accepts only the two current Browserslist call shapes', () => {
  const snapshot = createTrustedRaycastCanIUseSnapshot({
    identity: 'snapshot-3',
    generation: 2,
    defaultQuery: 'chrome 120',
    environment: 'production',
    canonicalTargets,
  })
  const aliases = createTrustedRaycastCanIUseAliases(snapshot, () => true)
  const call = aliases.browserslist as (...args: unknown[]) => string[]

  for (const action of [
    () => call(),
    () => call('chrome 120', undefined),
    () => call('chrome 121'),
    () => call(['chrome 120']),
    () => call('defaults'),
    () => call(null, { path: '@workspace-config-v1', env: 'production', extra: false }),
    () => call(null, { path: '@workspace-config-v1', env: 'development' }),
    () => call(null, { path: '~', env: 'production' }),
    () => call(null, { path: '/absolute', env: 'production' }),
    () => call(null, { path: '../workspace', env: 'production' }),
    () => call(null, { path: 'a/../b', env: 'production' }),
    () => call(null, { path: '@workspace-config-v1', env: 'production' }, undefined),
  ]) {
    assertCode(TRUSTED_RAYCAST_CAN_I_USE_ERROR_CODES.QUERY_UNSUPPORTED, action)
  }
})

test('rejects stale identity and generation before returning a snapshot copy', () => {
  const snapshot = createTrustedRaycastCanIUseSnapshot({
    identity: 'snapshot-4',
    generation: 8,
    defaultQuery: 'chrome 120',
    environment: 'production',
    canonicalTargets,
  })
  let active = true
  const aliases = createTrustedRaycastCanIUseAliases(snapshot, (identity, generation) => (
    active && identity === 'snapshot-4' && generation === 8
  ))
  assert.deepEqual(aliases.browserslist(snapshot.defaultQuery), ['chrome 120'])
  active = false
  assertCode(TRUSTED_RAYCAST_CAN_I_USE_ERROR_CODES.SNAPSHOT_STALE, () => aliases.browserslist(snapshot.defaultQuery))
  assertCode(TRUSTED_RAYCAST_CAN_I_USE_ERROR_CODES.SNAPSHOT_STALE, () => aliases.browserslist(null, {
    path: '@workspace-config-v1',
    env: 'production',
  }))
})

test('does not create a defaults snapshot without the approved fixture', () => {
  assertCode(TRUSTED_RAYCAST_CAN_I_USE_ERROR_CODES.DATA_UNAVAILABLE, () => createTrustedRaycastCanIUseSnapshot({
    identity: 'snapshot-defaults',
    generation: 1,
    defaultQuery: 'defaults',
    environment: 'production',
    canonicalTargets,
  }))
})
