import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  DesktopCallerAuthorizations,
  type DesktopCallerOperation,
} from '../src/desktop-caller-authorization.ts'
import type { NativeOperationIdentity } from '../src/host-contract.ts'

const operation: DesktopCallerOperation = 'microphone'

function identity(
  operationId: string,
  requestId: string,
  windowId: string,
  sessionId: string,
): NativeOperationIdentity {
  return {
    operationId,
    requestId,
    sessionId,
    vaultGeneration: 3,
    vaultId: 'vault-3',
    windowId,
  }
}

test('claims one trusted-main authorization with a main-derived native identity', () => {
  let now = 1_000
  let next = 0
  const authorizations = new DesktopCallerAuthorizations({
    now: () => now,
    randomId: () => `secret-${String(++next)}`,
  })
  const issued = authorizations.issue(operation, 'main-window')
  const claimed = authorizations.claim({
    authorization: issued.authorization,
    operation,
    sessionId: 'session-3',
    vaultGeneration: 3,
    vaultId: 'vault-3',
  }, identity)

  assert.deepEqual(claimed, {
    operationId: 'secret-2',
    requestId: 'secret-3',
    sessionId: 'session-3',
    vaultGeneration: 3,
    vaultId: 'vault-3',
    windowId: 'main-window',
  })
  assert.equal(authorizations.claim({
    authorization: issued.authorization,
    operation,
    sessionId: 'session-3',
    vaultGeneration: 3,
    vaultId: 'vault-3',
  }, identity), undefined)

  now += 1
  assert.equal(authorizations.size, 0)
})

test('wrong bindings consume once and expiry, window close, and disposal fail closed', () => {
  let now = 5_000
  let next = 0
  const authorizations = new DesktopCallerAuthorizations({
    lifetimeMs: 50,
    now: () => now,
    randomId: () => `bound-${String(++next)}`,
  })

  const wrongKind = authorizations.issue('popout-open', 'main-window')
  assert.equal(authorizations.claim({
    authorization: wrongKind.authorization,
    operation: 'print',
    sessionId: 'session',
    vaultGeneration: 3,
    vaultId: 'vault-3',
  }, identity), undefined)
  assert.equal(authorizations.claim({
    authorization: wrongKind.authorization,
    operation: 'popout-open',
    sessionId: 'session',
    vaultGeneration: 3,
    vaultId: 'vault-3',
  }, identity), undefined)

  const expired = authorizations.issue('reveal', 'main-window')
  now += 51
  assert.equal(authorizations.claim({
    authorization: expired.authorization,
    operation: 'reveal',
    sessionId: 'session',
    vaultGeneration: 3,
    vaultId: 'vault-3',
  }, identity), undefined)

  const closed = authorizations.issue('export-html', 'main-window')
  authorizations.revokeWindow('main-window')
  assert.equal(authorizations.claim({
    authorization: closed.authorization,
    operation: 'export-html',
    sessionId: 'session',
    vaultGeneration: 3,
    vaultId: 'vault-3',
  }, identity), undefined)

  const disposed = authorizations.issue('activate', 'main-window')
  authorizations.dispose()
  assert.equal(authorizations.claim({
    authorization: disposed.authorization,
    operation: 'activate',
    sessionId: 'session',
    vaultGeneration: 3,
    vaultId: 'vault-3',
  }, identity), undefined)
  assert.throws(() => authorizations.issue('activate', 'main-window'), /unavailable/u)
})

test('rejects malformed issue and claim fields without retaining authority', () => {
  const authorizations = new DesktopCallerAuthorizations({ randomId: () => 'x'.repeat(48) })
  assert.throws(() => authorizations.issue('unsafe' as DesktopCallerOperation, 'main-window'), /invalid/u)
  assert.throws(() => authorizations.issue('print', ''), /invalid/u)
  const issued = authorizations.issue('print', 'main-window')
  assert.equal(authorizations.claim({
    authorization: issued.authorization,
    operation: 'print',
    sessionId: '',
    vaultGeneration: 0,
    vaultId: null,
  }, identity), undefined)
  assert.equal(authorizations.size, 0)
})
