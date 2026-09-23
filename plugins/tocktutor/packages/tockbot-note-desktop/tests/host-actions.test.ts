import assert from 'node:assert/strict'
import test from 'node:test'
import { Context } from '@deepseek-ai/cordis'
import { remoteMethods } from '@deepseek-ai/dsh-typert-protocol'
import { buildMarkdownExportDocument } from '@tockteam/tocktutor-workbench'
import { MAX_TRACKED_POPOUTS, TockTutorDesktopGateway } from '../dist/host-actions.js'

const vault = Object.freeze({ generation: 7, id: `vault:${'a'.repeat(64)}` })
const nextVault = Object.freeze({ generation: 8, id: `vault:${'b'.repeat(64)}` })
const managedVault = Object.freeze({ generation: 8, id: vault.id })
const identity = Object.freeze({
  operationId: 'operation-1',
  requestId: 'request-1',
  sessionId: 'session-1',
  vaultGeneration: vault.generation,
  vaultId: vault.id,
  windowId: 'window-1',
})

type Call = { method: string; parameters: unknown[] }
type VaultState = { active: false; generation: number } | { active: true; generation: number; id: string }

async function loaded(documents: Record<string, string> = {}): Promise<{
  abortAfterClaim(controller: AbortController): void
  calls: Call[]
  context: Context
  gateway: TockTutorDesktopGateway
  driftAfterMove(value: VaultState): void
  driftAfterReveal(value: VaultState): void
  failSynchronizationOn(call: number): void
  setState(value: VaultState): void
  syncCalls(): number
}> {
  const calls: Call[] = []
  let abortingController: AbortController | undefined
  let desktopSyncCalls = 0
  let failSynchronizationAt = 0
  let stateAfterMove: VaultState | undefined
  let stateAfterReveal: VaultState | undefined
  let state: VaultState = {
    active: true,
    ...vault,
  }
  const context = new Context()
  await context.plugin({
    name: 'native-owner-fixture',
    apply(ctx) {
      ctx.provide('tockTeamDesktopCaller', {
        async claim(...parameters: unknown[]) {
          calls.push({ method: 'claim', parameters })
          abortingController?.abort()
          return identity
        },
      })
      ctx.provide('noteVault', {
        get state() { return state },
        async synchronizeDesktopSelection() {
          desktopSyncCalls += 1
          if (desktopSyncCalls === failSynchronizationAt) throw new Error('synchronization unavailable')
          return state
        },
        async activateDesktopSelection(...parameters: unknown[]) {
          calls.push({ method: 'activateDesktopSelection', parameters })
          state = { active: true, ...nextVault }
          return {
            operationId: identity.operationId,
            status: 'activated',
            vaultGeneration: nextVault.generation,
            vaultId: nextVault.id,
          }
        },
        activateRecentVault(id: string, expectedGeneration: number) {
          calls.push({ method: 'activateRecentVault', parameters: [id, expectedGeneration] })
          if (id !== nextVault.id || expectedGeneration !== vault.generation) throw new Error('unexpected target')
          state = { active: true, ...nextVault }
          return state
        },
        async openEntry(...parameters: unknown[]) {
          calls.push({ method: 'openEntry', parameters })
          return { generation: vault.generation, path: 'Folder/Note.md', status: 'opened' }
        },
        async copyEntryPath(...parameters: unknown[]) {
          calls.push({ method: 'copyEntryPath', parameters })
          return { generation: vault.generation, path: 'Folder/Note.md', status: 'copied' }
        },
        async revealEntry(...parameters: unknown[]) {
          calls.push({ method: 'revealEntry', parameters })
          if (stateAfterReveal !== undefined) state = stateAfterReveal
          return { generation: vault.generation, path: 'Folder/Note.md', status: 'revealed' }
        },
        async revealVault(...parameters: unknown[]) {
          calls.push({ method: 'revealVault', parameters })
          return { generation: vault.generation, status: 'revealed' }
        },
        renameVault(...parameters: unknown[]) {
          calls.push({ method: 'renameVault', parameters })
          state = { active: true, ...managedVault }
          return state
        },
        async moveDesktopSelection(...parameters: unknown[]) {
          calls.push({ method: 'moveDesktopSelection', parameters })
          state = stateAfterMove ?? { active: true, ...managedVault }
          return { operationId: identity.operationId, status: 'moved', vaultGeneration: managedVault.generation, vaultId: managedVault.id }
        },
        removeVault(...parameters: unknown[]) {
          calls.push({ method: 'removeVault', parameters })
          state = { active: false, generation: managedVault.generation }
          return state
        },
        async openDocument(...parameters: unknown[]) {
          calls.push({ method: 'openDocument', parameters })
          const path = String(parameters[0])
          const content = documents[path] ?? (path === 'Folder/Embedded.md'
            ? '# Export\n![[Attachments/image.png]]\n![[Second.md#Part]]\n![[Board.canvas]]\n'
            : path === 'Second.md' ? '# Part\nSafe <script>alert(1)</script>\n# Next\n'
              : path === 'Board.canvas' ? '{"nodes":[]}' : '# Exact & <source>\n')
          return {
            content,
            digest: `sha256:${'c'.repeat(64)}`,
            generation: vault.generation,
            path,
            revision: `file:${'d'.repeat(64)}`,
          }
        },
        async listTree(...parameters: unknown[]) {
          calls.push({ method: 'listTree', parameters })
          return {
            complete: true,
            cursor: null,
            entries: [
              ...Object.keys(documents).map(path => ({ kind: 'document', path })),
              { createdAt: 1, kind: 'document', modifiedAt: 1, path: 'Folder/Embedded.md', revision: 'file:embedded', size: 80 },
              { createdAt: 1, kind: 'attachment', mediaKind: 'image', modifiedAt: 1, path: 'Attachments/image.png', revision: 'file:image', size: 3 },
              { createdAt: 1, kind: 'document', modifiedAt: 1, path: 'Second.md', revision: 'file:second', size: 64 },
              { createdAt: 1, kind: 'document', modifiedAt: 1, path: 'Board.canvas', revision: 'file:canvas', size: 12 },
            ],
            generation: vault.generation,
            scan: { entries: 4 },
            truncated: false,
            truncationReason: null,
            warnings: [],
          }
        },
        async previewAttachment(...parameters: unknown[]) {
          calls.push({ method: 'previewAttachment', parameters })
          return {
            data: Uint8Array.from([1, 2, 3]),
            digest: `sha256:${'e'.repeat(64)}`,
            generation: vault.generation,
            mediaKind: 'image',
            mimeType: 'image/png',
            path: String(parameters[0]),
            revision: 'file:image',
            size: 3,
          }
        },
      } as never)
      ctx.provide('tockTeamDesktopPicker', {
        async pick(...parameters: unknown[]) {
          calls.push({ method: 'pick', parameters })
          return {
            authorization: 'selection-authorization',
            label: 'Selected Vault',
            operationId: identity.operationId,
            status: 'selected',
          }
        },
      })
      ctx.provide('tockTeamDesktopPopOut', {
        async open(...parameters: unknown[]) {
          calls.push({ method: 'popOut.open', parameters })
          return { operationId: identity.operationId, status: 'opened', windowId: 'popout-1' }
        },
        async close(...parameters: unknown[]) {
          calls.push({ method: 'popOut.close', parameters })
          return { operationId: identity.operationId, status: 'closed' }
        },
        async closeAll(...parameters: unknown[]) {
          calls.push({ method: 'popOut.closeAll', parameters })
          return { operationId: identity.operationId, status: 'closed' }
        },
      })
      ctx.provide('tockTeamDesktopMicrophone', {
        async request(...parameters: unknown[]) {
          calls.push({ method: 'microphone.request', parameters })
          return { operationId: identity.operationId, status: 'granted' }
        },
      })
      ctx.provide('tockTeamDesktopPrintExport', {
        async render(...parameters: unknown[]) {
          calls.push({ method: 'printExport.render', parameters })
          const request = parameters[0] as { format: string }
          return {
            operationId: identity.operationId,
            status: request.format === 'print' ? 'printed' : 'exported',
          }
        },
      })
    },
  })
  await context.plugin(TockTutorDesktopGateway)
  const gateway = context.get('tocktutorDesktop') as TockTutorDesktopGateway
  assert.ok(gateway instanceof TockTutorDesktopGateway)
  return {
    abortAfterClaim(controller) { abortingController = controller },
    calls,
    context,
    gateway,
    driftAfterMove(value) { stateAfterMove = value },
    driftAfterReveal(value) { stateAfterReveal = value },
    failSynchronizationOn(call) { failSynchronizationAt = call },
    setState(value) { state = value },
    syncCalls() { return desktopSyncCalls },
  }
}

