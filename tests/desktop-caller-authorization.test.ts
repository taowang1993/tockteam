import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  DesktopCallerAuthorizations,
  type DesktopCallerOperation,
} from '../src/desktop-caller-authorization.ts'
import type { NativeOperationIdentity } from '../src/host-contract.ts'

const operation: DesktopCallerOperation = 'microphone'

function identity(operationId: string, requestId: string, windowId: string): NativeOperationIdentity {
  return {
    operationId,
    requestId,
    sessionId: 'runtime-child-session',
    vaultGeneration: 3,
    vaultId: 'vault-3',
    windowId,
  }
}

test('claims one trusted-main authorization with a fully main-derived native identity', () => {
  let next = 0
  const authorizations = new DesktopCallerAuthorizations({ randomId: () => `secret-${String(++next)}` })
  const issued = authorizations.issue(operation, 'main-window')
  assert.deepEqual(authorizations.claim({ authorization: issued.authorization, operation }, identity), {
    operationId: 'secret-2',
    requestId: 'secret-3',
    sessionId: 'runtime-child-session',
    vaultGeneration: 3,
    vaultId: 'vault-3',
    windowId: 'main-window',
  })
  assert.equal(authorizations.claim({ authorization: issued.authorization, operation }, identity), undefined)
  assert.equal(authorizations.size, 0)
})

test('wrong kind consumes once and expiry, window close, and disposal fail closed', () => {
  let now = 5_000
  let next = 0
  const authorizations = new DesktopCallerAuthorizations({
    lifetimeMs: 50,
    now: () => now,
    randomId: () => `bound-${String(++next)}`,
  })

  const wrongKind = authorizations.issue('popout-open', 'main-window')
  assert.equal(authorizations.claim({ authorization: wrongKind.authorization, operation: 'print' }, identity), undefined)
  assert.equal(authorizations.claim({ authorization: wrongKind.authorization, operation: 'popout-open' }, identity), undefined)

  const expired = authorizations.issue('reveal-entry', 'main-window')
  now += 51
  assert.equal(authorizations.claim({ authorization: expired.authorization, operation: 'reveal-entry' }, identity), undefined)

  const closed = authorizations.issue('export-html', 'main-window')
  authorizations.revokeWindow('main-window')
  assert.equal(authorizations.claim({ authorization: closed.authorization, operation: 'export-html' }, identity), undefined)

  const disposed = authorizations.issue('activate-vault', 'main-window')
  authorizations.dispose()
  assert.equal(authorizations.claim({ authorization: disposed.authorization, operation: 'activate-vault' }, identity), undefined)
  assert.throws(() => authorizations.issue('activate-vault', 'main-window'), /unavailable/u)
})

test('rejects malformed issue and malformed derived identity without retaining authority', () => {
  const authorizations = new DesktopCallerAuthorizations({ randomId: () => 'x'.repeat(48) })
  assert.throws(() => authorizations.issue('unsafe' as DesktopCallerOperation, 'main-window'), /invalid/u)
  assert.throws(() => authorizations.issue('print', ''), /invalid/u)
  const issued = authorizations.issue('print', 'main-window')
  assert.equal(authorizations.claim({ authorization: issued.authorization, operation: 'print' }, (
    operationId,
    requestId,
    windowId,
  ) => ({
    operationId,
    requestId,
    sessionId: '',
    vaultGeneration: 0,
    vaultId: null,
    windowId,
  })), undefined)
  assert.equal(authorizations.size, 0)
})
