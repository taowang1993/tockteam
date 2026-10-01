import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isUserRaycastEvent, isUserRaycastFieldValue, USER_RAYCAST_IPC } from '../src/user-raycast-contract.ts'
import { registerUserRaycastIpcHandlers } from '../src/user-raycast-ipc.ts'

const field = { sessionId: 'session', revision: 0, eventId: 'field-1', requestId: 'request-1', kind: 'fieldChanged', value: 'Edited' }
test('field transport accepts only finite typed and bounded exact requests', () => {
  assert.equal(isUserRaycastEvent(field), true)
  assert.equal(isUserRaycastEvent({ ...field, kind: 'fieldFocused', value: false }), true)
  assert.equal(isUserRaycastEvent({ ...field, kind: 'fieldBlurred' }), true)
  for (const invalid of [
    { ...field, sessionId: undefined }, { ...field, sessionId: '' }, { ...field, requestId: '' }, { ...field, requestId: 'x'.repeat(129) },
    { ...field, revision: -1 }, { ...field, revision: 0.5 }, { ...field, eventId: '' }, { ...field, value: 1 },
    { ...field, value: ['Edited'] }, { ...field, value: 'x'.repeat(16385) }, { ...field, kind: 'native' }, { ...field, path: '/tmp/not-allowed' },
  ]) assert.equal(isUserRaycastEvent(invalid), false)
  assert.equal(isUserRaycastFieldValue('checkbox', false), true)
  assert.equal(isUserRaycastFieldValue('checkbox', 'false'), false)
  assert.equal(isUserRaycastFieldValue('text', ''), true)
  assert.equal(isUserRaycastFieldValue('password', 'fake-only'), true)
  assert.equal(isUserRaycastFieldValue('textarea', 'Two\nLines'), true)
  assert.equal(isUserRaycastFieldValue('text', true), false)
  assert.equal(isUserRaycastFieldValue('arbitrary', 'anything'), false)
})

for (const changed of [false, true]) test(`field IPC waits for completion and rechecks its owner (${changed ? 'replaced' : 'current'})`, async () => {
  const handlers = new Map<string, (...args: any[]) => any>()
  let current = 42, closed = false, sent = false, finished = false
  let complete!: () => void
  const pending = new Promise<void>(resolve => { complete = resolve })
  const state = { digest: '', installed: false, enabled: false, hasPrevious: false }
  const dispose = registerUserRaycastIpcHandlers({
    guard: { assert: () => ({ role: 'launcher', webContentsId: current }) } as any,
    ipcMain: { handle: (name: string, handler: (...args: any[]) => any) => handlers.set(name, handler), removeHandler: (name: string) => handlers.delete(name) } as any,
    getState: () => state, choose: async () => undefined, sourcePrepare: async () => { throw Error('Not called') }, sourceBuild: async () => state,
    approve: async () => state, mutate: () => state, open: async () => {},
    send: async (owner, value) => { assert.equal(owner.webContentsId, 42); assert.deepEqual(value, field); sent = true; await pending },
    close: async owner => { assert.equal(owner.webContentsId, 42); closed = true },
  })
  try {
    const handler = handlers.get(USER_RAYCAST_IPC.event)!
    await assert.rejects(handler({}, { revision: 0, eventId: 'action-0', kind: 'action' }), /Invalid extension event/)
    const result = handler({}, field).then((value: unknown) => { finished = true; return value })
    await Promise.resolve(); assert.equal(sent, true); assert.equal(finished, false)
    if (changed) current = 99
    complete()
    if (changed) { await assert.rejects(result, /owner changed/); assert.equal(closed, true) }
    else { assert.deepEqual(await result, { ok: true }); assert.equal(closed, false) }
  } finally { complete(); dispose() }
})