function publicCalls(calls: Call[]): Array<{ method: string; value: unknown }> {
  return calls.map(call => ({ method: call.method, value: call.parameters[0] }))
}

function assertSharedSignal(calls: Call[]): void {
  const ownerSignal = calls[0]!.parameters[1]
  assert.ok(ownerSignal instanceof AbortSignal)
  for (const call of calls) assert.strictEqual(call.parameters.at(-1), ownerSignal)
}

test('publishes only the bounded native action Remote methods', async () => {
  const state = await loaded()
  try {
    assert.deepEqual(remoteMethods(state.gateway), [
      { invocation: { kind: 'direct' }, method: 'activateVault' },
      { invocation: { kind: 'direct' }, method: 'activateVaultTarget' },
      { invocation: { kind: 'direct' }, method: 'openPopOut' },
      { invocation: { kind: 'direct' }, method: 'closePopOut' },
      { invocation: { kind: 'direct' }, method: 'closeAllPopOuts' },
      { invocation: { kind: 'direct' }, method: 'printNote' },
      { invocation: { kind: 'direct' }, method: 'exportNote' },
      { invocation: { kind: 'direct' }, method: 'requestMicrophone' },
      { invocation: { kind: 'direct' }, method: 'openInDefaultApp' },
      { invocation: { kind: 'direct' }, method: 'copyAbsolutePath' },
      { invocation: { kind: 'direct' }, method: 'revealEntry' },
      { invocation: { kind: 'direct' }, method: 'revealVault' },
      { invocation: { kind: 'direct' }, method: 'renameVault' },
      { invocation: { kind: 'direct' }, method: 'moveVault' },
      { invocation: { kind: 'direct' }, method: 'removeVault' },
    ])
  } finally {
    await state.context.fiber.dispose()
  }
})

