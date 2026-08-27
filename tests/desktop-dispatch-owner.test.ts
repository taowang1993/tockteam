import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DesktopDispatchOwner } from '../src/desktop-dispatch-owner.ts'
import {
  isTockTutorProtocol,
  parseSingleInstanceProtocolUrls,
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
  assert.equal(parseTockTutorProtocol('tocktutor://open?file=C%3A%2FWindows%2Fsecret.md'), null)
  assert.deepEqual(parseTockTutorProtocol('tocktutor://open?path=C%3A%5CVault%5CPlan.md'), {
    action: 'open',
    path: 'C:\\Vault\\Plan.md',
  })
  assert.equal(parseTockTutorProtocol('tocktutor://new?file=Plan.md&x-success=file%3A%2F%2Funsafe'), null)
  assert.equal(parseTockTutorProtocol('tocktutor://open?file=Plan.md&x-success=tocktutor%3A%2F%2Fopen%3Ffile%3DLoop.md%26x-success%3Dhttps%253A%252F%252Fexample.test'), null)
  assert.equal(parseTockTutorProtocol(`tocktutor://search?query=${'x'.repeat(4097)}`), null)
  assert.equal(parseTockTutorProtocol('https://example.com'), null)
})

test('classifies protocol arguments case-insensitively', () => {
  assert.equal(isTockTutorProtocol('tocktutor://open?vault=Notes'), true)
  assert.equal(isTockTutorProtocol('TockTutor://open?vault=Notes'), true)
  assert.equal(isTockTutorProtocol('/tmp/tocktutor:notes'), false)
})

test('recovers protocol URLs from single-instance launch data when macOS omits argv', () => {
  assert.deepEqual(parseSingleInstanceProtocolUrls(
    ['/Applications/TockTeam Desktop', '--user-data-dir=/tmp/profile'],
    {
      tockTutorProtocolUrls: [
        'tocktutor://open?file=Nested.md&paneType=split',
        'https://example.test',
        'tocktutor://open?file=Nested.md&paneType=split',
      ],
    },
  ), ['tocktutor://open?file=Nested.md&paneType=split'])
  assert.deepEqual(parseSingleInstanceProtocolUrls([], { tockTutorProtocolUrls: 'tocktutor://open?file=No.md' }), [])
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
      vaultId: known[1]!.id,
    },
  })
  const nested = { generation: 6, id: `vault:${'c'.repeat(64)}`, name: 'Notes', path: '/vaults/work/Notes' }
  const absolute = resolveTockTutorProtocolRequest(
    parseTockTutorProtocol('tocktutor://open?path=%2Fvaults%2Fwork%2FNotes%2FPlan.md')!,
    [...known, nested],
    known[0],
  )
  assert.equal(absolute?.request.file, 'Plan.md')
  assert.equal(absolute?.request.vaultId, nested.id)
  assert.equal('path' in (absolute?.request ?? {}), false)
  assert.equal('vault' in (absolute?.request ?? {}), false)
  const aliased = resolveTockTutorProtocolRequest(
    parseTockTutorProtocol('tocktutor://open?path=%2Ftmp%2Fvaults%2Fwork%2FPlan.md')!,
    known,
    known[0],
    undefined,
    path => path.replace(/^\/tmp\/vaults/u, '/vaults'),
  )
  assert.equal(aliased?.request.file, 'Plan.md')
  assert.equal(aliased?.request.vaultId, known[1]!.id)
  assert.equal(resolveTockTutorProtocolRequest(
    parseTockTutorProtocol('tocktutor://open?path=%2Foutside%2FPlan.md')!,
    known,
    known[0],
  ), null)
  assert.equal(resolveTockTutorProtocolRequest(
    parseTockTutorProtocol('tocktutor://open?path=%2Freplaced%2FPlan.md')!,
    known,
    known[0],
    undefined,
    path => path === '/vaults/work' ? '/replaced' : path,
  ), null)
})

test('delivers a named-vault request under the current boundary and completes under the activated boundary', async () => {
  const current = { generation: 4, id: `vault:${'a'.repeat(64)}` }
  const target = { generation: 5, id: `vault:${'b'.repeat(64)}` }
  let active = current
  const dispatch = new DesktopDispatchOwner({
    identity: (operationId, requestId) => ({
      operationId,
      requestId,
      sessionId: 'session',
      vaultGeneration: active.generation,
      vaultId: active.id,
      windowId: 'window',
    }),
    isAvailable: () => true,
    resolveProtocol: request => resolveTockTutorProtocolRequest(request, [
      { ...current, name: 'Archive', path: '/vaults/archive' },
      { ...target, name: 'Work', path: '/vaults/work' },
    ], { ...current, name: 'Archive', path: '/vaults/archive' }),
  })
  assert.equal(dispatch.publishProtocol('tocktutor://open?vault=Work&file=Plan.md'), true)
  const event = await dispatch.next(new AbortController().signal)
  assert.ok(event?.kind === 'protocol')
  assert.equal(event?.identity.vaultId, current.id)
  if (event?.kind !== 'protocol') return
  assert.equal(event.request.vaultId, target.id)
  active = target
  assert.equal((await dispatch.complete({ operationId: event.identity.operationId, status: 'handled' }, new AbortController().signal)).status, 'handled')
})

