import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rename, rm, writeFile, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import Include from '@deepseek-ai/cordis-plugin-include'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import NoteVaultRuntime from 'tockbot-note-runtime'
import { DesktopPickerChannel } from '../src/desktop-picker-channel.ts'
import { DesktopPickerOwner } from '../src/desktop-picker-owner.ts'
import { DesktopPickerProvider, DesktopVaultSelectionProvider } from '../src/desktop-picker-provider.ts'

async function canonicalTemp(prefix: string): Promise<string> {
  return await realpath(await mkdtemp(join(tmpdir(), prefix)))
}

async function loadRuntime(): Promise<{ context: Context; root: string }> {
  const root = await canonicalTemp('tockteam-picker-runtime-')
  const configPath = join(root, 'cordis.yml')
  await writeFile(configPath, [
    "- name: 'tockbot-note-runtime'",
    '  config:',
    '    stateRoot: null',
    '    vaultRoot: null',
    '',
  ].join('\n'))
  const context = new Context()
  context.baseUrl = pathToFileURL(root).href + '/'
  await context.plugin(Loader)
  context.loader.builtins.include = Include
  context.loader.internal = {
    version: 'v2',
    async import(specifier: string) {
      if (specifier !== 'tockbot-note-runtime') throw new Error(`unexpected import: ${specifier}`)
      return NoteVaultRuntime
    },
  } as unknown as NonNullable<typeof context.loader.internal>
  await context.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(configPath).href } })
  await context.loader.await()
  return { context, root }
}

test('Runtime 0.1.2 activates a Desktop selection through consume-bind authority without public paths', async () => {
  const vault = await canonicalTemp('tockteam-selected-vault-')
  const source = await canonicalTemp('tockteam-external-source-')
  await writeFile(join(vault, 'vault.md'), 'vault')
  await writeFile(join(source, 'source.md'), 'source')
  const owner = new DesktopPickerOwner({
    isAvailable: () => true,
    showOpenDialog: async options => ({
      canceled: false,
      filePath: options.purpose === 'activate' ? vault : source,
    }),
    showSaveDialog: async () => ({ canceled: true }),
  })
  const channel = new DesktopPickerChannel(owner)
  const environment = await channel.start()
  const loaded = await loadRuntime()
  const picker = new DesktopPickerProvider(environment, fetch, () => loaded.context.noteVault.state)
  const vaultProvider = new DesktopVaultSelectionProvider(loaded.context, environment)
  loaded.context.on('note-vault/change', () => { throw new Error('synthetic observer failure') })
  let runtimeDisposed = false
  try {
    const identity = {
      operationId: 'activate-operation',
      requestId: 'activate-request',
      sessionId: 'activate-session',
      vaultGeneration: 0,
      vaultId: null,
      windowId: 'activate-window',
    }
    const selected = await picker.pick({ identity, kind: 'vault', purpose: 'activate' }, new AbortController().signal)
    assert.equal(selected.status, 'selected')
    if (selected.status !== 'selected') return
    const activated = await loaded.context.noteVault.activateDesktopSelection({
      authorization: selected.authorization,
      identity,
    }, new AbortController().signal)
    assert.equal(activated.status, 'activated')
    assert.equal(JSON.stringify(activated).includes(vault), false)
    assert.equal(JSON.stringify(activated).includes(selected.authorization), false)

    const sourceIdentity = {
      ...identity,
      operationId: 'source-operation',
      requestId: 'source-request',
      vaultGeneration: activated.vaultGeneration,
      vaultId: activated.vaultId,
    }
    const sourceSelection = await picker.pick({ identity: sourceIdentity, kind: 'source', purpose: 'markdown-folder' }, new AbortController().signal)
    assert.equal(sourceSelection.status, 'selected')
    assert.equal(JSON.stringify(sourceSelection).includes(source), false)

    await loaded.context.fiber.dispose()
    runtimeDisposed = true
    assert.deepEqual(
      await owner.pick({ identity: { ...sourceIdentity, operationId: 'after-unload', requestId: 'after-unload' }, kind: 'source', purpose: 'markdown-folder' }, new AbortController().signal),
      { operationId: 'after-unload', status: 'stale' },
    )
  } finally {
    if (!runtimeDisposed) await loaded.context.fiber.dispose()
    await vaultProvider.close()
    await picker.dispose()
    await channel.stop()
    await rm(loaded.root, { recursive: true, force: true })
    await rm(vault, { recursive: true, force: true })
    await rm(source, { recursive: true, force: true })
  }
})

