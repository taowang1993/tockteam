import test from 'node:test'
import assert from 'node:assert/strict'
import {
  isBoundedTrustedRaycastMessage,
  isTrustedRaycastViewEvent,
  isTrustedRaycastViewOpen,
} from '../src/trusted-raycast-contract.ts'

test('trusted translate view accepts only bounded finite messages', () => {
  assert.equal(isTrustedRaycastViewOpen({
    sessionId: 'session', generation: 'generation', command: 'translate', preferences: { lang1: 'auto' },
  }), true)
  assert.equal(isTrustedRaycastViewOpen({
    sessionId: 'session', generation: 'generation', command: 'other', preferences: {},
  }), false)
  assert.equal(isTrustedRaycastViewEvent({
    sessionId: 'session', generation: 'generation', revision: 1, eventId: 'event', kind: 'searchChanged', value: 'hello',
  }), true)
  assert.equal(isTrustedRaycastViewEvent({
    sessionId: 'session', generation: 'generation', revision: 1, eventId: 'event', kind: 'action', extra: true,
  }), false)
  assert.equal(isBoundedTrustedRaycastMessage({ value: 'hello' }), true)
  assert.equal(isBoundedTrustedRaycastMessage({ value: Number.NaN }), false)
  assert.equal(isTrustedRaycastViewOpen({
    sessionId: 's', generation: 'g', command: 'translate', preferences: Object.fromEntries(Array.from({ length: 65 }, (_, index) => [`k${index}`, 'v'])),
  }), false)
  assert.equal(isTrustedRaycastViewEvent({
    sessionId: 's', generation: 'g', revision: 0, eventId: 'e', kind: 'navigation', value: 'unsafe',
  }), false)
  assert.equal(isTrustedRaycastViewEvent({
    sessionId: 's', generation: 'g', revision: 0, eventId: 'e', kind: 'action', value: 'copy', extra: true,
  }), false)
})
