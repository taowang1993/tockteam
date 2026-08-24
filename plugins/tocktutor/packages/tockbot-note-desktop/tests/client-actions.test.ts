import assert from 'node:assert/strict'
import test from 'node:test'
import {
  replaceActionController,
  requestMicrophoneAccess,
  runDesktopDispatchLoop,
  type DesktopActionRemote,
  type DesktopCallerBridge,
} from '../dist/client-actions.js'

const vault = Object.freeze({ generation: 7, id: `vault:${'a'.repeat(64)}` })

test('replaces an aborted action controller for a new dependency generation', () => {
  const first = replaceActionController()
  assert.equal(first.signal.aborted, false)
  let busy = true
  const second = replaceActionController(first, () => { busy = false })
  assert.equal(first.signal.aborted, true)
  assert.equal(second.signal.aborted, false)
  assert.equal(busy, false)
})

test('uses audio-only media after the exact source note remains current', async () => {
  const mediaCalls: unknown[] = []
  let current = { activePath: 'Folder/Note.md', vault }
  const remote = async () => {
    current = { activePath: 'Folder/Other.md', vault }
    return { ok: true as const, value: { status: 'granted' as const } }
  }
  let staleTrackStopped = false
  const stale = await requestMicrophoneAccess(
    'authorization',
    'Folder/Note.md',
    vault,
    () => current,
    remote,
    {
      async getUserMedia(value: { audio: true; video: false }) {
        mediaCalls.push(value)
        return { getTracks: () => [{ stop() { staleTrackStopped = true } }] }
      },
    },
  )
  assert.deepEqual(stale, { ok: true, value: { status: 'stale' } })
  assert.deepEqual(mediaCalls, [{ audio: true, video: false }])
  assert.equal(staleTrackStopped, true)

  current = { activePath: 'Folder/Note.md', vault }
  let stopped = false
  const granted = await requestMicrophoneAccess(
    'authorization',
    'Folder/Note.md',
    vault,
    () => current,
    async () => ({ ok: true, value: { status: 'granted' } }),
    {
      async getUserMedia(value: { audio: true; video: false }) {
        mediaCalls.push(value)
        return { getTracks: () => [{ stop() { stopped = true } }] }
      },
    },
  )
  assert.deepEqual(granted, { ok: true, value: { status: 'granted' } })
  assert.deepEqual(mediaCalls, [
    { audio: true, video: false },
    { audio: true, video: false },
  ])
  assert.equal(stopped, true)
})

test('settles a dispatch race as stale when the slot is disposed', async () => {
  const calls: unknown[] = []
  let active = true
  const bridge = {
    async authorize() { return { authorization: 'unused' } },
    async cancelDispatch() {},
    async completeDispatch(value: unknown) {
      calls.push(value)
      return 'stale' as const
    },
    async nextDispatch() {
      active = false
      return {
        action: 'daily' as const,
        deliveryId: 'delivery-race',
        kind: 'quick-action' as const,
        operationId: 'dispatch-race',
      }
    },
  }
  await runDesktopDispatchLoop({
    active: () => active,
    bridge,
    owner: () => undefined,
    remote: { tocktutorDesktop: {} } as DesktopActionRemote,
  })
  assert.deepEqual(calls, [{
    deliveryId: 'delivery-race',
    operationId: 'dispatch-race',
    status: 'stale',
  }])
})

test('settles a Workbench completion as stale after the slot is disposed', async () => {
  const completions: unknown[] = []
  let active = true
  let next = true
  const bridge = {
    async authorize() { return { authorization: 'unused' } },
    async cancelDispatch() {},
    async completeDispatch(value: unknown) { completions.push(value); return 'stale' as const },
    async nextDispatch() {
      if (!next) return null
      next = false
      return {
        action: 'capture' as const,
        deliveryId: 'delivery-handler-race',
        kind: 'quick-action' as const,
        operationId: 'dispatch-handler-race',
      }
    },
  }
  await runDesktopDispatchLoop({
    active: () => active,
    bridge,
    owner: () => ({
      activePath: 'Folder/Note.md',
      async handleDispatch() { active = false; return 'handled' as const },
      vault,
    }),
    remote: { tocktutorDesktop: {} } as DesktopActionRemote,
  })
  assert.deepEqual(completions, [{
    deliveryId: 'delivery-handler-race',
    operationId: 'dispatch-handler-race',
    status: 'stale',
  }])
})

