import assert from 'node:assert/strict'
import { test } from 'node:test'
import { prepareTrustedRaycastCanIUsePreferences, TRUSTED_RAYCAST_CAN_I_USE_PREFERENCE_DEFAULTS } from '../src/trusted-raycast-can-i-use-preferences.ts'

const options = { canonicalTargets: Object.freeze(['chrome 100', 'firefox 100', 'op_mini all']) }
const values = () => ({ showReleaseDate: true, showPartialSupport: false, briefMode: false,
  defaultQuery: 'chrome 100', path: '', environment: '' })

test('prepares all six preferences before the source query and preserves explicit target semantics', () => {
  const input = { ...values(), defaultQuery: ' firefox 100, chrome 100, chrome 100 ' }
  const prepared = prepareTrustedRaycastCanIUsePreferences(input, options)
  assert.deepEqual(prepared, { preferences: { ...input, defaultQuery: 'chrome 100,firefox 100', environment: 'production' },
    targets: ['chrome 100', 'firefox 100'] })
  input.defaultQuery = 'defaults'
  assert.ok(Object.isFrozen(prepared))
  assert.ok(Object.isFrozen(prepared.preferences))
  assert.ok(Object.isFrozen(prepared.targets))
  const withOperaMini = prepareTrustedRaycastCanIUsePreferences({ ...values(), defaultQuery: 'op_mini all\r\nchrome 100',
    showReleaseDate: false, showPartialSupport: true, briefMode: true, environment: 'modern' }, options)
  assert.deepEqual(withOperaMini.targets, ['chrome 100', 'op_mini all'])
  assert.equal(withOperaMini.preferences.environment, 'modern')
  assert.equal(withOperaMini.preferences.showReleaseDate, false)
  assert.equal(withOperaMini.preferences.showPartialSupport, true)
  assert.equal(withOperaMini.preferences.briefMode, true)
})

test('unsupported defaults, selectors and workspace choices never become a successful fallback', () => {
  assert.ok(Object.isFrozen(TRUSTED_RAYCAST_CAN_I_USE_PREFERENCE_DEFAULTS))
  assert.throws(() => prepareTrustedRaycastCanIUsePreferences(TRUSTED_RAYCAST_CAN_I_USE_PREFERENCE_DEFAULTS, options), { code: 'DATA_UNAVAILABLE' })
  for (const defaultQuery of ['last 2 versions', '', 'chrome 999', 'chrome 100,']) {
    assert.throws(() => prepareTrustedRaycastCanIUsePreferences({ ...values(), defaultQuery }, options), { code: 'QUERY_UNSUPPORTED' })
  }
  assert.throws(() => prepareTrustedRaycastCanIUsePreferences({ ...values(), defaultQuery: 'x'.repeat(4097) }, options), { code: 'LIMIT_EXCEEDED' })
  for (const path of ['.', 'project/config']) {
    assert.throws(() => prepareTrustedRaycastCanIUsePreferences({ ...values(), path }, options), { code: 'WORKSPACE_UNAVAILABLE' })
  }
  for (const path of ['~', '/private-input', '../private-input', '@workspace-config-v1']) {
    assert.throws(() => prepareTrustedRaycastCanIUsePreferences({ ...values(), path }, options), { code: 'CONFIG_INVALID', message: 'CONFIG_INVALID' })
  }
})

test('accepts only six own data fields without calling getters or converting values', () => {
  let invoked = 0
  const getter = Object.defineProperty(values(), 'defaultQuery', { enumerable: true, get() { invoked++; throw new Error('private-input') } })
  const hidden = Object.defineProperty(values(), 'defaultQuery', { value: 'chrome 100', enumerable: false })
  const symbol = { ...values(), [Symbol('extra')]: true }
  const { environment: _environment, ...missing } = values()
  const invalid = [null, undefined, [], Object.create(values()), new Date(), missing, getter, hidden, symbol,
    { ...values(), extra: true }, { ...values(), showReleaseDate: 'true' }, { ...values(), showPartialSupport: 0 },
    { ...values(), briefMode: null }, { ...values(), defaultQuery: { toString() { invoked++; return 'chrome 100' } } },
    { ...values(), path: false }, { ...values(), environment: undefined },
    new Proxy({}, { getPrototypeOf() { throw new Error('private-input') } })]
  for (const input of invalid) {
    assert.throws(() => prepareTrustedRaycastCanIUsePreferences(input, options), { code: 'CONFIG_INVALID', message: 'CONFIG_INVALID' })
  }
  assert.equal(invoked, 0)
})

test('environment selection is bounded and never comes from ambient Browserslist settings', () => {
  const previous = process.env.BROWSERSLIST_ENV
  process.env.BROWSERSLIST_ENV = 'ambient-input'
  try {
    assert.equal(prepareTrustedRaycastCanIUsePreferences(values(), options).preferences.environment, 'production')
    assert.equal(prepareTrustedRaycastCanIUsePreferences({ ...values(), environment: 'a'.repeat(64) }, options).preferences.environment.length, 64)
    for (const environment of ['a'.repeat(65), 'production modern', '../private-input', '\n']) {
      assert.throws(() => prepareTrustedRaycastCanIUsePreferences({ ...values(), environment }, options), { code: 'CONFIG_INVALID', message: 'CONFIG_INVALID' })
    }
  } finally {
    if (previous === undefined) delete process.env.BROWSERSLIST_ENV
    else process.env.BROWSERSLIST_ENV = previous
  }
})