test('opens only the caller-authorized document and recovers a lost response without another open', async () => {
  const state = await loaded()
  try {
    const signal = new AbortController().signal
    assert.deepEqual(await state.gateway.openInDefaultApp('authorization-1', 'Folder/Note.md', vault, signal), { status: 'opened' })
    assert.deepEqual(publicCalls(state.calls), [
      { method: 'claim', value: { authorization: 'authorization-1', operation: 'open-default-app' } },
      { method: 'openEntry', value: { expectedVault: vault, path: 'Folder/Note.md', operationId: identity.operationId } },
    ])
    assertSharedSignal(state.calls)
    assert.deepEqual(await state.gateway.openInDefaultApp('authorization-1', 'Folder/Note.md', vault, signal), { status: 'opened' })
    await assert.rejects(state.gateway.openInDefaultApp('authorization-1', 'Other.md', vault, signal))
    await assert.rejects(state.gateway.openInDefaultApp('authorization-2', '../Note.md', vault, signal))
    assert.equal(state.calls.filter(call => call.method === 'openEntry').length, 1)
  } finally { await state.context.fiber.dispose() }
})

test('copies an active vault entry only after caller authorization', async () => {
  const state = await loaded()
  try {
    const signal = new AbortController().signal
    assert.deepEqual(
      await state.gateway.copyAbsolutePath('authorization-1', 'Folder/Note.md', vault, signal),
      { status: 'copied' },
    )
    assert.deepEqual(publicCalls(state.calls), [
      {
        method: 'claim',
        value: { authorization: 'authorization-1', operation: 'copy-absolute-path' },
      },
      {
        method: 'copyEntryPath',
        value: { expectedVault: vault, path: 'Folder/Note.md', operationId: identity.operationId },
      },
    ])
    assertSharedSignal(state.calls)
    await assert.rejects(state.gateway.copyAbsolutePath('authorization-2', '../Note.md', vault, signal))
    assert.equal(state.calls.length, 2)
  } finally {
    await state.context.fiber.dispose()
  }
})

