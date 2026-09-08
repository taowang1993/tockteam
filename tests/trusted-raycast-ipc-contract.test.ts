import test from 'node:test'
import assert from 'node:assert/strict'
import { registerTrustedRaycastIpcHandlers } from '../src/trusted-raycast-ipc.ts'
import { TRUSTED_RAYCAST_IPC_CHANNELS, TRUSTED_RAYCAST_TRUST_IPC_CHANNELS, isTrustedRaycastViewMessage, isTrustedRaycastViewEvent } from '../src/trusted-raycast-contract.ts'
import { createLauncherPreloadBridge } from '../src/launcher-preload-bridge.ts'

test('view IPC authenticates before parsing and disposes only its finite handlers', async () => {
  const handlers = new Map<string, (...args: any[]) => unknown>()
  const sender = {}
  let sent = 0; let closed = 0
  const trustState: import('../src/trusted-raycast-contract.ts').TrustedRaycastTrustState = { active: true, candidateAvailable: true, candidateDigest: '', digest: '', digestApproved: false, enabled: false, hasPrevious: false, installed: false, previewed: false, recovery: '', staged: false }
  const dispose = registerTrustedRaycastIpcHandlers({
    ipcMain: { handle: (channel, handler) => { handlers.set(channel, handler) }, removeHandler: channel => { handlers.delete(channel) } },
    guard: { assert: event => { if (event !== sender) throw new Error('untrusted'); return { role: 'launcher', webContentsId: 7 } } },
    onEvent: owner => { assert.equal(owner.webContentsId, 7); sent++ },
    onClose: owner => { assert.equal(owner.webContentsId, 7); closed++ },
    getTrust: () => trustState,
    onTrustAction: action => ({ ok: true, state: { ...trustState, ...(action === 'enable' ? { enabled: true } : null) } }),
  })
  const event = handlers.get(TRUSTED_RAYCAST_IPC_CHANNELS.event)!
  const close = handlers.get(TRUSTED_RAYCAST_IPC_CHANNELS.close)!
  const input = { extensionId: 'google-translate' as const, sessionId: 's', generation: 'g', revision: 0, eventId: 'e', kind: 'searchChanged', value: 'hello' }
  await assert.rejects(Promise.resolve(event({}, input)), /untrusted/)
  await assert.rejects(Promise.resolve(event(sender, { ...input, extra: true })), /Invalid/)
  await assert.rejects(Promise.resolve(event(sender, input, 'extra')), /Invalid/)
  await event(sender, input); assert.equal(sent, 1)
  await assert.rejects(Promise.resolve(close(sender, {})), /arguments/)
  await close(sender); assert.equal(closed, 1)
  const trust = handlers.get(TRUSTED_RAYCAST_TRUST_IPC_CHANNELS.action)!
  await assert.rejects(Promise.resolve(trust({}, 'enable')), /untrusted/)
  await assert.rejects(Promise.resolve(trust(sender, 'launch')), /Invalid/)
  await assert.rejects(Promise.resolve(trust(sender, 'enable', 'extra')), /Invalid/)
  const enabled = (await trust(sender, 'enable')) as Readonly<{ ok: true; state: { enabled: boolean } }>
  assert.equal(enabled.state.enabled, true)
  dispose(); dispose(); assert.equal(handlers.size, 0)
})
test('projection rejects unknown families, oversized text, nonfinite properties and foreign keys', () => {
  const root = { type: 'root', props: {}, children: [] }
  const message = { type: 'ready', extensionId: 'google-translate', sessionId: 's', generation: 'g', revision: 0, root }
  assert.equal(isTrustedRaycastViewMessage(message), true)
  assert.equal(isTrustedRaycastViewMessage({ ...message, root: { ...root, type: 'iframe' } }), false)
  assert.equal(isTrustedRaycastViewMessage({ ...message, root: { ...root, props: { text: 'a'.repeat(262145) } } }), false)
  assert.equal(isTrustedRaycastViewMessage({ ...message, root: { ...root, props: { number: Infinity } } }), false)
  assert.equal(isTrustedRaycastViewMessage({ ...message, token: 'not-public' }), false)
  assert.equal(isTrustedRaycastViewEvent({ extensionId: 'google-translate' as const, sessionId: 's', generation: 'g', revision: 0, eventId: 'e', kind: 'searchChanged', value: '中'.repeat(5462) }), false)
})
test('preload filters malformed projections and rejects extra event arguments', async () => {
  const listeners = new Map<string, (...args: any[]) => void>()
  let count = 0
  const bridge = createLauncherPreloadBridge({ invoke: async () => ({ ok: true }), on: (name, handler) => listeners.set(name, handler) })
  const remove = bridge.onTrustedRaycastView(() => count++)
  const receive = listeners.get(TRUSTED_RAYCAST_IPC_CHANNELS.patch)!
  receive({}, { type: 'patch', extra: true }); assert.equal(count, 0)
  receive({}, { type: 'ready', extensionId: 'google-translate', sessionId: 's', generation: 'g', revision: 0, root: { type: 'root', props: {}, children: [] } }); assert.equal(count, 1)
  const outcome = { type: 'outcome', extensionId: 'google-translate', sessionId: 's', generation: 'g', revision: 0, eventId: 'copy', succeeded: false, message: 'Clipboard denied' }
  receive({}, outcome); assert.equal(count, 2)
  receive({}, { ...outcome, succeeded: 'true' }); assert.equal(count, 2)
  receive({}, { ...outcome, native: { kind: 'copy', text: 'untrusted' } }); assert.equal(count, 2)
  const toast = { type: 'toast', extensionId: 'google-translate', sessionId: 's', generation: 'g', revision: 0, querySequence: 0, style: 'failure', title: 'Could not translate', message: 'Service unavailable' }
  receive({}, toast); assert.equal(count, 3)
  receive({}, { ...toast, message: 'x'.repeat(4097) }); assert.equal(count, 3)
  receive({}, { ...toast, style: 'execute' }); assert.equal(count, 3)
  remove()
  await assert.rejects((bridge.trustedRaycastEvent as (...args: unknown[]) => Promise<unknown>)({}, 'extra'), /arguments/)
})
