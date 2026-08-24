import assert from 'node:assert/strict'
import test from 'node:test'
import { Context } from '@deepseek-ai/cordis'
import { remoteMethods } from '@deepseek-ai/dsh-typert-protocol'
import { MAX_TRACKED_POPOUTS, TockTutorDesktopGateway } from '../dist/host-actions.js'

const vault = Object.freeze({ generation: 7, id: `vault:${'a'.repeat(64)}` })
const nextVault = Object.freeze({ generation: 8, id: `vault:${'b'.repeat(64)}` })
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

async function loaded(): Promise<{
  calls: Call[]
  context: Context
  gateway: TockTutorDesktopGateway
  driftAfterReveal(value: VaultState): void
  setState(value: VaultState): void
}> {
  const calls: Call[] = []
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
          return identity
        },
      })
      ctx.provide('noteVault', {
        get state() { return state },
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
        async revealEntry(...parameters: unknown[]) {
          calls.push({ method: 'revealEntry', parameters })
          if (stateAfterReveal !== undefined) state = stateAfterReveal
          return { generation: vault.generation, path: 'Folder/Note.md', status: 'revealed' }
        },
        async openDocument(...parameters: unknown[]) {
          calls.push({ method: 'openDocument', parameters })
          return {
            content: '# Exact & <source>\n',
            digest: `sha256:${'c'.repeat(64)}`,
            generation: vault.generation,
            path: 'Folder/Note.md',
            revision: `file:${'d'.repeat(64)}`,
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
    calls,
    context,
    gateway,
    driftAfterReveal(value) { stateAfterReveal = value },
    setState(value) { state = value },
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
      { invocation: { kind: 'direct' }, method: 'openPopOut' },
      { invocation: { kind: 'direct' }, method: 'closePopOut' },
      { invocation: { kind: 'direct' }, method: 'closeAllPopOuts' },
      { invocation: { kind: 'direct' }, method: 'printNote' },
      { invocation: { kind: 'direct' }, method: 'exportNote' },
      { invocation: { kind: 'direct' }, method: 'requestMicrophone' },
      { invocation: { kind: 'direct' }, method: 'revealEntry' },
    ])
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
    const html = '<!doctype html><meta charset="utf-8"><title>Folder/Note.md</title><pre># Exact &amp; &lt;source&gt;\n</pre>'
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