test('runtime-authorized managed or recent vault adopts the exact main identity over the authenticated channel', async () => {
  const vault = await canonicalTemp('tockteam-runtime-adopt-vault-')
  const source = await canonicalTemp('tockteam-runtime-adopt-source-')
  const owner = new DesktopPickerOwner({
    isAvailable: () => true,
    showOpenDialog: async () => ({ canceled: false, filePath: source }),
    showSaveDialog: async () => ({ canceled: true }),
  })
  const channel = new DesktopPickerChannel(owner)
  const environment = await channel.start()
  const loaded = await loadRuntime()
  const picker = new DesktopPickerProvider(environment, fetch, () => loaded.context.noteVault.state)
  const vaultProvider = new DesktopVaultSelectionProvider(loaded.context, environment)
  try {
    const state = loaded.context.noteVault.activate(vault, 0)
    assert.equal(state.active, true)
    if (!state.active) return
    assert.strictEqual(await loaded.context.noteVault.synchronizeDesktopSelection(new AbortController().signal), state)
    assert.deepEqual(owner.nativeVaultSnapshot(), { generation: state.generation, id: state.id })
    const identity = {
      operationId: 'runtime-adopt-source', requestId: 'runtime-adopt-request', sessionId: 'runtime-adopt-session',
      vaultGeneration: state.generation, vaultId: state.id, windowId: 'runtime-adopt-window',
    }
    assert.equal((await picker.pick({ identity, kind: 'source', purpose: 'markdown-folder' }, new AbortController().signal)).status, 'selected')
  } finally {
    await loaded.context.fiber.dispose()
    await vaultProvider.close()
    await picker.dispose()
    await channel.stop()
    await rm(loaded.root, { recursive: true, force: true })
    await rm(vault, { recursive: true, force: true })
    await rm(source, { recursive: true, force: true })
  }
})

test('selected vault inode replacement invalidates Runtime and exact main mapping', async () => {
  const vault = await canonicalTemp('tockteam-replaced-vault-')
  const moved = `${vault}-moved`
  const source = await canonicalTemp('tockteam-replaced-source-')
  const owner = new DesktopPickerOwner({
    isAvailable: () => true,
    showOpenDialog: async options => ({ canceled: false, filePath: options.purpose === 'activate' ? vault : source }),
    showSaveDialog: async () => ({ canceled: true }),
  })
  const channel = new DesktopPickerChannel(owner)
  const environment = await channel.start()
  const loaded = await loadRuntime()
  const picker = new DesktopPickerProvider(environment, fetch, () => loaded.context.noteVault.state)
  const vaultProvider = new DesktopVaultSelectionProvider(loaded.context, environment)
  try {
    const identity = {
      operationId: 'replace-activate',
      requestId: 'replace-request',
      sessionId: 'replace-session',
      vaultGeneration: 0,
      vaultId: null,
      windowId: 'replace-window',
    }
    const selected = await picker.pick({ identity, kind: 'vault', purpose: 'activate' }, new AbortController().signal)
    assert.equal(selected.status, 'selected')
    if (selected.status !== 'selected') return
    const activated = await loaded.context.noteVault.activateDesktopSelection({ authorization: selected.authorization, identity }, new AbortController().signal)
    await rename(vault, moved)
    await mkdir(vault)
    await assert.rejects(loaded.context.noteVault.listTree({
      expectedVault: { generation: activated.vaultGeneration, id: activated.vaultId },
      limit: 10,
    }, new AbortController().signal))
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(loaded.context.noteVault.state.active, false)
    await assert.rejects(picker.pick({
      identity: { ...identity, operationId: 'after-replacement', requestId: 'after-replacement', vaultGeneration: loaded.context.noteVault.state.generation, vaultId: null },
      kind: 'source',
      purpose: 'markdown-folder',
    }, new AbortController().signal), (error: unknown) => error instanceof Error && 'code' in error && error.code === 'stale')
  } finally {
    await loaded.context.fiber.dispose()
    await vaultProvider.close()
    await picker.dispose()
    await channel.stop()
    await rm(loaded.root, { recursive: true, force: true })
    await rm(vault, { recursive: true, force: true })
    await rm(moved, { recursive: true, force: true })
    await rm(source, { recursive: true, force: true })
  }
})

