import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DesktopDispatchOwner } from '../src/desktop-dispatch-owner.ts'
import {
  isTockTutorProtocol,
  parseTockTutorProtocol,
  resolveTockTutorProtocolRequest,
} from '../src/desktop-native-policy.ts'

function owner(): DesktopDispatchOwner {
  let id = 0
  return new DesktopDispatchOwner({
    identity: (operationId, requestId) => ({
      operationId,
      requestId,
      sessionId: 'session',
      vaultGeneration: 1,
      vaultId: 'vault',
      windowId: 'window',
    }),
    isAvailable: () => true,
    randomId: () => `id-${++id}`,
  })
}

test('protocol parser accepts bounded TockTutor requests and rejects credentials or unsafe callbacks', () => {
  assert.deepEqual(parseTockTutorProtocol('tocktutor://open?vault=Notes&file=Plan.md'), {
    action: 'open',
    file: 'Plan.md',
    vault: 'Notes',
  })
  assert.equal(parseTockTutorProtocol('tocktutor://user:password@open?vault=Notes'), null)
  assert.equal(parseTockTutorProtocol('tocktutor://new?file=Plan.md&x-success=file%3A%2F%2Funsafe'), null)
  assert.equal(parseTockTutorProtocol(`tocktutor://search?query=${'x'.repeat(4097)}`), null)
  assert.equal(parseTockTutorProtocol('https://example.com'), null)
})

test('classifies protocol arguments case-insensitively', () => {
  assert.equal(isTockTutorProtocol('tocktutor://open?vault=Notes'), true)
  assert.equal(isTockTutorProtocol('TockTutor://open?vault=Notes'), true)
  assert.equal(isTockTutorProtocol('/tmp/tocktutor:notes'), false)
})

test('resolves named and absolute protocol selectors without exposing Host paths', () => {
  const known = [
    { generation: 4, id: `vault:${'a'.repeat(64)}`, name: 'Archive', path: '/vaults/archive' },
    { generation: 5, id: `vault:${'b'.repeat(64)}`, name: 'Work', path: '/vaults/work' },
  ]
  const named = resolveTockTutorProtocolRequest(
    parseTockTutorProtocol('tocktutor://open?vault=Work&file=Notes%2FPlan.md')!,
    known,
    known[0],
  )
  assert.deepEqual(named, {
    request: {
      action: 'open',
      file: 'Notes/Plan.md',
      vaultGeneration: 5,
      vaultId: known[1]!.id,
    },
    target: { generation: 5, id: known[1]!.id },
  })
  const absolute = resolveTockTutorProtocolRequest(
    parseTockTutorProtocol('tocktutor://open?path=%2Fvaults%2Fwork%2FNotes%2FPlan.md')!,
    known,
    known[0],
  )
  assert.equal(absolute?.request.file, 'Notes/Plan.md')
  assert.equal('path' in (absolute?.request ?? {}), false)
  assert.equal('vault' in (absolute?.request ?? {}), false)
})

test('dispatch callbacks are emitted once after final completion', async () => {
  const callbacks: string[] = []
  const dispatch = new DesktopDispatchOwner({
    identity: (operationId, requestId) => ({ operationId, requestId, sessionId: 'session', vaultGeneration: 1, vaultId: 'vault', windowId: 'window' }),
    isAvailable: () => true,
    onCallback: (url, status) => { callbacks.push(`${status}:${url}`) },
  })
  assert.equal(dispatch.publishProtocol('tocktutor://open?file=Note.md&x-success=https%3A%2F%2Fexample.test%2Fdone'), true)
  const event = await dispatch.next(new AbortController().signal)
  assert.ok(event)
  assert.equal((await dispatch.complete({ operationId: event!.identity.operationId, status: 'handled' }, new AbortController().signal)).status, 'handled')
  assert.equal((await dispatch.complete({ operationId: event!.identity.operationId, status: 'handled' }, new AbortController().signal)).status, 'stale')
  assert.deepEqual(callbacks, ['success:https://example.test/done'])
})

test('dispatch owner delivers typed quick actions and matches one completion', async () => {
  const dispatch = owner()
  assert.equal(dispatch.publishQuickAction('daily'), true)
  const event = await dispatch.next(new AbortController().signal)
  assert.equal(event?.kind, 'quick-action')
  if (event === undefined) return
  assert.equal(event.identity.operationId, 'id-1')
  assert.deepEqual(await dispatch.complete({ operationId: event.identity.operationId, status: 'handled' }, new AbortController().signal), {
    operationId: event.identity.operationId,
    status: 'handled',
  })
  assert.deepEqual(await dispatch.complete({ operationId: event.identity.operationId, status: 'handled' }, new AbortController().signal), {
    operationId: event.identity.operationId,
    status: 'stale',
  })
  dispatch.dispose()
})

test('dispatch completion expires and rejects an older vault boundary', async () => {
  let now = 0
  let vault = { generation: 1, id: 'vault-a' }
  let id = 0
  const dispatch = new DesktopDispatchOwner({
    identity: (operationId, requestId) => ({ operationId, requestId, sessionId: 'session', vaultGeneration: vault.generation, vaultId: vault.id, windowId: 'window' }),
    isAvailable: () => true,
    now: () => now,
    randomId: () => `id-${++id}`,
  })
  assert.equal(dispatch.publishQuickAction('daily'), true)
  const oldVault = await dispatch.next(new AbortController().signal)
  assert.ok(oldVault)
  vault = { generation: 2, id: 'vault-b' }
  assert.equal((await dispatch.complete({ operationId: oldVault.identity.operationId, status: 'handled' }, new AbortController().signal)).status, 'stale')
  assert.equal(dispatch.publishQuickAction('daily'), true)
  const expiring = await dispatch.next(new AbortController().signal)
  assert.ok(expiring)
  now = 5 * 60 * 1000 + 1
  assert.equal((await dispatch.complete({ operationId: expiring.identity.operationId, status: 'handled' }, new AbortController().signal)).status, 'stale')
  dispatch.dispose()
})

test('new choose-vault protocol supersedes delivered older transitions and disposal settles waiters', async () => {
  const dispatch = owner()
  assert.equal(dispatch.publishProtocol('tocktutor://choose-vault?'), true)
  const old = await dispatch.next(new AbortController().signal)
  assert.equal(old?.kind, 'protocol')
  assert.equal(dispatch.publishProtocol('tocktutor://choose-vault?'), true)
  const next = await dispatch.next(new AbortController().signal)
  assert.equal(next?.kind, 'protocol')
  if (old === undefined || next === undefined) return
  assert.deepEqual(await dispatch.complete({ operationId: old.identity.operationId, status: 'handled' }, new AbortController().signal), {
    operationId: old.identity.operationId,
    status: 'stale',
  })
  const waiting = dispatch.next(new AbortController().signal)
  dispatch.dispose()
  assert.equal(await waiting, undefined)
})