test('reveals an active vault entry only after caller authorization', async () => {
  const state = await loaded()
  try {
    const signal = new AbortController().signal
    assert.deepEqual(
      await state.gateway.revealEntry('authorization-1', 'Folder/Note.md', vault, signal),
      { status: 'revealed' },
    )
    assert.deepEqual(publicCalls(state.calls), [
      {
        method: 'claim',
        value: { authorization: 'authorization-1', operation: 'reveal-entry' },
      },
      {
        method: 'revealEntry',
        value: { expectedVault: vault, path: 'Folder/Note.md' },
      },
    ])
    assertSharedSignal(state.calls)
  } finally {
    await state.context.fiber.dispose()
  }
})

test('manages the active vault only after exact caller and picker authorization', async () => {
  const state = await loaded()
  try {
    const signal = new AbortController().signal
    assert.deepEqual(await state.gateway.revealVault('reveal-authorization', vault, signal), { status: 'revealed' })
    assert.deepEqual(await state.gateway.renameVault('rename-authorization', 'Research', vault, signal), { status: 'renamed' })
    assert.deepEqual(await state.gateway.renameVault('rename-authorization', 'Research', vault, signal), { status: 'renamed' })
    state.setState({ active: true, ...vault })
    assert.deepEqual(await state.gateway.moveVault('move-authorization', vault, signal), { status: 'moved' })
    assert.deepEqual(await state.gateway.moveVault('move-authorization', vault, signal), { status: 'moved' })
    state.setState({ active: true, ...vault })
    assert.deepEqual(await state.gateway.removeVault('remove-authorization', vault, signal), { status: 'closed' })
    assert.deepEqual(await state.gateway.removeVault('remove-authorization', vault, signal), { status: 'closed' })
    assert.deepEqual(publicCalls(state.calls), [
      { method: 'claim', value: { authorization: 'reveal-authorization', operation: 'reveal-vault' } },
      { method: 'revealVault', value: vault },
      { method: 'claim', value: { authorization: 'rename-authorization', operation: 'rename-vault' } },
      { method: 'renameVault', value: 'Research' },
      { method: 'claim', value: { authorization: 'move-authorization', operation: 'move-vault' } },
      { method: 'pick', value: { identity, kind: 'vault', purpose: 'move' } },
      {
        method: 'moveDesktopSelection',
        value: { authorization: 'selection-authorization', expectedVault: vault, identity },
      },
      { method: 'claim', value: { authorization: 'remove-authorization', operation: 'remove-vault' } },
      { method: 'removeVault', value: vault },
    ])
    assert.equal(state.syncCalls(), 6)
  } finally {
    await state.context.fiber.dispose()
  }
})

test('cancellation after authorization prevents irreversible vault mutations', async () => {
  for (const operation of ['rename', 'remove'] as const) {
    const state = await loaded()
    try {
      const controller = new AbortController()
      state.abortAfterClaim(controller)
      const action = operation === 'rename'
        ? state.gateway.renameVault(`${operation}-abort`, 'Research', vault, controller.signal)
        : state.gateway.removeVault(`${operation}-abort`, vault, controller.signal)
      await assert.rejects(action, { name: 'AbortError' })
      assert.equal(state.calls.some(call => call.method === `${operation}Vault`), false)
    } finally {
      await state.context.fiber.dispose()
    }
  }
})