test('reports a superseded queued vault callback exactly once', () => {
  const callbacks: string[] = []
  const current = { generation: 4, id: `vault:${'a'.repeat(64)}`, name: 'Archive', path: '/vaults/archive' }
  const work = { generation: 5, id: `vault:${'b'.repeat(64)}`, name: 'Work', path: '/vaults/work' }
  const dispatch = new DesktopDispatchOwner({
    identity: (operationId, requestId) => ({ operationId, requestId, sessionId: 'session', vaultGeneration: current.generation, vaultId: current.id, windowId: 'window' }),
    isAvailable: () => true,
    onCallback: (url, status) => { callbacks.push(`${status}:${url}`) },
    resolveProtocol: request => resolveTockTutorProtocolRequest(request, [current, work], current),
  })
  assert.equal(dispatch.publishProtocol('tocktutor://open?vault=Work&file=One.md&x-error=https%3A%2F%2Fexample.test%2Fone-error'), true)
  assert.equal(dispatch.publishProtocol('tocktutor://open?vault=Work&file=Two.md&x-error=https%3A%2F%2Fexample.test%2Ftwo-error'), true)
  assert.deepEqual(callbacks, ['error:https://example.test/one-error'])
})

test('reports a rejected sensitive selector through its error callback', () => {
  const callbacks: string[] = []
  const dispatch = new DesktopDispatchOwner({
    identity: (operationId, requestId) => ({ operationId, requestId, sessionId: 'session', vaultGeneration: 1, vaultId: 'vault', windowId: 'window' }),
    isAvailable: () => true,
    onCallback: (url, status) => { callbacks.push(`${status}:${url}`) },
    resolveProtocol: () => null,
  })
  assert.equal(dispatch.publishProtocol('tocktutor://open?path=%2Foutside%2FNote.md&x-error=https%3A%2F%2Fexample.test%2Frejected'), false)
  assert.deepEqual(callbacks, ['error:https://example.test/rejected'])
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

test('reports terminal queue drops and superseded rollbacks through error callbacks', async () => {
  const callbacks: string[] = []
  let id = 0
  const dispatch = new DesktopDispatchOwner({
    identity: (operationId, requestId) => ({ operationId, requestId, sessionId: 'session', vaultGeneration: 1, vaultId: 'vault', windowId: 'window' }),
    isAvailable: () => true,
    onCallback: (url, status) => { callbacks.push(`${status}:${url}`) },
    randomId: () => `id-${++id}`,
  })
  for (let index = 0; index < 65; index += 1) {
    assert.equal(dispatch.publishProtocol(`tocktutor://open?file=${String(index)}.md&x-error=https%3A%2F%2Fexample.test%2F${String(index)}`), true)
  }
  assert.deepEqual(callbacks, ['error:https://example.test/0'])

  const current = { generation: 1, id: `vault:${'a'.repeat(64)}` }
  const target = { generation: 2, id: `vault:${'b'.repeat(64)}` }
  const switched = new DesktopDispatchOwner({
    identity: (operationId, requestId) => ({ operationId, requestId, sessionId: 'session', vaultGeneration: current.generation, vaultId: current.id, windowId: 'window' }),
    isAvailable: () => true,
    onCallback: (url, status) => { callbacks.push(`${status}:${url}`) },
    resolveProtocol: request => resolveTockTutorProtocolRequest(request, [
      { ...current, name: 'Current', path: '/vaults/current' },
      { ...target, name: 'Target', path: '/vaults/target' },
    ], { ...current, name: 'Current', path: '/vaults/current' }),
  })
  assert.equal(switched.publishProtocol('tocktutor://open?vault=Target&file=One.md&x-error=https%3A%2F%2Fexample.test%2Fsuperseded'), true)
  const delivered = await switched.next(new AbortController().signal)
  assert.ok(delivered)
  assert.equal(switched.publishProtocol('tocktutor://open?vault=Target&file=Two.md'), true)
  switched.rollbackDelivery(delivered.identity.operationId)
  assert.deepEqual(callbacks, ['error:https://example.test/0', 'error:https://example.test/superseded'])
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