test('reserved main mapping stays unusable until Runtime state matches exactly', async () => {
  const vault = await canonicalTemp('tockteam-reserved-vault-')
  const source = await canonicalTemp('tockteam-reserved-source-')
  const owner = new DesktopPickerOwner({
    isAvailable: () => true,
    showOpenDialog: async options => ({ canceled: false, filePath: options.purpose === 'activate' ? vault : source }),
    showSaveDialog: async () => ({ canceled: true }),
  })
  const channel = new DesktopPickerChannel(owner)
  const environment = await channel.start()
  const loaded = await loadRuntime()
  const picker = new DesktopPickerProvider(environment, fetch, () => loaded.context.noteVault.state)
  try {
    const identity = {
      operationId: 'reserve-only',
      requestId: 'reserve-request',
      sessionId: 'reserve-session',
      vaultGeneration: 0,
      vaultId: null,
      windowId: 'reserve-window',
    }
    const selected = await owner.pick({ identity, kind: 'vault', purpose: 'activate' }, new AbortController().signal)
    assert.equal(selected.status, 'selected')
    if (selected.status !== 'selected') return
    const consumed = await owner.consumeVaultSelection({ authorization: selected.authorization, identity }, new AbortController().signal)
    assert.equal(consumed.status, 'consumed')
    if (consumed.status !== 'consumed') return
    assert.equal((await owner.bindVaultSelection({ claim: consumed.claim, operationId: identity.operationId, vaultGeneration: 1, vaultId: 'reserved-id' as never }, new AbortController().signal)).status, 'bound')
    await assert.rejects(
      picker.pick({
        identity: { ...identity, operationId: 'pre-activation-source', requestId: 'pre-activation-source', vaultGeneration: 1, vaultId: 'reserved-id' },
        kind: 'source',
        purpose: 'markdown-folder',
      }, new AbortController().signal),
      (error: unknown) => error instanceof Error && 'code' in error && error.code === 'stale',
    )
  } finally {
    await loaded.context.fiber.dispose()
    await picker.dispose()
    await channel.stop()
    await rm(loaded.root, { recursive: true, force: true })
    await rm(vault, { recursive: true, force: true })
    await rm(source, { recursive: true, force: true })
  }
})

test('Runtime unload waits a delayed release after a post-bind activation failure', async () => {
  const vault = await canonicalTemp('tockteam-failed-vault-')
  const owner = new DesktopPickerOwner({
    isAvailable: () => true,
    showOpenDialog: async () => ({ canceled: false, filePath: vault }),
    showSaveDialog: async () => ({ canceled: true }),
  })
  const channel = new DesktopPickerChannel(owner)
  const environment = await channel.start()
  const loaded = await loadRuntime()
  const picker = new DesktopPickerProvider(environment, fetch, () => loaded.context.noteVault.state)
  let releaseStarted!: () => void
  const started = new Promise<void>(resolve => { releaseStarted = resolve })
  let finishRelease!: () => void
  const releaseGate = new Promise<void>(resolve => { finishRelease = resolve })
  const delayedFetch: typeof fetch = async (input, init) => {
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) as { method?: string } : {}
    if (body.method === 'releaseVaultSelection') {
      releaseStarted()
      await releaseGate
    }
    return await fetch(input, init)
  }
  const vaultProvider = new DesktopVaultSelectionProvider(loaded.context, environment, delayedFetch)
  const runtimeInstance = loaded.context.noteVault as unknown as {
    activateVault: (...args: unknown[]) => unknown
  }
  const originalActivateVault = runtimeInstance.activateVault
  let runtimeDisposed = false
  try {
    const identity = {
      operationId: 'failed-activation',
      requestId: 'failed-request',
      sessionId: 'failed-session',
      vaultGeneration: 0,
      vaultId: null,
      windowId: 'failed-window',
    }
    const selected = await picker.pick({ identity, kind: 'vault', purpose: 'activate' }, new AbortController().signal)
    assert.equal(selected.status, 'selected')
    if (selected.status !== 'selected') return
    runtimeInstance.activateVault = () => { throw new Error('synthetic activation failure') }
    const activation = loaded.context.noteVault.activateDesktopSelection(
      { authorization: selected.authorization, identity },
      new AbortController().signal,
    )
    await Promise.race([
      started,
      new Promise<never>((_resolve, reject) => {
        setTimeout(() => reject(new Error('Runtime did not start bound-claim release')), 2_000).unref()
      }),
    ])
    let unloadSettled = false
    const unload = loaded.context.fiber.dispose().then(() => { unloadSettled = true })
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(unloadSettled, false)
    finishRelease()
    await assert.rejects(activation)
    await unload
    runtimeDisposed = true
  } finally {
    runtimeInstance.activateVault = originalActivateVault
    finishRelease()
    if (!runtimeDisposed) await loaded.context.fiber.dispose()
    await vaultProvider.close()
    await picker.dispose()
    await channel.stop()
    await rm(loaded.root, { recursive: true, force: true })
    await rm(vault, { recursive: true, force: true })
  }
})

