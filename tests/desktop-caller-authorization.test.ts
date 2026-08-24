import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  DesktopCallerAuthorizations,
  type DesktopCallerOperation,
} from '../src/desktop-caller-authorization.ts'
import type { NativeOperationIdentity } from '../src/host-contract.ts'

const operation: DesktopCallerOperation = 'microphone'
const vault = { generation: 3, id: 'vault-3' }

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
  const issued = authorizations.issue(operation, 'main-window', vault)
  const expected = {
    operationId: 'secret-2',
    requestId: 'secret-3',
    sessionId: 'runtime-child-session',
    vaultGeneration: 3,
    vaultId: 'vault-3',
    windowId: 'main-window',
  }
  assert.deepEqual(authorizations.claim({ authorization: issued.authorization, operation }, identity), expected)
  assert.deepEqual(authorizations.claim({ authorization: issued.authorization, operation }, identity), expected)
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

  const wrongKind = authorizations.issue('popout-open', 'main-window', vault)
  assert.equal(authorizations.claim({ authorization: wrongKind.authorization, operation: 'print' }, identity), undefined)
  assert.equal(authorizations.claim({ authorization: wrongKind.authorization, operation: 'popout-open' }, identity), undefined)

  const expired = authorizations.issue('reveal-entry', 'main-window', vault)
  now += 51
  assert.equal(authorizations.claim({ authorization: expired.authorization, operation: 'reveal-entry' }, identity), undefined)

  const closed = authorizations.issue('export-html', 'main-window', vault)
  authorizations.revokeWindow('main-window')
  assert.equal(authorizations.claim({ authorization: closed.authorization, operation: 'export-html' }, identity), undefined)

  const disposed = authorizations.issue('activate-vault', 'main-window', vault)
  authorizations.dispose()
  assert.equal(authorizations.claim({ authorization: disposed.authorization, operation: 'activate-vault' }, identity), undefined)
  assert.throws(() => authorizations.issue('activate-vault', 'main-window', vault), /unavailable/u)
})

test('authorization is bound to the vault generation captured by trusted main', () => {
  let next = 0
  const authorizations = new DesktopCallerAuthorizations({ randomId: () => `vault-bound-${String(++next)}` })
  const issued = authorizations.issue('print', 'main-window', vault)
  assert.equal(authorizations.claim({ authorization: issued.authorization, operation: 'print' }, (
    operationId,
    requestId,
    windowId,
  ) => ({
    operationId,
    requestId,
    sessionId: 'runtime-child-session',
    vaultGeneration: 4,
    vaultId: 'vault-4',
    windowId,
  })), undefined)
})

test('bounds pending and replayable claims under one authorization cap', () => {
  let now = 1_000
  let next = 0
  const authorizations = new DesktopCallerAuthorizations({
    lifetimeMs: 50,
    maxAuthorizations: 1,
    now: () => now,
    randomId: () => `capped-${String(++next)}`,
  })
  const issued = authorizations.issue('print', 'main-window', vault)
  assert.ok(authorizations.claim({ authorization: issued.authorization, operation: 'print' }, identity))
  assert.throws(() => authorizations.issue('print', 'main-window', vault), /unavailable/u)
  now += 51
  assert.doesNotThrow(() => authorizations.issue('print', 'main-window', vault))
})

test('rejects malformed issue and malformed derived identity without retaining authority', () => {
  const authorizations = new DesktopCallerAuthorizations({ randomId: () => 'x'.repeat(48) })
  assert.throws(() => authorizations.issue('unsafe' as DesktopCallerOperation, 'main-window', vault), /invalid/u)
  assert.throws(() => authorizations.issue('print', '', vault), /invalid/u)
  const issued = authorizations.issue('print', 'main-window', vault)
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