test('reports a committed vault mutation when Desktop rebinding is briefly unavailable', async () => {
  const state = await loaded()
  try {
    state.failSynchronizationOn(2)
    const signal = new AbortController().signal
    assert.deepEqual(await state.gateway.renameVault('rename-rebind-authorization', 'Research', vault, signal), { status: 'renamed' })
    assert.deepEqual(await state.gateway.renameVault('rename-rebind-authorization', 'Research', vault, signal), { status: 'renamed' })
    assert.equal(state.calls.filter(call => call.method === 'renameVault').length, 1)
  } finally {
    await state.context.fiber.dispose()
  }
})

test('remembers a committed move when an activation observer switches the current vault', async () => {
  const state = await loaded()
  try {
    state.driftAfterMove({ active: true, ...nextVault })
    const signal = new AbortController().signal
    assert.deepEqual(await state.gateway.moveVault('reentrant-move', vault, signal), { status: 'moved' })
    assert.deepEqual(await state.gateway.moveVault('reentrant-move', vault, signal), { status: 'moved' })
    assert.equal(state.calls.filter(call => call.method === 'moveDesktopSelection').length, 1)
  } finally {
    await state.context.fiber.dispose()
  }
})

test('recovers a revealed result without repeating the native reveal effect', async () => {
  const state = await loaded()
  try {
    const signal = new AbortController().signal
    await state.gateway.revealEntry('same-authorization', 'Folder/Note.md', vault, signal)
    await state.gateway.revealEntry('same-authorization', 'Folder/Note.md', vault, signal)
    assert.deepEqual(state.calls.map(call => call.method), ['claim', 'revealEntry', 'claim'])
  } finally {
    await state.context.fiber.dispose()
  }
})

test('rejects malformed, stale, and late vault state before another native owner call', async () => {
  const state = await loaded()
  try {
    const signal = new AbortController().signal
    for (const path of ['../escape.md', 'C:escape.md', 'Folder/Line\nBreak.md']) {
      await assert.rejects(
        state.gateway.revealEntry('authorization', path, vault, signal),
        /vault-relative/u,
      )
    }
    await assert.rejects(
      state.gateway.revealEntry('authorization', 'Folder/Note.md', { ...vault, id: 'forged' }, signal),
      /identify one active vault/u,
    )
    assert.equal(state.calls.length, 0)

    state.setState({ active: true, ...nextVault })
    await assert.rejects(
      state.gateway.revealEntry('authorization', 'Folder/Note.md', nextVault, signal),
      /authorization is stale/u,
    )
    assert.deepEqual(publicCalls(state.calls), [
      { method: 'claim', value: { authorization: 'authorization', operation: 'reveal-entry' } },
    ])

    state.calls.length = 0
    state.setState({ active: true, ...vault })
    state.driftAfterReveal({ active: true, ...nextVault })
    await assert.rejects(
      state.gateway.revealEntry('authorization', 'Folder/Note.md', vault, signal),
      /active vault changed/u,
    )
    assert.deepEqual(state.calls.map(call => call.method), ['claim', 'revealEntry'])
  } finally {
    await state.context.fiber.dispose()
  }
})

test('activates only the vault selected by the authorized Desktop owner', async () => {
  const state = await loaded()
  try {
    const signal = new AbortController().signal
    assert.deepEqual(await state.gateway.activateVault('authorization-2', signal), { status: 'activated' })
    assert.deepEqual(publicCalls(state.calls), [
      {
        method: 'claim',
        value: { authorization: 'authorization-2', operation: 'activate-vault' },
      },
      {
        method: 'pick',
        value: { identity, kind: 'vault', purpose: 'activate' },
      },
      {
        method: 'activateDesktopSelection',
        value: { authorization: 'selection-authorization', identity },
      },
    ])
    assertSharedSignal(state.calls)
  } finally {
    await state.context.fiber.dispose()
  }
})