test('Runtime supersession and direct switch release only the exact bound Desktop claim', async () => {
  const firstVault = await canonicalTemp('tockteam-selected-vault-one-')
  const secondVault = await canonicalTemp('tockteam-selected-vault-two-')
  const directVault = await canonicalTemp('tockteam-direct-vault-')
  const source = await canonicalTemp('tockteam-external-source-')
  const selections = [firstVault, secondVault]
  const owner = new DesktopPickerOwner({
    isAvailable: () => true,
    showOpenDialog: async options => options.purpose === 'activate'
      ? { canceled: false, filePath: selections.shift() ?? secondVault }
      : { canceled: false, filePath: source },
    showSaveDialog: async () => ({ canceled: true }),
  })
  const channel = new DesktopPickerChannel(owner)
  const environment = await channel.start()
  const loaded = await loadRuntime()
  const picker = new DesktopPickerProvider(environment, fetch, () => loaded.context.noteVault.state)
  const vaultProvider = new DesktopVaultSelectionProvider(loaded.context, environment)
  try {
    const initialIdentity = {
      operationId: 'activate-one',
      requestId: 'request-one',
      sessionId: 'session',
      vaultGeneration: 0,
      vaultId: null,
      windowId: 'window',
    }
    const firstPick = await picker.pick({ identity: initialIdentity, kind: 'vault', purpose: 'activate' }, new AbortController().signal)
    assert.equal(firstPick.status, 'selected')
    if (firstPick.status !== 'selected') return
    const first = await loaded.context.noteVault.activateDesktopSelection({ authorization: firstPick.authorization, identity: initialIdentity }, new AbortController().signal)

    const secondIdentity = {
      ...initialIdentity,
      operationId: 'activate-two',
      requestId: 'request-two',
      vaultGeneration: first.vaultGeneration,
      vaultId: first.vaultId,
    }
    const secondPick = await picker.pick({ identity: secondIdentity, kind: 'vault', purpose: 'activate' }, new AbortController().signal)
    assert.equal(secondPick.status, 'selected')
    if (secondPick.status !== 'selected') return
    const second = await loaded.context.noteVault.activateDesktopSelection({ authorization: secondPick.authorization, identity: secondIdentity }, new AbortController().signal)
    await new Promise(resolve => setImmediate(resolve))
    assert.equal((await picker.pick({
      identity: { ...secondIdentity, operationId: 'after-supersession', requestId: 'after-supersession', vaultGeneration: second.vaultGeneration, vaultId: second.vaultId },
      kind: 'source',
      purpose: 'markdown-folder',
    }, new AbortController().signal)).status, 'selected')

    const switched = loaded.context.noteVault.activate(directVault, second.vaultGeneration)
    assert.equal(switched.active, true)
    await new Promise(resolve => setImmediate(resolve))
    assert.deepEqual(await owner.pick({
      identity: {
        ...secondIdentity,
        operationId: 'after-direct-switch',
        requestId: 'after-direct-switch',
        vaultGeneration: switched.generation,
        vaultId: switched.active ? switched.id : null,
      },
      kind: 'source',
      purpose: 'markdown-folder',
    }, new AbortController().signal), { operationId: 'after-direct-switch', status: 'stale' })
  } finally {
    await loaded.context.fiber.dispose()
    await vaultProvider.close()
    await picker.dispose()
    await channel.stop()
    await rm(loaded.root, { recursive: true, force: true })
    await Promise.all([firstVault, secondVault, directVault, source].map(path => rm(path, { recursive: true, force: true })))
  }
})
