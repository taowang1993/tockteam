import assert from 'node:assert/strict'
import test from 'node:test'
import type { TockTutorNativeActionsOwnerProps } from '@tockteam/tocktutor-workbench/client'
import {
  replaceActionController,
  requestMicrophoneAccess,
  startAudioRecording,
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

test('records authorized audio and returns a stale-safe Workbench attachment handoff', async () => {
  const listeners = new Map<string, Array<(event?: { data: Blob }) => void>>()
  let stopped = false
  const stream = { getTracks: () => [{ stop() { stopped = true } }] }
  const recorder = {
    mimeType: 'audio/webm;codecs=opus',
    state: 'inactive',
    addEventListener(type: string, listener: (event?: { data: Blob }) => void) {
      listeners.set(type, [...(listeners.get(type) ?? []), listener])
    },
    start() { this.state = 'recording' },
    stop() {
      this.state = 'inactive'
      for (const listener of listeners.get('dataavailable') ?? []) listener({ data: new Blob(['voice']) })
      for (const listener of listeners.get('stop') ?? []) listener()
    },
  }
  let current = { activePath: 'Folder/Note.md', vault }
  const started = await startAudioRecording(
    'authorization',
    'Folder/Note.md',
    vault,
    () => current,
    async () => ({ ok: true, value: { status: 'granted' } }),
    { async getUserMedia() { return stream } },
    () => recorder,
    () => new Date('2026-08-26T12:00:00.000Z'),
  )
  assert.equal(started.status, 'recording')
  if (started.status !== 'recording') assert.fail('recording must start')
  assert.equal(stopped, false)
  const result = await started.recording.stop()
  assert.deepEqual(result, {
    dataBase64: 'dm9pY2U=',
    fileName: 'Recording 2026-08-26 12-00-00.weba',
    status: 'recorded',
  })
  assert.equal(stopped, true)

  stopped = false
  recorder.state = 'inactive'
  const stale = await startAudioRecording(
    'authorization',
    'Folder/Note.md',
    vault,
    () => current,
    async () => ({ ok: true, value: { status: 'granted' } }),
    { async getUserMedia() { return stream } },
    () => recorder,
  )
  assert.equal(stale.status, 'recording')
  if (stale.status !== 'recording') assert.fail('recording must start')
  current = { activePath: 'Folder/Other.md', vault }
  assert.deepEqual(await stale.recording.stop(), { status: 'stale' })
  assert.equal(stopped, true)
})

test('cleans up failed recorder construction and rechecks ownership after byte conversion', async () => {
  let stopped = false
  const stream = { getTracks: () => [{ stop() { stopped = true } }] }
  const current = { activePath: 'Folder/Note.md', vault }
  await assert.rejects(startAudioRecording(
    'authorization',
    'Folder/Note.md',
    vault,
    () => current,
    async () => ({ ok: true, value: { status: 'granted' } }),
    { async getUserMedia() { return stream } },
    () => { throw new Error('recorder unavailable') },
  ), /recorder unavailable/u)
  assert.equal(stopped, true)

  stopped = false
  const listeners = new Map<string, Array<(event?: { data: Blob }) => void>>()
  const recorder = {
    mimeType: 'audio/webm',
    state: 'inactive',
    addEventListener(type: string, listener: (event?: { data: Blob }) => void) { listeners.set(type, [...(listeners.get(type) ?? []), listener]) },
    start() { this.state = 'recording' },
    stop() {
      this.state = 'inactive'
      for (const listener of listeners.get('dataavailable') ?? []) listener({ data: new Blob(['voice']) })
      for (const listener of listeners.get('stop') ?? []) listener()
    },
  }
  let owner = current
  let release!: (value: ArrayBuffer) => void
  const started = await startAudioRecording(
    'authorization',
    'Folder/Note.md',
    vault,
    () => owner,
    async () => ({ ok: true, value: { status: 'granted' } }),
    { async getUserMedia() { return stream } },
    () => recorder,
    () => new Date(),
    async () => await new Promise<ArrayBuffer>(resolve => { release = resolve }),
  )
  if (started.status !== 'recording') assert.fail('recording must start')
  const pending = started.recording.stop()
  owner = { activePath: 'Folder/Other.md', vault }
  release(Uint8Array.from([1]).buffer)
  assert.deepEqual(await pending, { status: 'stale' })
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

test('keeps polling after Desktop is briefly unavailable during client startup', async () => {
  const completions: unknown[] = []
  let active = true
  let polls = 0
  const bridge = {
    async authorize() { return { authorization: 'unused' } },
    async cancelDispatch() {},
    async completeDispatch(value: unknown) { completions.push(value); active = false; return 'handled' as const },
    async nextDispatch() {
      polls += 1
      if (polls === 1) return null
      return {
        action: 'daily' as const,
        deliveryId: 'delivery-after-startup',
        kind: 'quick-action' as const,
        operationId: 'dispatch-after-startup',
      }
    },
  }
  await runDesktopDispatchLoop({
    active: () => active,
    bridge,
    owner: () => ({
      activePath: 'Folder/Note.md',
      async handleDispatch() { return 'handled' as const },
      vault,
    }),
    remote: { tocktutorDesktop: {} } as DesktopActionRemote,
    unavailableRetryLimit: 2,
  })
  assert.equal(polls, 2)
  assert.deepEqual(completions, [{
    deliveryId: 'delivery-after-startup',
    operationId: 'dispatch-after-startup',
    status: 'handled',
  }])
})

test('stops polling when Desktop stays unavailable through the startup retry budget', async () => {
  let polls = 0
  await runDesktopDispatchLoop({
    bridge: {
      async authorize() { return { authorization: 'unused' } },
      async cancelDispatch() {},
      async completeDispatch() { return 'stale' as const },
      async nextDispatch() { polls += 1; return null },
    },
    owner: () => undefined,
    remote: { tocktutorDesktop: {} } as DesktopActionRemote,
    unavailableRetryLimit: 1,
  })
  assert.equal(polls, 2)
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

test('continues a named-vault dispatch with the freshly activated Workbench owner', async () => {
  const target = Object.freeze({ generation: 8, id: `vault:${'b'.repeat(64)}` })
  const completions: unknown[] = []
  const event = {
    deliveryId: 'delivery-target',
    kind: 'protocol' as const,
    operationId: 'dispatch-target',
    request: { action: 'open' as const, file: 'Folder/Target.md', vaultId: target.id },
  }
  let next = true
  let currentOwner: TockTutorNativeActionsOwnerProps = {
    activePath: 'Folder/Current.md',
    async handleDispatch() { return 'failed' as const },
    async saveCurrent() { return true },
    vault,
  }
  const bridge: DesktopCallerBridge = {
    async authorize() { return { authorization: 'activate-target' } },
    async cancelDispatch() {},
    async completeDispatch(value) { completions.push(value); return value.status === 'handled' ? 'handled' : 'stale' },
    async nextDispatch() { if (!next) return null; next = false; return event },
  }
  const remote: DesktopActionRemote = {
    tocktutorDesktop: {
      async activateVaultTarget() {
        currentOwner = {
          activePath: null,
          async handleDispatch(delivery: unknown) {
            assert.deepEqual(delivery, { kind: 'protocol', operationId: 'dispatch-target', request: { ...event.request, vaultGeneration: target.generation } })
            return 'handled' as const
          },
          async saveCurrent() { return true },
          vault: target,
        }
        return { ok: true, value: { status: 'activated' } }
      },
    } as unknown as DesktopActionRemote['tocktutorDesktop'],
  }

  await runDesktopDispatchLoop({ bridge, owner: () => currentOwner, remote })

  assert.deepEqual(completions, [{ deliveryId: 'delivery-target', operationId: 'dispatch-target', status: 'handled' }])
})

test('opens a newly created protocol window only after the Workbench publishes its path', async () => {
  const completions: unknown[] = []
  const opened: string[] = []
  let next = true
  let currentOwner: TockTutorNativeActionsOwnerProps
  currentOwner = {
    activePath: 'Folder/Current.md',
    async handleDispatch() {
      currentOwner = { ...currentOwner, activePath: 'Folder/New.md' }
      return 'handled'
    },
    async saveCurrent() { return true },
    vault,
  }
  const bridge: DesktopCallerBridge = {
    async authorize() { return { authorization: 'popout-new' } },
    async cancelDispatch() {},
    async completeDispatch(value) { completions.push(value); return 'handled' },
    async nextDispatch() {
      if (!next) return null
      next = false
      return { deliveryId: 'delivery-new', kind: 'protocol', operationId: 'dispatch-new', request: { action: 'new', file: 'Folder/New.md', paneType: 'window' } }
    },
  }
  const remote = { tocktutorDesktop: {
    async openPopOut(_authorization: string, path: string) { opened.push(path); return { ok: true, value: { status: 'opened' } } },
  } } as unknown as DesktopActionRemote

  await runDesktopDispatchLoop({ bridge, owner: () => currentOwner, remote })

  assert.deepEqual(opened, ['Folder/New.md'])
  assert.deepEqual(completions, [{ deliveryId: 'delivery-new', operationId: 'dispatch-new', status: 'handled' }])
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
    async authorize(operation, expectedVault) {
      calls.push({ method: 'authorize', value: { expectedVault, operation } })
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
    async saveCurrent() {
      calls.push({ method: 'saveCurrent', value: true })
      return true
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
    { method: 'saveCurrent', value: true },
    { method: 'authorize', value: { expectedVault: undefined, operation: 'activate-vault' } },
    { method: 'activateVault', value: 'activate-vault-authorization' },
    {
      method: 'completeDispatch',
      value: { deliveryId: 'delivery-2', operationId: 'dispatch-2', status: 'handled' },
    },
    { method: 'saveCurrent', value: true },
    { method: 'authorize', value: { expectedVault: vault, operation: 'popout-open' } },
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