test('recovers an activated result without reopening the vault picker', async () => {
  const state = await loaded()
  try {
    const signal = new AbortController().signal
    assert.deepEqual(await state.gateway.activateVault('same-authorization', signal), { status: 'activated' })
    assert.deepEqual(await state.gateway.activateVault('same-authorization', signal), { status: 'activated' })
    assert.deepEqual(state.calls.map(call => call.method), [
      'claim',
      'pick',
      'activateDesktopSelection',
      'claim',
    ])
  } finally {
    await state.context.fiber.dispose()
  }
})

test('opens and closes only the active caller-bound note pop-out', async () => {
  const state = await loaded()
  try {
    const signal = new AbortController().signal
    assert.deepEqual(
      await state.gateway.openPopOut('authorization-open', 'Folder/Note.md', vault, signal),
      { status: 'opened' },
    )
    assert.deepEqual(
      await state.gateway.openPopOut('authorization-open', 'Folder/Note.md', vault, signal),
      { status: 'opened' },
    )
    assert.deepEqual(
      await state.gateway.closePopOut('authorization-close', 'Folder/Note.md', vault, signal),
      { status: 'closed' },
    )
    assert.deepEqual(
      await state.gateway.closePopOut('authorization-close', 'Folder/Note.md', vault, signal),
      { status: 'closed' },
    )
    assert.equal(state.syncCalls(), 4)
    assert.deepEqual(publicCalls(state.calls), [
      {
        method: 'claim',
        value: { authorization: 'authorization-open', operation: 'popout-open' },
      },
      {
        method: 'popOut.open',
        value: { identity, relativePath: 'Folder/Note.md' },
      },
      {
        method: 'claim',
        value: { authorization: 'authorization-open', operation: 'popout-open' },
      },
      {
        method: 'claim',
        value: { authorization: 'authorization-close', operation: 'popout-close' },
      },
      {
        method: 'popOut.close',
        value: { identity, windowId: 'popout-1' },
      },
      {
        method: 'claim',
        value: { authorization: 'authorization-close', operation: 'popout-close' },
      },
    ])
  } finally {
    await state.context.fiber.dispose()
  }
})

test('bounds tracked pop-outs before another native window call', async () => {
  const state = await loaded()
  try {
    const signal = new AbortController().signal
    for (let index = 0; index < MAX_TRACKED_POPOUTS; index += 1) {
      await state.gateway.openPopOut(
        `authorization-${String(index)}`,
        `Folder/Note-${String(index)}.md`,
        vault,
        signal,
      )
    }
    state.calls.length = 0
    assert.deepEqual(
      await state.gateway.openPopOut('authorization-overflow', 'Folder/Overflow.md', vault, signal),
      { status: 'denied' },
    )
    assert.deepEqual(state.calls.map(call => call.method), ['claim'])
  } finally {
    await state.context.fiber.dispose()
  }
})

test('closes an opened pop-out when the adapter lifecycle unloads', async () => {
  const state = await loaded()
  const signal = new AbortController().signal
  await state.gateway.openPopOut('authorization-open', 'Folder/Note.md', vault, signal)
  state.calls.length = 0

  await state.context.fiber.dispose()

  assert.deepEqual(publicCalls(state.calls), [
    { method: 'popOut.close', value: { identity, windowId: 'popout-1' } },
  ])
  assert.ok(state.calls[0]!.parameters[1] instanceof AbortSignal)
})

test('closes all caller-bound pop-outs for the active vault', async () => {
  const state = await loaded()
  try {
    const signal = new AbortController().signal
    await state.gateway.openPopOut('authorization-open', 'Folder/Note.md', vault, signal)
    state.calls.length = 0
    assert.deepEqual(
      await state.gateway.closeAllPopOuts('authorization-close-all', vault, signal),
      { status: 'closed' },
    )
    assert.deepEqual(publicCalls(state.calls), [
      {
        method: 'claim',
        value: { authorization: 'authorization-close-all', operation: 'popout-close-all' },
      },
      { method: 'popOut.closeAll', value: { identity } },
    ])
  } finally {
    await state.context.fiber.dispose()
  }
})

