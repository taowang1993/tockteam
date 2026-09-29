import assert from 'node:assert/strict'
import { test } from 'node:test'
import { USER_RAYCAST_IPC } from '../src/user-raycast-contract.ts'
import { registerUserRaycastIpcHandlers } from '../src/user-raycast-ipc.ts'

const sender = { id: 42 }
const event = { sender }
const candidate = { command: 'browse', digest: 'a'.repeat(64), extensionId: 'local-example', title: 'Local Example' }
const state = { candidate, digest: '', enabled: false, hasPrevious: false, installed: false }

test('only the owning launcher may choose, approve and open a user extension', async () => {
  const handlers = new Map<string, (...args: any[]) => unknown>()
  let approved = false
  let launched = false
  let currentState = state
  const dispose = registerUserRaycastIpcHandlers({
    guard: { assert(raw: unknown) { if ((raw as typeof event).sender !== sender) throw new Error('Launcher owner denied'); return { role: 'launcher', webContentsId: sender.id } } } as any,
    ipcMain: { handle(name: string, callback: (...args: any[]) => unknown) { handlers.set(name, callback) }, removeHandler(name: string) { handlers.delete(name) } } as any,
    getState: () => currentState,
    choose: async () => candidate,
    approve: async (owner, digest) => { assert.equal(owner.webContentsId, sender.id); assert.equal(digest, candidate.digest); approved = true; currentState = { ...state, digest, installed: true }; return currentState },
    open: async owner => { assert.equal(owner.webContentsId, sender.id); assert.ok(approved); launched = true },
    mutate: action => { assert.equal(action, 'enable'); currentState = { ...currentState, enabled: true }; return currentState },
    send: () => {},
    close: async () => {},
  })
  try {
    await assert.rejects(async () => await handlers.get(USER_RAYCAST_IPC.choose)!({ sender: { id: 99 } }), /owner denied/i)
    assert.equal(approved, false)
    assert.deepEqual(await handlers.get(USER_RAYCAST_IPC.choose)!(event), candidate)
    await assert.rejects(async () => await handlers.get(USER_RAYCAST_IPC.approve)!(event, { digest: 'b'.repeat(64) }), /review|digest/i)
    assert.equal(approved, false)
    await handlers.get(USER_RAYCAST_IPC.approve)!(event, { digest: candidate.digest })
    await handlers.get(USER_RAYCAST_IPC.mutate)!(event, 'enable')
    await handlers.get(USER_RAYCAST_IPC.open)!(event)
    assert.equal(launched, true)
  } finally { dispose() }
  assert.equal(handlers.size, 0)
})