test('retries the exact dispatch attempt after completion response loss', async () => {
  const completions: unknown[] = []
  let next = true
  const bridge = {
    async authorize() { return { authorization: 'unused' } },
    async cancelDispatch() {},
    async completeDispatch(value: unknown) {
      completions.push(value)
      if (completions.length === 1) throw new Error('response lost')
      return 'handled' as const
    },
    async nextDispatch() {
      if (!next) return null
      next = false
      return {
        action: 'new' as const,
        deliveryId: 'delivery-retry',
        kind: 'quick-action' as const,
        operationId: 'dispatch-retry',
      }
    },
  }
  await runDesktopDispatchLoop({
    bridge,
    owner: () => ({
      activePath: null,
      handleDispatch: async () => 'handled' as const,
      vault: null,
    }),
    remote: { tocktutorDesktop: {} } as DesktopActionRemote,
  })
  assert.deepEqual(completions, [
    { deliveryId: 'delivery-retry', operationId: 'dispatch-retry', status: 'handled' },
    { deliveryId: 'delivery-retry', operationId: 'dispatch-retry', status: 'handled' },
  ])
})

test('rolls back dispatch when exact completion cannot be recovered', async () => {
  let cancelled = 0
  let next = true
  const bridge = {
    async authorize() { return { authorization: 'unused' } },
    async cancelDispatch() { cancelled += 1 },
    async completeDispatch() { throw new Error('transport unavailable') },
    async nextDispatch() {
      if (!next) return null
      next = false
      return {
        action: 'new' as const,
        deliveryId: 'delivery-failed-completion',
        kind: 'quick-action' as const,
        operationId: 'dispatch-failed-completion',
      }
    },
  }
  await assert.rejects(runDesktopDispatchLoop({
    bridge,
    owner: () => ({ activePath: null, handleDispatch: async () => 'handled' as const, vault: null }),
    remote: { tocktutorDesktop: {} } as DesktopActionRemote,
  }), /transport unavailable/u)
  assert.equal(cancelled, 1)
})

test('does not repeat native actions for non-transport Remote failures', async () => {
  let attempts = 0
  let next = true
  await runDesktopDispatchLoop({
    bridge: {
      async authorize() { return { authorization: 'authorization' } },
      async cancelDispatch() {},
      async completeDispatch(request) {
        assert.equal(request.status, 'failed')
        return 'handled' as const
      },
      async nextDispatch() {
        if (!next) return null
        next = false
        return {
          deliveryId: 'delivery-business-failure',
          kind: 'protocol' as const,
          operationId: 'dispatch-business-failure',
          request: { action: 'choose-vault' as const },
        }
      },
    },
    owner: () => ({ activePath: null, handleDispatch: async () => 'failed' as const, vault: null }),
    remote: {
      tocktutorDesktop: {
        async activateVault() {
          attempts += 1
          return {
            ok: false as const,
            error: { code: 'internal', details: {}, message: 'business failure' },
          }
        },
      },
    } as unknown as DesktopActionRemote,
  })
  assert.equal(attempts, 1)
})

test('retries a native Remote with the same caller authorization after response loss', async () => {
  const calls: unknown[] = []
  let next = true
  let attempts = 0
  const bridge = {
    async authorize(operation: string) {
      calls.push(['authorize', operation])
      return { authorization: 'same-authorization' }
    },
    async cancelDispatch() {},
    async completeDispatch(value: unknown) {
      calls.push(['complete', value])
      return 'handled' as const
    },
    async nextDispatch() {
      if (!next) return null
      next = false
      return {
        deliveryId: 'delivery-native-retry',
        kind: 'protocol' as const,
        operationId: 'dispatch-native-retry',
        request: { action: 'choose-vault' as const },
      }
    },
  }
  const remote = {
    tocktutorDesktop: {
      async activateVault(authorization: string) {
        attempts += 1
        calls.push(['activateVault', authorization])
        return attempts === 1
          ? { ok: false as const, error: { code: 'transport', message: 'response lost' } }
          : { ok: true as const, value: { status: 'activated' as const } }
      },
    },
  } as DesktopActionRemote
  await runDesktopDispatchLoop({
    bridge,
    owner: () => ({ activePath: null, handleDispatch: async () => 'failed' as const, vault: null }),
    remote,
  })
  assert.deepEqual(calls, [
    ['authorize', 'activate-vault'],
    ['activateVault', 'same-authorization'],
    ['activateVault', 'same-authorization'],
    ['complete', {
      deliveryId: 'delivery-native-retry',
      operationId: 'dispatch-native-retry',
      status: 'handled',
    }],
  ])
})