test('activates a named recent target through Runtime and resynchronizes Desktop ownership', async () => {
  const state = await loaded()
  try {
    assert.deepEqual(await state.gateway.activateVaultTarget('authorization-target', nextVault, new AbortController().signal), { status: 'activated' })
    assert.deepEqual(state.calls.map(call => call.method), ['claim', 'activateRecentVault'])
    assert.equal(state.syncCalls(), 1)
  } finally {
    await state.context.fiber.dispose()
  }
})

test('requests microphone permission only for the authorized active vault', async () => {
  const state = await loaded()
  try {
    const signal = new AbortController().signal
    assert.deepEqual(
      await state.gateway.requestMicrophone('authorization-microphone', vault, signal),
      { status: 'granted' },
    )
    assert.deepEqual(publicCalls(state.calls), [
      {
        method: 'claim',
        value: { authorization: 'authorization-microphone', operation: 'microphone' },
      },
      { method: 'microphone.request', value: { identity } },
    ])
    assertSharedSignal(state.calls)
  } finally {
    await state.context.fiber.dispose()
  }
})

test('recovers microphone and export results without repeating native effects', async () => {
  const state = await loaded()
  try {
    const signal = new AbortController().signal
    await state.gateway.requestMicrophone('same-microphone', vault, signal)
    await state.gateway.requestMicrophone('same-microphone', vault, signal)
    await state.gateway.exportNote('same-export', 'pdf', 'Folder/Note.md', vault, signal)
    await state.gateway.exportNote('same-export', 'pdf', 'Folder/Note.md', vault, signal)
    assert.deepEqual(state.calls.map(call => call.method), [
      'claim',
      'microphone.request',
      'claim',
      'claim',
      'openDocument',
      'pick',
      'printExport.render',
      'claim',
    ])
  } finally {
    await state.context.fiber.dispose()
  }
})

test('native print and export resolve relative nested embeds with cycle and depth bounds', async () => {
  const state = await loaded({
    'Folder/Root.md': '# Root\n![[./Child.md#Include]]\n',
    'Folder/Child.md': '# Include\nNested child\n![[./Deep.md]]\n# Exclude\nExcluded section\n',
    'Folder/Deep.md': 'Deep proof\n![[../Attachments/image.png]]\n![[./Child.md#Include]]\n![[./Depth.md]]',
    'Folder/Depth.md': 'Allowed intermediate depth\n![[./BeforeBeyond.md]]',
    'Folder/BeforeBeyond.md': 'Last allowed depth\n![[./Beyond.md]]',
    'Folder/Beyond.md': 'Beyond depth must not render',
  })
  try {
    for (const format of ['print', 'html', 'pdf'] as const) {
      const signal = new AbortController().signal
      if (format === 'print') await state.gateway.printNote('nested-print', 'Folder/Root.md', vault, signal)
      else await state.gateway.exportNote(`nested-${format}`, format, 'Folder/Root.md', vault, signal)
    }
    const requests = state.calls.filter(call => call.method === 'printExport.render')
    assert.equal(requests.length, 3)
    for (const request of requests) {
      const { html } = request.parameters[0] as { html: string }
      assert.match(html, /Nested child/u)
      assert.match(html, /Deep proof/u)
      assert.match(html, /data:image\/png;base64,AQID/u)
      assert.match(html, /Last allowed depth/u)
      assert.doesNotMatch(html, /Excluded section|Beyond depth must not render/u)
      assert.ok(html.length < 20_000)
    }
    assert.equal(state.calls.filter(call => call.method === 'openDocument' && call.parameters[0] === 'Folder/Beyond.md').length, 0)
  } finally {
    await state.context.fiber.dispose()
  }
})

test('nested export preserves the combined read budget', async () => {
  const documents = Object.fromEntries(Array.from({ length: 5 }, (_, i) => [`Part${i}.md`, 'x'.repeat(1_600_000)]))
  const state = await loaded({ 'Root.md': Object.keys(documents).map(path => `![[${path}]]`).join('\n'), ...documents })
  try {
    await state.gateway.printNote('bounded-export', 'Root.md', vault, new AbortController().signal)
    assert.equal(state.calls.filter(call => call.method === 'openDocument' && call.parameters[0] === 'Part4.md').length, 0)
    const request = state.calls.find(call => call.method === 'printExport.render')!.parameters[0] as { html: string }
    assert.ok(request.html.length < 6_000_000)
  } finally { await state.context.fiber.dispose() }
})

