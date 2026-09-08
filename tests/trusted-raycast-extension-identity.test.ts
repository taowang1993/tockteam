import assert from 'node:assert/strict'
import test from 'node:test'
import {
  isTrustedRaycastNativeOutcome,
  isTrustedRaycastNativeRequest,
  isTrustedRaycastViewEvent,
  isTrustedRaycastViewMessage,
  isTrustedRaycastViewOpen,
  parseTrustedRaycastChildMessage,
} from '../src/trusted-raycast-contract.ts'

const open = {
  extensionId: 'google-translate' as const,
  sessionId: 'session',
  generation: 'generation',
  command: 'translate',
  preferences: {},
} as const
const event = {
  extensionId: 'google-translate' as const,
  sessionId: 'session',
  generation: 'generation',
  revision: 0,
  eventId: 'search',
  kind: 'searchChanged',
  value: 'hello',
} as const
const ready = {
  type: 'ready',
  extensionId: 'google-translate' as const,
  sessionId: 'session',
  generation: 'generation',
  revision: 0,
  root: { type: 'root', props: {}, children: [] },
} as const

test('trusted Raycast sessions, events, and child messages require a reviewed extension ID', () => {
  assert.equal(isTrustedRaycastViewOpen(open), true)
  assert.equal(isTrustedRaycastViewEvent(event), true)
  assert.equal(isTrustedRaycastViewMessage(ready), true)
  assert.equal(parseTrustedRaycastChildMessage(JSON.stringify(ready), open, -1).extensionId, 'google-translate')

  for (const invalidId of [undefined, '', 'translate', 'unknown', '../google-translate']) {
    const withId = (value: object): object => invalidId === undefined
      ? Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'extensionId'))
      : { ...value, extensionId: invalidId }
    assert.equal(isTrustedRaycastViewOpen(withId(open)), false)
    assert.equal(isTrustedRaycastViewEvent(withId(event)), false)
    assert.equal(isTrustedRaycastViewMessage(withId(ready)), false)
  }
})

test('trusted Raycast child message must match the active extension identity', () => {
  assert.throws(() => parseTrustedRaycastChildMessage(JSON.stringify({ ...ready, extensionId: 'kaomoji-search' }), open, -1), /runtime message/)
  assert.equal(isTrustedRaycastViewOpen({ ...open, extensionId: 'kaomoji-search', command: 'index' }), true)
  assert.equal(isTrustedRaycastViewOpen({ ...open, extensionId: 'kaomoji-search', command: 'translate' }), false)
  assert.equal(isTrustedRaycastViewOpen({ ...open, extensionId: 'google-translate' as const, command: 'index' }), false)
})

test('native requests and outcomes carry finite extension identity and capability scope', () => {
  const selected = { type: 'native', extensionId: 'google-translate', sessionId: 's', generation: 'g', requestId: 'n', kind: 'selectedText' }
  const copy = { type: 'native', extensionId: 'kaomoji-search', sessionId: 's', generation: 'g', requestId: 'n', revision: 0, eventId: 'a', kind: 'copy', text: '(^_^)' }
  assert.equal(isTrustedRaycastNativeRequest(selected), true)
  assert.equal(isTrustedRaycastNativeRequest({ ...selected, extensionId: 'kaomoji-search' }), false)
  assert.equal(isTrustedRaycastNativeRequest(copy), true)
  assert.equal(isTrustedRaycastNativeRequest(Object.fromEntries(Object.entries(copy).filter(([key]) => key !== 'extensionId'))), false)

  const outcome = { type: 'nativeOutcome', extensionId: 'kaomoji-search', requestId: 'n', succeeded: true, message: '' }
  assert.equal(isTrustedRaycastNativeOutcome(outcome), true)
  assert.equal(isTrustedRaycastNativeOutcome({ ...outcome, extensionId: 'unknown' }), false)
  assert.equal(isTrustedRaycastNativeOutcome(Object.fromEntries(Object.entries(outcome).filter(([key]) => key !== 'extensionId'))), false)
})
