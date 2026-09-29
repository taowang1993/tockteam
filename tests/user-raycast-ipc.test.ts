import assert from 'node:assert/strict'
import { test } from 'node:test'
import { USER_RAYCAST_IPC, isUserRaycastCandidate, isUserRaycastSourceCandidate, isUserRaycastStatus } from '../src/user-raycast-contract.ts'
import { registerUserRaycastIpcHandlers } from '../src/user-raycast-ipc.ts'

const sender = { id: 42 }
const event = { sender }
const candidate = { command: 'browse', digest: 'a'.repeat(64), extensionId: 'local-example', title: 'Local Example' }
const sourceCandidate = { command: 'generate', digest: 'c'.repeat(64), extensionId: 'uuid-generator', title: 'UUID Generator', license: 'MIT', revision: 'a'.repeat(40), tree: 'b'.repeat(40), files: 3, bytes: 321, mode: 'no-view', source: `https://github.com/raycast/extensions/tree/${'a'.repeat(40)}/extensions/uuid-generator` } as const
const state = { candidate, digest: '', enabled: false, hasPrevious: false, installed: false }

test('a Raycast command name may use camelCase without changing the extension ID rule', () => {
  assert.equal(isUserRaycastCandidate({ ...candidate, command: 'generateV5' }), true)
  assert.equal(isUserRaycastCandidate({ ...candidate, extensionId: 'UuidGenerator' }), false)
})

test('menu-bar identity crosses only the same finite source, candidate and status checks', () => {
  assert.equal(isUserRaycastSourceCandidate({ ...sourceCandidate, mode: 'menu-bar' }), true)
  assert.equal(isUserRaycastCandidate({ ...candidate, mode: 'menu-bar' }), true)
  assert.equal(isUserRaycastStatus({ ...state, mode: 'menu-bar' }), true)
  assert.equal(isUserRaycastStatus({ ...state, mode: 'background' }), false)
})

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
    sourcePrepare: async () => sourceCandidate,
    sourceBuild: async () => currentState,
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

test('only the owning launcher can fetch a selected source and build its reviewed digest', async () => {
  const handlers = new Map<string, (...args: any[]) => unknown>()
  let fetched = false; let built = false
  let currentState: any = state
  const dispose = registerUserRaycastIpcHandlers({
    guard: { assert(raw: unknown) { if ((raw as typeof event).sender !== sender) throw new Error('Launcher owner denied'); return { role: 'launcher', webContentsId: sender.id } } } as any,
    ipcMain: { handle(name: string, callback: (...args: any[]) => unknown) { handlers.set(name, callback) }, removeHandler(name: string) { handlers.delete(name) } } as any,
    getState: () => currentState,
    choose: async () => candidate,
    sourcePrepare: async (owner, selection) => { assert.equal(owner.webContentsId, sender.id); assert.deepEqual(selection, { extensionId: 'uuid-generator', command: 'generate' }); fetched = true; currentState = { ...state, sourceCandidate }; return sourceCandidate },
    sourceBuild: async (owner, digest) => { assert.equal(owner.webContentsId, sender.id); assert.equal(digest, sourceCandidate.digest); built = true; currentState = { ...currentState, candidate }; return currentState },
    approve: async () => currentState,
    mutate: () => currentState,
    open: async () => {}, send: () => {}, close: async () => {},
  })
  try {
    await assert.rejects(async () => await handlers.get(USER_RAYCAST_IPC.sourcePrepare)!({ sender: { id: 99 } }, { extensionId: 'uuid-generator', command: 'generate' }), /owner denied/i)
    await assert.rejects(async () => await handlers.get(USER_RAYCAST_IPC.sourcePrepare)!(event, { extensionId: '../uuid', command: 'generate' }), /selection/i)
    assert.equal(fetched, false)
    assert.deepEqual(await handlers.get(USER_RAYCAST_IPC.sourcePrepare)!(event, { extensionId: 'uuid-generator', command: 'generate' }), sourceCandidate)
    await assert.rejects(async () => await handlers.get(USER_RAYCAST_IPC.sourceBuild)!(event, { digest: 'd'.repeat(64) }), /review|digest/i)
    assert.equal(built, false)
    assert.equal(((await handlers.get(USER_RAYCAST_IPC.sourceBuild)!(event, { digest: sourceCandidate.digest })) as any).candidate.digest, candidate.digest)
    assert.equal(built, true)
  } finally { dispose() }
})
