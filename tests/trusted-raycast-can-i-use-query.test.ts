import assert from 'node:assert/strict'
import test from 'node:test'
import {
  TRUSTED_RAYCAST_CAN_I_USE_ERROR_CODES,
  TrustedRaycastCanIUseError,
} from '../src/trusted-raycast-can-i-use-errors.ts'
import {
  isTrustedRaycastCanIUseCanonicalTarget,
  normalizeTrustedRaycastCanIUseQuery,
} from '../src/trusted-raycast-can-i-use-query.ts'

const canonicalTargets = new Set([
  'chrome 120',
  'chrome 120.0',
  'firefox 121',
  'ios_saf 15.2-15.3',
  'safari TP',
  'safari all',
])

function assertCode(code: TrustedRaycastCanIUseError['code'], action: () => unknown): void {
  assert.throws(action, error => error instanceof TrustedRaycastCanIUseError && error.code === code)
}

test('normalizes unions after CRLF, ASCII whitespace, deduplication, and byte sorting', () => {
  assert.deepEqual(normalizeTrustedRaycastCanIUseQuery(
    '  ios_saf\t15.2-15.3 , chrome\t120\n firefox 121, chrome 120  ',
    { canonicalTargets },
  ), ['chrome 120', 'firefox 121', 'ios_saf 15.2-15.3'])
  assert.deepEqual(normalizeTrustedRaycastCanIUseQuery('firefox 121\r\nchrome 120', { canonicalTargets }), [
    'chrome 120',
    'firefox 121',
  ])
})

test('requires exact canonical table buckets, including all, TP, and hyphenated versions', () => {
  assert.deepEqual(normalizeTrustedRaycastCanIUseQuery('safari TP, safari all, chrome 120.0', { canonicalTargets }), [
    'chrome 120.0',
    'safari TP',
    'safari all',
  ])
  assert.equal(isTrustedRaycastCanIUseCanonicalTarget('ios_saf 15.2-15.3'), true)
  assert.equal(isTrustedRaycastCanIUseCanonicalTarget('chrome\t120'), false)
  assertCode(TRUSTED_RAYCAST_CAN_I_USE_ERROR_CODES.QUERY_UNSUPPORTED, () => normalizeTrustedRaycastCanIUseQuery('ios_saf 15.2-15.4', { canonicalTargets }))
  assertCode(TRUSTED_RAYCAST_CAN_I_USE_ERROR_CODES.QUERY_UNSUPPORTED, () => normalizeTrustedRaycastCanIUseQuery('op_mini all', { canonicalTargets }))
})

test('defaults is unavailable without the separately approved immutable fixture', () => {
  assertCode(TRUSTED_RAYCAST_CAN_I_USE_ERROR_CODES.DATA_UNAVAILABLE, () => normalizeTrustedRaycastCanIUseQuery('defaults', { canonicalTargets }))
})

test('rejects aliases, ranges, selectors, injection, Unicode, and invalid numeric spellings', () => {
  for (const query of [
    'ff 121',
    'fx 121',
    'ios 15.2',
    'Chrome 120',
    'chrome 999',
    'chrome 0120',
    'chrome 120.0000',
    'chrome 120.',
    'chrome 120-121',
    'ios_saf 15.2 -15.3',
    'last 2 versions',
    '> 1%',
    'not dead',
    'extends browserslist-config-evil',
    'supports es6',
    'defaults, chrome 120',
    'chrome 120,,firefox 121',
    ',chrome 120',
    'chrome 120,',
    'chrome 120\rfirefox 121',
    'chrome\u00a0120',
    'chrome 120\u200b',
    '\ufeffchrome 120',
    'chrome 120 # comment',
    'chrome 120; firefox 121',
    'chrome 120 / firefox 121',
  ]) {
    assertCode(TRUSTED_RAYCAST_CAN_I_USE_ERROR_CODES.QUERY_UNSUPPORTED, () => normalizeTrustedRaycastCanIUseQuery(query, { canonicalTargets }))
  }
})

test('enforces clause, query-byte, and returned-target limits before membership', () => {
  assertCode(TRUSTED_RAYCAST_CAN_I_USE_ERROR_CODES.LIMIT_EXCEEDED, () => normalizeTrustedRaycastCanIUseQuery(
    Array.from({ length: 65 }, () => 'chrome 120').join(','),
    { canonicalTargets },
  ))
  assertCode(TRUSTED_RAYCAST_CAN_I_USE_ERROR_CODES.LIMIT_EXCEEDED, () => normalizeTrustedRaycastCanIUseQuery('a'.repeat(4_097), { canonicalTargets }))
  assertCode(TRUSTED_RAYCAST_CAN_I_USE_ERROR_CODES.LIMIT_EXCEEDED, () => normalizeTrustedRaycastCanIUseQuery(`${'a'.repeat(64)} 1`, { canonicalTargets }))
})

test('rejects non-string queries and extra or malformed options', () => {
  assertCode(TRUSTED_RAYCAST_CAN_I_USE_ERROR_CODES.QUERY_UNSUPPORTED, () => normalizeTrustedRaycastCanIUseQuery(['chrome 120'], { canonicalTargets } as never))
  assertCode(TRUSTED_RAYCAST_CAN_I_USE_ERROR_CODES.DATA_UNAVAILABLE, () => normalizeTrustedRaycastCanIUseQuery('chrome 120', {
    canonicalTargets,
    extra: true,
  } as never))
  assertCode(TRUSTED_RAYCAST_CAN_I_USE_ERROR_CODES.DATA_UNAVAILABLE, () => normalizeTrustedRaycastCanIUseQuery('chrome 120', {
    canonicalTargets: ['chrome\t120'],
  }))
})