test('nested export never renders after stale document replies, vault changes, or cancellation', async () => {
  for (const failure of ['reply', 'vault', 'abort'] as const) {
    const state = await loaded({ 'Root.md': '![[./Child.md]]', 'Child.md': 'Child' })
    const controller = new AbortController()
    const runtime = state.context.noteVault
    const open = runtime.openDocument.bind(runtime)
    runtime.openDocument = async (...args) => {
      const result = await open(...args)
      if (args[0] === 'Child.md') {
        if (failure === 'reply') return { ...result, generation: vault.generation + 1 }
        if (failure === 'vault') state.setState({ active: true, ...nextVault })
        if (failure === 'abort') controller.abort()
      }
      return result
    }
    try {
      await assert.rejects(state.gateway.printNote(`stale-${failure}`, 'Root.md', vault, controller.signal))
      assert.equal(state.calls.some(call => call.method === 'printExport.render'), false)
    } finally { await state.context.fiber.dispose() }
  }
})

test('resolves bounded note, image, and Canvas embeds into static HTML and PDF input', async () => {
  const state = await loaded()
  try {
    const signal = new AbortController().signal
    assert.deepEqual(
      await state.gateway.exportNote('authorization-embeds', 'pdf', 'Folder/Embedded.md', vault, signal),
      { status: 'exported' },
    )
    const request = state.calls.find(call => call.method === 'printExport.render')?.parameters[0] as { format: string; html: string }
    assert.equal(request.format, 'pdf')
    assert.match(request.html, /aria-label="Resolved Embeds"/u)
    assert.match(request.html, /data:image\/png;base64,AQID/u)
    assert.match(request.html, /<p>Safe<\/p>/u)
    assert.match(request.html, /<pre>\{&quot;nodes&quot;:\[\]\}<\/pre>/u)
    assert.doesNotMatch(request.html, /<script|href=/u)
    assert.deepEqual(state.calls.map(call => call.method), [
      'claim', 'openDocument', 'pick', 'listTree', 'previewAttachment', 'openDocument', 'openDocument', 'printExport.render',
    ])
  } finally {
    await state.context.fiber.dispose()
  }
})

test('prints and exports a freshly read bounded note without exposing destination authority', async () => {
  const state = await loaded()
  try {
    const signal = new AbortController().signal
    assert.deepEqual(
      await state.gateway.printNote('authorization-print', 'Folder/Note.md', vault, signal),
      { status: 'printed' },
    )
    assert.deepEqual(
      await state.gateway.exportNote('authorization-export', 'html', 'Folder/Note.md', vault, signal),
      { status: 'exported' },
    )
    const html = buildMarkdownExportDocument({ markdown: '# Exact & <source>\n', title: 'Folder/Note.md' })
    assert.deepEqual(publicCalls(state.calls), [
      { method: 'claim', value: { authorization: 'authorization-print', operation: 'print' } },
      { method: 'openDocument', value: 'Folder/Note.md' },
      {
        method: 'printExport.render',
        value: { format: 'print', html, identity, title: 'Folder/Note.md' },
      },
      {
        method: 'claim',
        value: { authorization: 'authorization-export', operation: 'export-html' },
      },
      { method: 'openDocument', value: 'Folder/Note.md' },
      {
        method: 'pick',
        value: { identity, kind: 'destination', purpose: 'export-html' },
      },
      {
        method: 'printExport.render',
        value: {
          authorization: 'selection-authorization',
          format: 'html',
          html,
          identity,
          purpose: 'export-html',
          title: 'Folder/Note.md',
        },
      },
    ])
  } finally {
    await state.context.fiber.dispose()
  }
})