test('forwards lifecycle cancellation to adapter-owned dispatch calls', async () => {
  const signal = new AbortController().signal
  let next = true
  let received: AbortSignal | undefined
  await runDesktopDispatchLoop({
    bridge: {
      async authorize() { return { authorization: 'authorization' } },
      async cancelDispatch() {},
      async completeDispatch() { return 'handled' as const },
      async nextDispatch() {
        if (!next) return null
        next = false
        return {
          deliveryId: 'delivery-signal',
          kind: 'protocol' as const,
          operationId: 'dispatch-signal',
          request: { action: 'choose-vault' as const },
        }
      },
    },
    owner: () => ({ activePath: null, handleDispatch: async () => 'failed' as const, vault: null }),
    remote: {
      tocktutorDesktop: {
        async activateVault(_authorization: string, ownerSignal?: AbortSignal) {
          received = ownerSignal
          return { ok: true, value: { status: 'activated' } }
        },
      },
    } as DesktopActionRemote,
    signal,
  })
  assert.strictEqual(received, signal)
})

test('dispatches Workbench actions and keeps Desktop-owned vault/window actions caller-bound', async () => {
  const calls: Array<{ method: string; value: unknown }> = []
  const events = [
    {
      action: 'new' as const,
      deliveryId: 'delivery-1',
      kind: 'quick-action' as const,
      operationId: 'dispatch-1',
    },
    {
      deliveryId: 'delivery-2',
      kind: 'protocol' as const,
      operationId: 'dispatch-2',
      request: { action: 'choose-vault' as const },
    },
    {
      deliveryId: 'delivery-3',
      kind: 'protocol' as const,
      operationId: 'dispatch-3',
      request: { action: 'open' as const, file: 'Folder/Other.md', paneType: 'window' as const },
    },
  ]
  const bridge: DesktopCallerBridge = {
    async authorize(operation) {
      calls.push({ method: 'authorize', value: operation })
      return { authorization: `${operation}-authorization` }
    },
    async cancelDispatch() {},
    async completeDispatch(value) {
      calls.push({ method: 'completeDispatch', value })
      return value.status === 'handled' ? 'handled' : 'stale'
    },
    async nextDispatch() { return events.shift() ?? null },
  }
  const remote: DesktopActionRemote = {
    tocktutorDesktop: {
      async activateVault(authorization) {
        calls.push({ method: 'activateVault', value: authorization })
        return { ok: true, value: { status: 'activated' } }
      },
      async openPopOut(authorization, path, expectedVault) {
        calls.push({ method: 'openPopOut', value: { authorization, expectedVault, path } })
        return { ok: true, value: { status: 'focused' } }
      },
    } as DesktopActionRemote['tocktutorDesktop'],
  }
  const owner = {
    activePath: 'Folder/Note.md',
    async handleDispatch(event: unknown) {
      calls.push({ method: 'handleDispatch', value: event })
      return 'handled' as const
    },
    vault,
  }

  await runDesktopDispatchLoop({ bridge, owner: () => owner, remote })

  assert.deepEqual(calls, [
    { method: 'handleDispatch', value: { action: 'new', kind: 'quick-action', operationId: 'dispatch-1' } },
    {
      method: 'completeDispatch',
      value: { deliveryId: 'delivery-1', operationId: 'dispatch-1', status: 'handled' },
    },
    { method: 'authorize', value: 'activate-vault' },
    { method: 'activateVault', value: 'activate-vault-authorization' },
    {
      method: 'completeDispatch',
      value: { deliveryId: 'delivery-2', operationId: 'dispatch-2', status: 'handled' },
    },
    { method: 'authorize', value: 'popout-open' },
    {
      method: 'openPopOut',
      value: {
        authorization: 'popout-open-authorization',
        expectedVault: vault,
        path: 'Folder/Other.md',
      },
    },
    {
      method: 'completeDispatch',
      value: { deliveryId: 'delivery-3', operationId: 'dispatch-3', status: 'handled' },
    },
  ])
})
