import assert from 'node:assert/strict'
import { mkdirSync, renameSync, writeFileSync } from 'node:fs'
import { appendFile, lstat, mkdir, mkdtemp, open as openFile, readFile, readdir, realpath, rename, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import Include from '@deepseek-ai/cordis-plugin-include'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import NoteVaultRuntime, {
  NoteVaultError,
  TockTeamDesktopReveal,
  TockTeamDesktopVaultSelection,
  type NoteVaultChangeEvent,
  type TockTeamDesktopRevealInput,
  type TockTeamDesktopRevealResult,
  type TockTeamDesktopVaultSelectionBindInput,
  type TockTeamDesktopVaultSelectionBindResult,
  type TockTeamDesktopVaultSelectionClaim,
  type TockTeamDesktopVaultSelectionConsumeInput,
  type TockTeamDesktopVaultSelectionConsumeResult,
  type TockTeamDesktopVaultSelectionReleaseInput,
} from '../src/index.ts'

const packageName = 'tockbot-note-runtime'
const desktopClaim = (value: string) => value as TockTeamDesktopVaultSelectionClaim

async function load(config: string): Promise<{ context: Context; root: string }> {
  const root = await mkdtemp(join(tmpdir(), 'note-vault-runtime-'))
  const configPath = join(root, 'cordis.yml')
  const configLines = config.split('\n')
  if (!configLines.some(line => line.trimStart().startsWith('stateRoot:'))) {
    configLines.push(`stateRoot: ${JSON.stringify(join(root, 'state'))}`)
  }
  await writeFile(configPath, [
    `- name: '${packageName}'`,
    '  config:',
    ...configLines.map(line => `    ${line}`),
    '',
  ].join('\n'))

  const context = new Context()
  context.baseUrl = pathToFileURL(root).href + '/'
  await context.plugin(Loader)
  context.loader.builtins.include = Include
  context.loader.internal = {
    version: 'v2',
    async import(specifier: string) {
      if (specifier !== packageName) throw new Error(`unexpected Loader import: ${specifier}`)
      return NoteVaultRuntime
    },
  } as unknown as NonNullable<typeof context.loader.internal>

  try {
    await context.loader.create({
      name: 'cordis:include',
      config: { path: pathToFileURL(configPath).href },
    })
    await context.loader.await()
    return { context, root }
  } catch (error) {
    await context.fiber.dispose()
    await rm(root, { recursive: true, force: true })
    throw error
  }
}

async function dispose(context: Context, root: string): Promise<void> {
  await context.fiber.dispose()
  await rm(root, { recursive: true, force: true })
}

type FileRead = (
  this: unknown,
  buffer: Buffer,
  offset: number,
  length: number,
  position: number,
) => Promise<{ buffer: Buffer; bytesRead: number }>

async function duringFirstFileRead(
  probePath: string,
  action: () => Promise<void> | void,
  run: () => Promise<void>,
): Promise<void> {
  const probe = await openFile(probePath, 'r')
  const prototype = Object.getPrototypeOf(probe) as { read: FileRead }
  const originalRead = prototype.read
  await probe.close()
  let intercepted = false
  prototype.read = async function (...args) {
    const result = await originalRead.apply(this, args)
    if (!intercepted) {
      intercepted = true
      await action()
    }
    return result
  }
  try {
    await run()
  } finally {
    prototype.read = originalRead
  }
}

async function duringFirstFileSyncWhen(
  probePath: string,
  shouldIntercept: () => boolean,
  action: () => Promise<void> | void,
  run: () => Promise<void>,
): Promise<void> {
  const probe = await openFile(probePath, 'r')
  const prototype = Object.getPrototypeOf(probe) as { sync: () => Promise<void> }
  const originalSync = prototype.sync
  await probe.close()
  let intercepted = false
  prototype.sync = async function () {
    await originalSync.call(this)
    if (!intercepted && shouldIntercept()) {
      intercepted = true
      await action()
    }
  }
  try {
    await run()
  } finally {
    prototype.sync = originalSync
  }
}

async function duringFirstFileSync(
  probePath: string,
  action: () => Promise<void> | void,
  run: () => Promise<void>,
): Promise<void> {
  await duringFirstFileSyncWhen(probePath, () => true, action, run)
}

type FileStat = (
  this: unknown,
  options: { bigint: true },
) => Promise<unknown>

async function duringFirstFileStat(
  probePath: string,
  action: () => Promise<void> | void,
  run: () => Promise<void>,
): Promise<void> {
  const probe = await openFile(probePath, 'r')
  const prototype = Object.getPrototypeOf(probe) as { stat: FileStat }
  const originalStat = prototype.stat
  await probe.close()
  let intercepted = false
  prototype.stat = async function (...args) {
    const result = await originalStat.apply(this, args)
    if (!intercepted) {
      intercepted = true
      await action()
    }
    return result
  }
  try {
    await run()
  } finally {
    prototype.stat = originalStat
  }
}

async function waitUntil(predicate: () => boolean, timeoutMs = 2_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error('timed out waiting for filesystem event')
    await new Promise(resolve => setTimeout(resolve, 10))
  }
}

async function consumeState(context: Context): Promise<NoteVaultRuntime['state']> {
  let state: NoteVaultRuntime['state'] | undefined
  await context.plugin(Object.assign(
    (consumer: Context) => { state = consumer.noteVault.state },
    { inject: ['noteVault'] },
  ))
  if (state === undefined) throw new Error('noteVault consumer did not activate')
  return state
}

test('Loader mounts and disposes the Host service', async () => {
  const { context, root } = await load('vaultRoot: null')
  try {
    assert.ok(context.noteVault instanceof NoteVaultRuntime)
    assert.deepEqual(await consumeState(context), { active: false, generation: 0 })
    const entry = [...context.loader.entries()].find(item => item.options.name === packageName)
    if (entry?.fiber === undefined) throw new Error('runtime Loader entry is not active')

    await entry.fiber.dispose()

    assert.equal(context.get('noteVault'), undefined)
  } finally {
    await dispose(context, root)
  }
})

test('Loader exposes one canonical configured vault identity without its path', async () => {
  const fixture = await mkdtemp(join(tmpdir(), 'note-vault-identity-'))
  const vault = join(fixture, 'Vault')
  const alias = join(fixture, 'Vault Alias')
  try {
    await mkdir(vault)
    await symlink(vault, alias, process.platform === 'win32' ? 'junction' : 'dir')
    const canonical = await realpath(vault)

    const fromAlias = await load(`vaultRoot: ${JSON.stringify(alias)}`)
    let vaultId = ''
    try {
      const state = await consumeState(fromAlias.context)
      assert.equal(state.active, true)
      if (!state.active) assert.fail('configured vault must be active')
      assert.equal(state.generation, 1)
      assert.match(state.id, /^vault:[0-9a-f]{64}$/)
      assert.ok(!JSON.stringify(state).includes(canonical))
      assert.ok(!JSON.stringify(state).includes(alias))
      vaultId = state.id
    } finally {
      await dispose(fromAlias.context, fromAlias.root)
    }

    const fromCanonicalPath = await load(`vaultRoot: ${JSON.stringify(canonical)}`)
    try {
      const state = await consumeState(fromCanonicalPath.context)
      assert.equal(state.active, true)
      if (!state.active) assert.fail('configured vault must be active')
      assert.equal(state.id, vaultId)
    } finally {
      await dispose(fromCanonicalPath.context, fromCanonicalPath.root)
    }
  } finally {
    await rm(fixture, { recursive: true, force: true })
  }
})

test('an injected consumer switches the sole vault and advances generation', async () => {
  const fixture = await mkdtemp(join(tmpdir(), 'note-vault-activation-'))
  const firstVault = join(fixture, 'First Vault')
  const firstVaultAlias = join(fixture, 'First Vault Alias')
  const secondVault = join(fixture, 'Second Vault')
  try {
    await mkdir(firstVault)
    await symlink(firstVault, firstVaultAlias, process.platform === 'win32' ? 'junction' : 'dir')
    await mkdir(secondVault)
    const loaded = await load('vaultRoot: null')
    try {
      let sameIdentity: NoteVaultRuntime['state'] | undefined
      let switched: NoteVaultRuntime['state'] | undefined
      await loaded.context.plugin(Object.assign(
        (consumer: Context) => {
          const initial = consumer.noteVault.state
          assert.deepEqual(initial, { active: false, generation: 0 })
          const firstIdentity = consumer.noteVault.activate(firstVault, 0)
          sameIdentity = consumer.noteVault.activate(firstVaultAlias, 1)
          assert.strictEqual(sameIdentity, firstIdentity)
          switched = consumer.noteVault.activate(secondVault, 1)
          assert.throws(
            () => consumer.noteVault.activate(join(fixture, 'missing'), 1),
            /vault generation changed/i,
          )
          assert.strictEqual(consumer.noteVault.state, switched)
          assert.throws(
            () => consumer.noteVault.activate(join(fixture, 'missing'), 2),
            /vaultRoot.*existing directory/i,
          )
          assert.strictEqual(consumer.noteVault.state, switched)
        },
        { inject: ['noteVault'] },
      ))
      if (sameIdentity === undefined || switched === undefined) {
        throw new Error('noteVault consumer did not activate')
      }
      assert.equal(sameIdentity.generation, 1)
      if (!sameIdentity.active || !switched.active) assert.fail('configured vault must remain active')
      assert.notEqual(switched.id, sameIdentity.id)
      assert.equal(switched.generation, 2)
    } finally {
      await dispose(loaded.context, loaded.root)
    }
  } finally {
    await rm(fixture, { recursive: true, force: true })
  }
})

test('Desktop vault selection activates only through a generation-bound Host claim without leaking its path', async () => {
  const fixture = await mkdtemp(join(tmpdir(), 'note-vault-desktop-activation-'))
  const moved = `${fixture}-moved`
  try {
    const loaded = await load('vaultRoot: null')
    try {
      const identity = {
        operationId: 'activate-operation',
        requestId: 'activate-request',
        sessionId: 'activate-session',
        vaultGeneration: 0,
        vaultId: null,
        windowId: 'activate-window',
      }
      let bound: TockTeamDesktopVaultSelectionBindInput | undefined
      const released: string[] = []
      class SelectionOwner extends TockTeamDesktopVaultSelection {
        async consume(
          input: TockTeamDesktopVaultSelectionConsumeInput,
          _signal: AbortSignal,
        ): Promise<TockTeamDesktopVaultSelectionConsumeResult> {
          assert.deepEqual(Object.keys(input).sort(), ['authorization', 'identity'])
          assert.deepEqual(Object.keys(input.identity).sort(), [
            'operationId',
            'requestId',
            'sessionId',
            'vaultGeneration',
            'vaultId',
            'windowId',
          ])
          assert.equal(input.authorization, 'opaque-authorization')
          assert.equal(input.identity.requestId, identity.requestId)
          assert.equal(input.identity.sessionId, identity.sessionId)
          assert.equal(input.identity.windowId, identity.windowId)
          const entry = await lstat(fixture, { bigint: true })
          return {
            canonicalPath: await realpath(fixture),
            claim: desktopClaim(`opaque-${input.identity.operationId}`),
            identity: { dev: entry.dev.toString(10), ino: entry.ino.toString(10) },
            operationId: input.identity.operationId,
            status: 'consumed',
          }
        }

        async bind(
          input: TockTeamDesktopVaultSelectionBindInput,
          _signal: AbortSignal,
        ): Promise<TockTeamDesktopVaultSelectionBindResult> {
          assert.deepEqual(Object.keys(input).sort(), [
            'claim',
            'operationId',
            'vaultGeneration',
            'vaultId',
          ])
          bound = input
          return { operationId: input.operationId, status: 'bound' }
        }

        async release(input: TockTeamDesktopVaultSelectionReleaseInput): Promise<void> {
          released.push(input.claim)
        }
      }
      await loaded.context.plugin(SelectionOwner)
      const result = await loaded.context.noteVault.activateDesktopSelection({
        authorization: 'opaque-authorization',
        identity,
      }, new AbortController().signal)
      assert.deepEqual(result, {
        operationId: identity.operationId,
        status: 'activated',
        vaultGeneration: 1,
        vaultId: loaded.context.noteVault.state.active ? loaded.context.noteVault.state.id : '',
      })
      assert.equal(loaded.context.noteVault.state.active, true)
      assert.deepEqual(bound, {
        claim: 'opaque-activate-operation',
        operationId: identity.operationId,
        vaultGeneration: result.vaultGeneration,
        vaultId: result.vaultId,
      })
      assert.equal(released.length, 0)
      assert.equal(JSON.stringify(result).includes(fixture), false)
      assert.equal(JSON.stringify(result).includes('opaque-authorization'), false)
      assert.equal(JSON.stringify(result).includes('opaque-claim'), false)

      const repeated = await loaded.context.noteVault.activateDesktopSelection({
        authorization: 'opaque-authorization',
        identity: {
          ...identity,
          operationId: 'activate-same-operation',
          vaultGeneration: result.vaultGeneration,
          vaultId: result.vaultId,
        },
      }, new AbortController().signal)
      assert.equal(repeated.vaultGeneration, result.vaultGeneration)
      assert.equal(repeated.vaultId, result.vaultId)
      await waitUntil(() => released.length === 1)
      assert.deepEqual(released, ['opaque-activate-operation'])

      await rename(fixture, moved)
      await mkdir(fixture)
      await assert.rejects(
        loaded.context.noteVault.activateDesktopSelection({
          authorization: 'opaque-authorization',
          identity: {
            ...identity,
            operationId: 'activate-replacement-stale-operation',
            vaultGeneration: repeated.vaultGeneration,
            vaultId: repeated.vaultId,
          },
        }, new AbortController().signal),
        (error: unknown) => error instanceof NoteVaultError
          && (error.code === 'changed' || error.code === 'stale-vault'),
      )
      await waitUntil(() => released.length === 2)
      assert.deepEqual(released, [
        'opaque-activate-operation',
        'opaque-activate-same-operation',
      ])
      const invalidated = loaded.context.noteVault.state
      assert.deepEqual(invalidated, { active: false, generation: repeated.vaultGeneration + 1 })

      loaded.context.on('note-vault/change', () => { throw new Error('observer failed') })
      const replaced = await loaded.context.noteVault.activateDesktopSelection({
        authorization: 'opaque-authorization',
        identity: {
          ...identity,
          operationId: 'activate-replacement-operation',
          vaultGeneration: invalidated.generation,
          vaultId: null,
        },
      }, new AbortController().signal)
      assert.equal(replaced.vaultGeneration, invalidated.generation + 1)
      assert.equal(replaced.vaultId, repeated.vaultId)
      assert.deepEqual(loaded.context.noteVault.state, {
        active: true,
        generation: replaced.vaultGeneration,
        id: replaced.vaultId,
      })
      const runtimeEntry = [...loaded.context.loader.entries()]
        .find(item => item.options.name === packageName)
      if (runtimeEntry?.fiber === undefined) assert.fail('runtime Loader entry is not active')
      await runtimeEntry.fiber.dispose()
      assert.deepEqual(released, [
        'opaque-activate-operation',
        'opaque-activate-same-operation',
        'opaque-activate-replacement-operation',
      ])
      assert.equal(loaded.context.get('noteVault'), undefined)
    } finally {
      await dispose(loaded.context, loaded.root)
    }
  } finally {
    await Promise.all([
      rm(fixture, { recursive: true, force: true }),
      rm(moved, { recursive: true, force: true }),
    ])
  }
})

test('Desktop vault selection never publishes a claim superseded by reentrant activation', async () => {
  const fixture = await mkdtemp(join(tmpdir(), 'note-vault-desktop-activation-reentrant-'))
  const selectedVault = join(fixture, 'Selected')
  const switchedVault = join(fixture, 'Switched')
  try {
    await Promise.all([mkdir(selectedVault), mkdir(switchedVault)])
    const loaded = await load('vaultRoot: null')
    try {
      const released: string[] = []
      class SelectionOwner extends TockTeamDesktopVaultSelection {
        async consume(
          input: TockTeamDesktopVaultSelectionConsumeInput,
          _signal: AbortSignal,
        ): Promise<TockTeamDesktopVaultSelectionConsumeResult> {
          const entry = await lstat(selectedVault, { bigint: true })
          return {
            canonicalPath: await realpath(selectedVault),
            claim: desktopClaim('reentrant-claim'),
            identity: { dev: entry.dev.toString(10), ino: entry.ino.toString(10) },
            operationId: input.identity.operationId,
            status: 'consumed',
          }
        }

        async bind(
          input: TockTeamDesktopVaultSelectionBindInput,
          _signal: AbortSignal,
        ): Promise<TockTeamDesktopVaultSelectionBindResult> {
          return { operationId: input.operationId, status: 'bound' }
        }

        async release(input: TockTeamDesktopVaultSelectionReleaseInput): Promise<void> {
          released.push(input.claim)
        }
      }
      await loaded.context.plugin(SelectionOwner)
      let switched = false
      loaded.context.on('note-vault/change', (event) => {
        if (!switched && event.action === 'activated') {
          switched = true
          loaded.context.noteVault.activate(switchedVault, event.vault.generation)
        }
      })
      await assert.rejects(
        loaded.context.noteVault.activateDesktopSelection({
          authorization: 'opaque-authorization',
          identity: {
            operationId: 'reentrant-operation',
            requestId: 'reentrant-request',
            sessionId: 'reentrant-session',
            vaultGeneration: 0,
            vaultId: null,
            windowId: 'reentrant-window',
          },
        }, new AbortController().signal),
        (error: unknown) => error instanceof NoteVaultError && error.code === 'stale-vault',
      )
      await waitUntil(() => released.length === 1)
      assert.deepEqual(released, ['reentrant-claim'])
      const state = loaded.context.noteVault.state
      assert.equal(state.active, true)
      if (!state.active) assert.fail('reentrant vault must be active')
      assert.equal(state.generation, 2)
      assert.notEqual(state.id, `vault:${'0'.repeat(64)}`)
      const runtimeEntry = [...loaded.context.loader.entries()]
        .find(item => item.options.name === packageName)
      if (runtimeEntry?.fiber === undefined) assert.fail('runtime Loader entry is not active')
      await runtimeEntry.fiber.dispose()
      assert.deepEqual(released, ['reentrant-claim'])
    } finally {
      await dispose(loaded.context, loaded.root)
    }
  } finally {
    await rm(fixture, { recursive: true, force: true })
  }
})

test('Desktop vault selection rejects root replacement by an activation observer', async () => {
  const fixture = await mkdtemp(join(tmpdir(), 'note-vault-desktop-activation-observer-replace-'))
  const vault = join(fixture, 'Vault')
  const moved = join(fixture, 'Moved')
  try {
    await mkdir(vault)
    const loaded = await load('vaultRoot: null')
    try {
      let releases = 0
      class SelectionOwner extends TockTeamDesktopVaultSelection {
        async consume(
          input: TockTeamDesktopVaultSelectionConsumeInput,
          _signal: AbortSignal,
        ): Promise<TockTeamDesktopVaultSelectionConsumeResult> {
          const entry = await lstat(vault, { bigint: true })
          return {
            canonicalPath: await realpath(vault),
            claim: desktopClaim('observer-replacement-claim'),
            identity: { dev: entry.dev.toString(10), ino: entry.ino.toString(10) },
            operationId: input.identity.operationId,
            status: 'consumed',
          }
        }

        async bind(
          input: TockTeamDesktopVaultSelectionBindInput,
          _signal: AbortSignal,
        ): Promise<TockTeamDesktopVaultSelectionBindResult> {
          return { operationId: input.operationId, status: 'bound' }
        }

        async release(_input: TockTeamDesktopVaultSelectionReleaseInput): Promise<void> {
          releases += 1
        }
      }
      await loaded.context.plugin(SelectionOwner)
      loaded.context.on('note-vault/change', (event) => {
        if (event.action !== 'activated') return
        renameSync(vault, moved)
        mkdirSync(vault)
      })
      await assert.rejects(
        loaded.context.noteVault.activateDesktopSelection({
          authorization: 'opaque-authorization',
          identity: {
            operationId: 'observer-replacement-operation',
            requestId: 'observer-replacement-request',
            sessionId: 'observer-replacement-session',
            vaultGeneration: 0,
            vaultId: null,
            windowId: 'observer-replacement-window',
          },
        }, new AbortController().signal),
        (error: unknown) => error instanceof NoteVaultError
          && (error.code === 'changed' || error.code === 'stale-vault'),
      )
      assert.deepEqual(loaded.context.noteVault.state, { active: false, generation: 2 })
      await waitUntil(() => releases === 1)
    } finally {
      await dispose(loaded.context, loaded.root)
    }
  } finally {
    await rm(fixture, { recursive: true, force: true })
  }
})

test('Desktop-selected root identity loss fences every filesystem authority', async () => {
  const scenarios = [
    'create',
    'list',
    'open',
    'recovery',
    'reveal',
    'rewrite',
  ] as const
  for (const scenario of scenarios) {
    const fixture = await mkdtemp(join(tmpdir(), `note-vault-root-identity-${scenario}-`))
    const vault = join(fixture, 'Vault')
    const moved = join(fixture, 'Moved')
    try {
      await mkdir(vault)
      await writeFile(join(vault, 'Original.md'), '# Original\n')
      const loaded = await load('vaultRoot: null')
      try {
        let releases = 0
        let revealCalls = 0
        class SelectionOwner extends TockTeamDesktopVaultSelection {
          async consume(
            input: TockTeamDesktopVaultSelectionConsumeInput,
            _signal: AbortSignal,
          ): Promise<TockTeamDesktopVaultSelectionConsumeResult> {
            const entry = await lstat(vault, { bigint: true })
            return {
              canonicalPath: await realpath(vault),
              claim: desktopClaim(`identity-${scenario}-claim`),
              identity: { dev: entry.dev.toString(10), ino: entry.ino.toString(10) },
              operationId: input.identity.operationId,
              status: 'consumed',
            }
          }

          async bind(
            input: TockTeamDesktopVaultSelectionBindInput,
            _signal: AbortSignal,
          ): Promise<TockTeamDesktopVaultSelectionBindResult> {
            return { operationId: input.operationId, status: 'bound' }
          }

          async release(_input: TockTeamDesktopVaultSelectionReleaseInput): Promise<void> {
            releases += 1
          }
        }
        class RevealOwner extends TockTeamDesktopReveal {
          async reveal(
            input: TockTeamDesktopRevealInput,
            _signal: AbortSignal,
          ): Promise<TockTeamDesktopRevealResult> {
            revealCalls += 1
            return { operationId: input.operationId, status: 'revealed' }
          }
        }
        await loaded.context.plugin(SelectionOwner)
        await loaded.context.plugin(RevealOwner)
        const activated = await loaded.context.noteVault.activateDesktopSelection({
          authorization: 'opaque-authorization',
          identity: {
            operationId: `identity-${scenario}-operation`,
            requestId: `identity-${scenario}-request`,
            sessionId: 'identity-session',
            vaultGeneration: 0,
            vaultId: null,
            windowId: 'identity-window',
          },
        }, new AbortController().signal)
        const expectedVault = { id: activated.vaultId, generation: activated.vaultGeneration }
        const original = await loaded.context.noteVault.openDocument(
          'Original.md',
          expectedVault,
          new AbortController().signal,
        )
        renameSync(vault, moved)
        mkdirSync(vault)
        writeFileSync(join(vault, 'Original.md'), '# Replacement\n')

        const operation = scenario === 'create'
          ? loaded.context.noteVault.createDocument({ content: '# Created\n', expectedVault, path: 'Created.md' }, new AbortController().signal)
          : scenario === 'list'
            ? loaded.context.noteVault.listTree({ expectedVault }, new AbortController().signal)
            : scenario === 'open'
              ? loaded.context.noteVault.openDocument('Original.md', expectedVault, new AbortController().signal)
              : scenario === 'recovery'
                ? loaded.context.noteVault.listSnapshots({ expectedVault, path: 'Original.md' }, new AbortController().signal)
                : scenario === 'reveal'
                  ? loaded.context.noteVault.revealEntry({ expectedVault, path: 'Original.md' }, new AbortController().signal)
                  : loaded.context.noteVault.moveFileWithLinkRewrite({
                      expectedRevision: original.revision,
                      expectedVault,
                      fromPath: 'Original.md',
                      toPath: 'Moved.md',
                    }, new AbortController().signal)
        await assert.rejects(
          operation,
          (error: unknown) => error instanceof NoteVaultError && error.code === 'changed',
        )
        const state = loaded.context.noteVault.state
        assert.deepEqual(state, { active: false, generation: activated.vaultGeneration + 1 })
        assert.equal(loaded.context.noteVault.listRecentVaults().some(item => item.id === activated.vaultId), false)
        assert.throws(
          () => loaded.context.noteVault.activateRecentVault(activated.vaultId, state.generation),
          (error: unknown) => error instanceof NoteVaultError && error.code === 'not-found',
        )
        await waitUntil(() => releases === 1)
        assert.equal(revealCalls, 0)
        assert.equal(await readFile(join(vault, 'Original.md'), 'utf8'), '# Replacement\n')
        await assert.rejects(readFile(join(vault, 'Created.md')), { code: 'ENOENT' })
        await assert.rejects(readFile(join(vault, 'Moved.md')), { code: 'ENOENT' })
      } finally {
        await dispose(loaded.context, loaded.root)
      }
    } finally {
      await rm(fixture, { recursive: true, force: true })
    }
  }
})

test('Desktop vault selection sanitizes provider failures and releases rejected claims', async () => {
  const fixture = await mkdtemp(join(tmpdir(), 'note-vault-desktop-activation-failure-'))
  try {
    const loaded = await load('vaultRoot: null')
    try {
      const identity = {
        operationId: 'activate-operation',
        requestId: 'activate-request',
        sessionId: 'activate-session',
        vaultGeneration: 0,
        vaultId: null,
        windowId: 'activate-window',
      }
      const request = { authorization: 'opaque-authorization', identity }
      let mode: 'bind-denied' | 'bind-extra' | 'bind-mismatch' | 'bind-ok' | 'consume-extra' | 'consume-identity-extra' | 'consume-malformed' | 'consume-mismatch' | 'throw-path' = 'throw-path'
      let consumeCalls = 0
      let releases = 0
      let throwOnRelease = false
      class SelectionOwner extends TockTeamDesktopVaultSelection {
        async consume(
          input: TockTeamDesktopVaultSelectionConsumeInput,
          _signal: AbortSignal,
        ): Promise<TockTeamDesktopVaultSelectionConsumeResult> {
          consumeCalls += 1
          if (mode === 'throw-path') {
            throw new NoteVaultError('unavailable', `provider leaked ${fixture}`)
          }
          if (mode === 'consume-malformed') {
            return { operationId: input.identity.operationId, status: 'malformed' } as unknown as TockTeamDesktopVaultSelectionConsumeResult
          }
          const entry = await lstat(fixture, { bigint: true })
          const result = {
            canonicalPath: await realpath(fixture),
            claim: desktopClaim('opaque-claim'),
            identity: mode === 'consume-identity-extra'
              ? { dev: entry.dev.toString(10), extra: true, ino: entry.ino.toString(10) }
              : { dev: entry.dev.toString(10), ino: entry.ino.toString(10) },
            operationId: mode === 'consume-mismatch' ? 'wrong-operation' : input.identity.operationId,
            status: 'consumed' as const,
          }
          return mode === 'consume-extra'
            ? { ...result, extra: true } as unknown as TockTeamDesktopVaultSelectionConsumeResult
            : result
        }

        async bind(
          input: TockTeamDesktopVaultSelectionBindInput,
          _signal: AbortSignal,
        ): Promise<TockTeamDesktopVaultSelectionBindResult> {
          if (mode === 'bind-extra') {
            return { extra: true, operationId: input.operationId, status: 'bound' } as unknown as TockTeamDesktopVaultSelectionBindResult
          }
          return mode === 'bind-mismatch'
            ? { operationId: 'wrong-operation', status: 'bound' }
            : { operationId: input.operationId, status: mode === 'bind-ok' ? 'bound' : 'denied' }
        }

        release(input: TockTeamDesktopVaultSelectionReleaseInput): Promise<void> {
          assert.deepEqual(Object.keys(input).sort(), ['claim', 'operationId'])
          releases += 1
          if (throwOnRelease) throw new Error(`release leaked ${fixture}`)
          return Promise.resolve()
        }
      }
      await loaded.context.plugin(SelectionOwner)
      const leaked = await loaded.context.noteVault.activateDesktopSelection(
        request,
        new AbortController().signal,
      ).catch((error: unknown) => error)
      assert.ok(leaked instanceof NoteVaultError)
      assert.equal(leaked.code, 'unavailable')
      assert.equal(leaked.message.includes(fixture), false)

      mode = 'consume-malformed'
      await assert.rejects(
        loaded.context.noteVault.activateDesktopSelection(request, new AbortController().signal),
        (error: unknown) => error instanceof NoteVaultError && error.code === 'unavailable',
      )
      mode = 'consume-extra'
      await assert.rejects(
        loaded.context.noteVault.activateDesktopSelection(request, new AbortController().signal),
        (error: unknown) => error instanceof NoteVaultError && error.code === 'unavailable',
      )
      mode = 'consume-identity-extra'
      await assert.rejects(
        loaded.context.noteVault.activateDesktopSelection(request, new AbortController().signal),
        (error: unknown) => error instanceof NoteVaultError && error.code === 'unavailable',
      )
      mode = 'consume-mismatch'
      await assert.rejects(
        loaded.context.noteVault.activateDesktopSelection(request, new AbortController().signal),
        (error: unknown) => error instanceof NoteVaultError && error.code === 'unavailable',
      )
      mode = 'bind-extra'
      await assert.rejects(
        loaded.context.noteVault.activateDesktopSelection(request, new AbortController().signal),
        (error: unknown) => error instanceof NoteVaultError && error.code === 'unavailable',
      )
      mode = 'bind-mismatch'
      await assert.rejects(
        loaded.context.noteVault.activateDesktopSelection(request, new AbortController().signal),
        (error: unknown) => error instanceof NoteVaultError && error.code === 'unavailable',
      )
      mode = 'bind-denied'
      throwOnRelease = true
      await assert.rejects(
        loaded.context.noteVault.activateDesktopSelection(request, new AbortController().signal),
        (error: unknown) => error instanceof NoteVaultError && error.code === 'denied',
      )
      assert.equal(releases, 6)
      assert.equal(loaded.context.noteVault.state.active, false)

      throwOnRelease = false
      mode = 'bind-ok'
      await rm(join(loaded.root, 'state'), { recursive: true, force: true })
      await writeFile(join(loaded.root, 'state'), 'unavailable')
      await assert.rejects(
        loaded.context.noteVault.activateDesktopSelection(request, new AbortController().signal),
        (error: unknown) => error instanceof NoteVaultError && error.code === 'recovery-unavailable',
      )
      assert.equal(releases, 7)
      assert.equal(loaded.context.noteVault.state.active, false)

      const beforeInvalid = consumeCalls
      for (const invalid of [
        { ...request, authorization: '' },
        { ...request, authorization: 'opaque\0authorization' },
        { ...request, extra: true },
        { ...request, identity: null },
        { ...request, identity: { ...identity, extra: true } },
        { ...request, identity: { ...identity, vaultId: `vault:${'x'.repeat(513)}` } },
      ]) {
        await assert.rejects(
          loaded.context.noteVault.activateDesktopSelection(invalid as never, new AbortController().signal),
          (error: unknown) => error instanceof NoteVaultError && error.code === 'denied',
        )
      }
      assert.equal(consumeCalls, beforeInvalid)
      await assert.rejects(
        loaded.context.noteVault.activateDesktopSelection({
          ...request,
          identity: { ...identity, vaultGeneration: 1 },
        }, new AbortController().signal),
        (error: unknown) => error instanceof NoteVaultError && error.code === 'stale-vault',
      )
      assert.equal(consumeCalls, 9)
    } finally {
      await dispose(loaded.context, loaded.root)
    }
  } finally {
    await rm(fixture, { recursive: true, force: true })
  }
})

test('Desktop vault selection unload waits for release after activation failure', async () => {
  const fixture = await mkdtemp(join(tmpdir(), 'note-vault-desktop-activation-rollback-'))
  try {
    const loaded = await load('vaultRoot: null')
    try {
      const entry = await lstat(fixture, { bigint: true })
      let finishRelease: (() => void) | undefined
      let releaseEntered: (() => void) | undefined
      let releases = 0
      class SelectionOwner extends TockTeamDesktopVaultSelection {
        async consume(
          input: TockTeamDesktopVaultSelectionConsumeInput,
          _signal: AbortSignal,
        ): Promise<TockTeamDesktopVaultSelectionConsumeResult> {
          return {
            canonicalPath: await realpath(fixture),
            claim: desktopClaim('rollback-claim'),
            identity: { dev: entry.dev.toString(10), ino: entry.ino.toString(10) },
            operationId: input.identity.operationId,
            status: 'consumed',
          }
        }

        async bind(
          input: TockTeamDesktopVaultSelectionBindInput,
          _signal: AbortSignal,
        ): Promise<TockTeamDesktopVaultSelectionBindResult> {
          return { operationId: input.operationId, status: 'bound' }
        }

        async release(_input: TockTeamDesktopVaultSelectionReleaseInput): Promise<void> {
          releases += 1
          releaseEntered?.()
          await new Promise<void>(resolve => { finishRelease = resolve })
        }
      }
      await loaded.context.plugin(SelectionOwner)
      await rm(join(loaded.root, 'state'), { recursive: true, force: true })
      await writeFile(join(loaded.root, 'state'), 'unavailable')
      const didEnterRelease = new Promise<void>(resolve => { releaseEntered = resolve })
      const activation = loaded.context.noteVault.activateDesktopSelection({
        authorization: 'opaque-authorization',
        identity: {
          operationId: 'rollback-operation',
          requestId: 'rollback-request',
          sessionId: 'rollback-session',
          vaultGeneration: 0,
          vaultId: null,
          windowId: 'rollback-window',
        },
      }, new AbortController().signal)
      await didEnterRelease
      const runtimeEntry = [...loaded.context.loader.entries()]
        .find(item => item.options.name === packageName)
      if (runtimeEntry?.fiber === undefined) assert.fail('runtime Loader entry is not active')
      let unloadSettled = false
      const unloading = runtimeEntry.fiber.dispose().then(() => { unloadSettled = true })
      await new Promise(resolve => setTimeout(resolve, 10))
      assert.equal(unloadSettled, false)
      finishRelease?.()
      await unloading
      await assert.rejects(
        activation,
        (error: unknown) => error instanceof NoteVaultError && error.code === 'recovery-unavailable',
      )
      assert.equal(releases, 1)
      assert.equal(loaded.context.get('noteVault'), undefined)
    } finally {
      await dispose(loaded.context, loaded.root)
    }
  } finally {
    await rm(fixture, { recursive: true, force: true })
  }
})

test('Desktop vault selection rejects absent providers unsafe roots and replacement races', async () => {
  const fixture = await mkdtemp(join(tmpdir(), 'note-vault-desktop-activation-races-'))
  const vault = join(fixture, 'Vault')
  const moved = join(fixture, 'Moved')
  const alias = join(fixture, 'Alias')
  try {
    await mkdir(vault)
    await symlink(vault, alias, process.platform === 'win32' ? 'junction' : 'dir')
    const loaded = await load('vaultRoot: null')
    try {
      const identity = {
        operationId: 'activate-operation',
        requestId: 'activate-request',
        sessionId: 'activate-session',
        vaultGeneration: 0,
        vaultId: null,
        windowId: 'activate-window',
      }
      const request = { authorization: 'opaque-authorization', identity }
      await assert.rejects(
        loaded.context.noteVault.activateDesktopSelection(request, new AbortController().signal),
        (error: unknown) => error instanceof NoteVaultError && error.code === 'unavailable',
      )

      let mode: 'alias' | 'replace' = 'alias'
      let releases = 0
      class SelectionOwner extends TockTeamDesktopVaultSelection {
        async consume(
          input: TockTeamDesktopVaultSelectionConsumeInput,
          _signal: AbortSignal,
        ): Promise<TockTeamDesktopVaultSelectionConsumeResult> {
          const entry = await lstat(vault, { bigint: true })
          return {
            canonicalPath: mode === 'alias' ? alias : await realpath(vault),
            claim: desktopClaim(`opaque-${mode}-claim`),
            identity: { dev: entry.dev.toString(10), ino: entry.ino.toString(10) },
            operationId: input.identity.operationId,
            status: 'consumed',
          }
        }

        async bind(
          input: TockTeamDesktopVaultSelectionBindInput,
          _signal: AbortSignal,
        ): Promise<TockTeamDesktopVaultSelectionBindResult> {
          if (mode === 'replace') {
            await rename(vault, moved)
            await mkdir(vault)
          }
          return { operationId: input.operationId, status: 'bound' }
        }

        async release(_input: TockTeamDesktopVaultSelectionReleaseInput): Promise<void> {
          releases += 1
        }
      }
      await loaded.context.plugin(SelectionOwner)
      await assert.rejects(
        loaded.context.noteVault.activateDesktopSelection(request, new AbortController().signal),
        (error: unknown) => error instanceof NoteVaultError && error.code === 'invalid-vault',
      )
      mode = 'replace'
      await assert.rejects(
        loaded.context.noteVault.activateDesktopSelection(request, new AbortController().signal),
        (error: unknown) => error instanceof NoteVaultError && error.code === 'changed',
      )
      assert.equal(releases, 2)
      assert.equal(loaded.context.noteVault.state.active, false)
    } finally {
      await dispose(loaded.context, loaded.root)
    }
  } finally {
    await rm(fixture, { recursive: true, force: true })
  }
})

test('Desktop vault selection aborts pending claims on provider loss and competing activation', async () => {
  const fixture = await mkdtemp(join(tmpdir(), 'note-vault-desktop-activation-lifecycle-'))
  const firstVault = join(fixture, 'First')
  const secondVault = join(fixture, 'Second')
  try {
    await Promise.all([mkdir(firstVault), mkdir(secondVault)])
    const loaded = await load(`vaultRoot: ${JSON.stringify(firstVault)}`)
    try {
      let entered: (() => void) | undefined
      let finishRelease: (() => void) | undefined
      let holdRelease = false
      let mode: 'bind-pending' | 'consume-pending' = 'consume-pending'
      let releaseEntered: (() => void) | undefined
      let releases = 0
      class SelectionOwner extends TockTeamDesktopVaultSelection {
        async consume(
          input: TockTeamDesktopVaultSelectionConsumeInput,
          signal: AbortSignal,
        ): Promise<TockTeamDesktopVaultSelectionConsumeResult> {
          if (mode === 'consume-pending') {
            entered?.()
            return await new Promise(resolve => signal.addEventListener('abort', () => {
              resolve({ operationId: input.identity.operationId, status: 'cancelled' })
            }, { once: true }))
          }
          const entry = await lstat(firstVault, { bigint: true })
          return {
            canonicalPath: await realpath(firstVault),
            claim: desktopClaim('opaque-claim'),
            identity: { dev: entry.dev.toString(10), ino: entry.ino.toString(10) },
            operationId: input.identity.operationId,
            status: 'consumed',
          }
        }

        async bind(
          input: TockTeamDesktopVaultSelectionBindInput,
          signal: AbortSignal,
        ): Promise<TockTeamDesktopVaultSelectionBindResult> {
          entered?.()
          return await new Promise(resolve => signal.addEventListener('abort', () => {
            resolve({ operationId: input.operationId, status: 'cancelled' })
          }, { once: true }))
        }

        async release(_input: TockTeamDesktopVaultSelectionReleaseInput): Promise<void> {
          releases += 1
          releaseEntered?.()
          if (holdRelease) await new Promise<void>(resolve => { finishRelease = resolve })
        }
      }
      let owner = loaded.context.plugin(SelectionOwner)
      await owner
      const state = loaded.context.noteVault.state
      if (!state.active) assert.fail('configured vault must be active')
      const request = {
        authorization: 'opaque-authorization',
        identity: {
          operationId: 'activate-operation',
          requestId: 'activate-request',
          sessionId: 'activate-session',
          vaultGeneration: state.generation,
          vaultId: state.id,
          windowId: 'activate-window',
        },
      }
      const waitForEntry = () => new Promise<void>(resolve => { entered = resolve })

      let didEnter = waitForEntry()
      const lostProvider = loaded.context.noteVault.activateDesktopSelection(
        request,
        new AbortController().signal,
      )
      await didEnter
      await owner.dispose()
      await assert.rejects(
        lostProvider,
        (error: unknown) => error instanceof NoteVaultError && error.code === 'unavailable',
      )

      owner = loaded.context.plugin(SelectionOwner)
      await owner
      mode = 'bind-pending'
      didEnter = waitForEntry()
      const switched = loaded.context.noteVault.activateDesktopSelection(
        request,
        new AbortController().signal,
      )
      await didEnter
      const secondState = loaded.context.noteVault.activate(secondVault, state.generation)
      await assert.rejects(
        switched,
        (error: unknown) => error instanceof NoteVaultError && error.code === 'stale-vault',
      )
      if (!secondState.active) assert.fail('activated vault must be active')

      const secondRequest = {
        ...request,
        identity: {
          ...request.identity,
          operationId: 'activate-second-operation',
          vaultGeneration: secondState.generation,
          vaultId: secondState.id,
        },
      }
      const externalAbort = new AbortController()
      didEnter = waitForEntry()
      const externallyCancelled = loaded.context.noteVault.activateDesktopSelection(
        secondRequest,
        externalAbort.signal,
      )
      await didEnter
      externalAbort.abort()
      await assert.rejects(
        externallyCancelled,
        (error: unknown) => error instanceof Error && error.name === 'AbortError',
      )

      holdRelease = true
      const didEnterRelease = new Promise<void>(resolve => { releaseEntered = resolve })
      didEnter = waitForEntry()
      const unloaded = loaded.context.noteVault.activateDesktopSelection(
        secondRequest,
        new AbortController().signal,
      )
      await didEnter
      const runtimeEntry = [...loaded.context.loader.entries()]
        .find(item => item.options.name === packageName)
      if (runtimeEntry?.fiber === undefined) assert.fail('runtime Loader entry is not active')
      let unloadSettled = false
      const unloading = runtimeEntry.fiber.dispose().then(() => { unloadSettled = true })
      await didEnterRelease
      await new Promise(resolve => setTimeout(resolve, 10))
      assert.equal(unloadSettled, false)
      finishRelease?.()
      await unloading
      await assert.rejects(
        unloaded,
        (error: unknown) => error instanceof NoteVaultError && error.code === 'unavailable',
      )
      assert.equal(loaded.context.get('noteVault'), undefined)
      assert.equal(releases, 3)
    } finally {
      await dispose(loaded.context, loaded.root)
    }
  } finally {
    await rm(fixture, { recursive: true, force: true })
  }
})

test('Desktop vault selection releases a claim returned after cancellation', async () => {
  const fixture = await mkdtemp(join(tmpdir(), 'note-vault-desktop-activation-late-claim-'))
  try {
    const loaded = await load('vaultRoot: null')
    try {
      const entry = await lstat(fixture, { bigint: true })
      let resolveConsume: ((result: TockTeamDesktopVaultSelectionConsumeResult) => void) | undefined
      let releases = 0
      class SelectionOwner extends TockTeamDesktopVaultSelection {
        async consume(): Promise<TockTeamDesktopVaultSelectionConsumeResult> {
          return await new Promise(resolve => { resolveConsume = resolve })
        }

        async bind(
          input: TockTeamDesktopVaultSelectionBindInput,
          _signal: AbortSignal,
        ): Promise<TockTeamDesktopVaultSelectionBindResult> {
          assert.fail(`late claim must not bind: ${input.operationId}`)
        }

        async release(_input: TockTeamDesktopVaultSelectionReleaseInput): Promise<void> {
          releases += 1
        }
      }
      await loaded.context.plugin(SelectionOwner)
      const controller = new AbortController()
      const activation = loaded.context.noteVault.activateDesktopSelection({
        authorization: 'opaque-authorization',
        identity: {
          operationId: 'activate-operation',
          requestId: 'activate-request',
          sessionId: 'activate-session',
          vaultGeneration: 0,
          vaultId: null,
          windowId: 'activate-window',
        },
      }, controller.signal)
      await waitUntil(() => resolveConsume !== undefined)
      controller.abort()
      await assert.rejects(
        activation,
        (error: unknown) => error instanceof Error && error.name === 'AbortError',
      )
      resolveConsume?.({
        canonicalPath: await realpath(fixture),
        claim: desktopClaim('late-claim'),
        identity: { dev: entry.dev.toString(10), ino: entry.ino.toString(10) },
        operationId: 'activate-operation',
        status: 'consumed',
      })
      await waitUntil(() => releases === 1)
      assert.equal(loaded.context.noteVault.state.active, false)
    } finally {
      await dispose(loaded.context, loaded.root)
    }
  } finally {
    await rm(fixture, { recursive: true, force: true })
  }
})

test('Desktop reveal delegates only confined file and directory identities without leaking a Host path', async () => {
  const fixture = await mkdtemp(join(tmpdir(), 'note-vault-reveal-'))
  const vault = join(fixture, 'Vault')
  const folder = join(vault, 'Folder')
  const document = join(folder, 'Note.md')
  try {
    await mkdir(folder, { recursive: true })
    await writeFile(document, '# Reveal\n')
    const loaded = await load(`vaultRoot: ${JSON.stringify(vault)}`)
    try {
      const state = loaded.context.noteVault.state
      if (!state.active) assert.fail('configured vault must be active')
      const expectedVault = { id: state.id, generation: state.generation }
      const signal = new AbortController().signal

      await assert.rejects(
        loaded.context.noteVault.revealEntry({ expectedVault, path: 'Folder/Note.md' }, signal),
        (error: unknown) => error instanceof NoteVaultError && error.code === 'unavailable',
      )

      const requests: TockTeamDesktopRevealInput[] = []
      class RevealOwner extends TockTeamDesktopReveal {
        async reveal(
          input: TockTeamDesktopRevealInput,
          ownerSignal: AbortSignal,
        ): Promise<TockTeamDesktopRevealResult> {
          ownerSignal.throwIfAborted()
          requests.push(input)
          return { operationId: input.operationId, status: 'revealed' }
        }
      }
      const owner = loaded.context.plugin(RevealOwner)
      await owner

      const fileResult = await loaded.context.noteVault.revealEntry({
        expectedVault,
        path: 'Folder/Note.md',
      }, signal)
      const directoryResult = await loaded.context.noteVault.revealEntry({
        expectedVault,
        path: 'Folder',
      }, signal)

      assert.deepEqual(fileResult, {
        generation: 1,
        path: 'Folder/Note.md',
        status: 'revealed',
      })
      assert.deepEqual(directoryResult, {
        generation: 1,
        path: 'Folder',
        status: 'revealed',
      })
      assert.equal(JSON.stringify([fileResult, directoryResult]).includes(fixture), false)
      assert.equal(requests.length, 2)
      assert.equal(requests[0]?.canonicalPath, await realpath(document))
      assert.equal(requests[0]?.kind, 'file')
      assert.equal(requests[1]?.canonicalPath, await realpath(folder))
      assert.equal(requests[1]?.kind, 'directory')
      assert.notEqual(requests[0]?.operationId, requests[1]?.operationId)
      for (const request of requests) {
        assert.equal(request.vaultId, state.id)
        assert.equal(request.vaultGeneration, 1)
        assert.match(request.identity.dev, /^(?:0|[1-9][0-9]*)$/u)
        assert.match(request.identity.ino, /^(?:0|[1-9][0-9]*)$/u)
      }
    } finally {
      await dispose(loaded.context, loaded.root)
    }
  } finally {
    await rm(fixture, { recursive: true, force: true })
  }
})

test('Desktop reveal fails closed on stale unsafe replaced denied and cancelled targets', async () => {
  const fixture = await mkdtemp(join(tmpdir(), 'note-vault-reveal-failures-'))
  const vault = join(fixture, 'Vault')
  const outside = join(fixture, 'Outside')
  const pathToReveal = join(vault, 'Note.md')
  const directoryToReveal = join(vault, 'Folder')
  try {
    await Promise.all([mkdir(vault), mkdir(outside)])
    await mkdir(directoryToReveal)
    await writeFile(pathToReveal, '# Original\n')
    await writeFile(join(outside, 'Secret.md'), '# Secret\n')
    await symlink(join(outside, 'Secret.md'), join(vault, 'Unsafe.md'))
    await symlink(outside, join(vault, 'Unsafe Folder'), process.platform === 'win32' ? 'junction' : 'dir')
    const loaded = await load(`vaultRoot: ${JSON.stringify(vault)}`)
    try {
      const state = loaded.context.noteVault.state
      if (!state.active) assert.fail('configured vault must be active')
      const expectedVault = { id: state.id, generation: state.generation }
      let mode: 'denied' | 'mismatch' | 'replace-directory' | 'replace-file' | 'revealed' | 'throw' | 'throw-note-vault' = 'revealed'
      let calls = 0
      class RevealOwner extends TockTeamDesktopReveal {
        async reveal(input: TockTeamDesktopRevealInput): Promise<TockTeamDesktopRevealResult> {
          calls += 1
          if (mode === 'replace-file') {
            await rename(pathToReveal, `${pathToReveal}.replaced`)
            await writeFile(pathToReveal, '# Replacement\n')
          }
          if (mode === 'replace-directory') {
            await rename(directoryToReveal, `${directoryToReveal}.replaced`)
            await mkdir(directoryToReveal)
          }
          if (mode === 'throw') throw new Error(pathToReveal)
          if (mode === 'throw-note-vault') {
            throw new NoteVaultError('unavailable', pathToReveal)
          }
          return {
            operationId: mode === 'mismatch' ? 'wrong-operation' : input.operationId,
            status: mode === 'denied' ? 'denied' : 'revealed',
          }
        }
      }
      const owner = loaded.context.plugin(RevealOwner)
      await owner
      const signal = new AbortController().signal

      await assert.rejects(
        loaded.context.noteVault.revealEntry({
          expectedVault: { ...expectedVault, generation: 0 },
          path: 'Note.md',
        }, signal),
        (error: unknown) => error instanceof NoteVaultError && error.code === 'stale-vault',
      )
      await assert.rejects(
        loaded.context.noteVault.revealEntry({ expectedVault, path: '../Secret.md' }, signal),
        (error: unknown) => error instanceof NoteVaultError && error.code === 'invalid-path',
      )
      await assert.rejects(
        loaded.context.noteVault.revealEntry({
          expectedVault,
          path: `${'a'.repeat(4_097)}.md`,
        }, signal),
        (error: unknown) => error instanceof NoteVaultError && error.code === 'invalid-path',
      )
      await assert.rejects(
        loaded.context.noteVault.revealEntry({ expectedVault, path: 'Unsafe.md' }, signal),
        (error: unknown) => error instanceof NoteVaultError && error.code === 'unsafe-target',
      )
      await assert.rejects(
        loaded.context.noteVault.revealEntry({ expectedVault, path: 'Unsafe Folder/Secret.md' }, signal),
        (error: unknown) => error instanceof NoteVaultError && error.code === 'unsafe-target',
      )
      const missing = await loaded.context.noteVault.revealEntry({
        expectedVault,
        path: 'Missing.md',
      }, signal).catch((error: unknown) => error)
      assert.ok(missing instanceof NoteVaultError)
      assert.equal(missing.code, 'not-found')
      assert.equal(missing.message.includes(fixture), false)
      assert.equal(calls, 0)

      mode = 'denied'
      await assert.rejects(
        loaded.context.noteVault.revealEntry({ expectedVault, path: 'Note.md' }, signal),
        (error: unknown) => error instanceof NoteVaultError && error.code === 'denied',
      )
      mode = 'mismatch'
      await assert.rejects(
        loaded.context.noteVault.revealEntry({ expectedVault, path: 'Note.md' }, signal),
        (error: unknown) => error instanceof NoteVaultError && error.code === 'unavailable',
      )
      mode = 'throw'
      const providerFailure = await loaded.context.noteVault.revealEntry({
        expectedVault,
        path: 'Note.md',
      }, signal).catch((error: unknown) => error)
      assert.ok(providerFailure instanceof NoteVaultError)
      assert.equal(providerFailure.code, 'unavailable')
      assert.equal(providerFailure.message.includes(fixture), false)
      mode = 'throw-note-vault'
      const typedProviderFailure = await loaded.context.noteVault.revealEntry({
        expectedVault,
        path: 'Note.md',
      }, signal).catch((error: unknown) => error)
      assert.ok(typedProviderFailure instanceof NoteVaultError)
      assert.equal(typedProviderFailure.code, 'unavailable')
      assert.equal(typedProviderFailure.message.includes(fixture), false)

      mode = 'replace-file'
      await assert.rejects(
        loaded.context.noteVault.revealEntry({ expectedVault, path: 'Note.md' }, signal),
        (error: unknown) => error instanceof NoteVaultError && error.code === 'changed',
      )
      mode = 'replace-directory'
      await assert.rejects(
        loaded.context.noteVault.revealEntry({ expectedVault, path: 'Folder' }, signal),
        (error: unknown) => error instanceof NoteVaultError && error.code === 'changed',
      )

      const cancelled = new AbortController()
      cancelled.abort()
      const beforeCancelled = calls
      await assert.rejects(
        loaded.context.noteVault.revealEntry({ expectedVault, path: 'Note.md' }, cancelled.signal),
        (error: unknown) => error instanceof Error && error.name === 'AbortError',
      )
      assert.equal(calls, beforeCancelled)
    } finally {
      await dispose(loaded.context, loaded.root)
    }
  } finally {
    await rm(fixture, { recursive: true, force: true })
  }
})

test('Desktop reveal aborts pending effects on provider loss vault switch and runtime unload', async () => {
  const fixture = await mkdtemp(join(tmpdir(), 'note-vault-reveal-lifecycle-'))
  const firstVault = join(fixture, 'First')
  const secondVault = join(fixture, 'Second')
  try {
    await Promise.all([mkdir(firstVault), mkdir(secondVault)])
    await Promise.all([
      writeFile(join(firstVault, 'Note.md'), '# First\n'),
      writeFile(join(secondVault, 'Note.md'), '# Second\n'),
    ])
    const loaded = await load(`vaultRoot: ${JSON.stringify(firstVault)}`)
    try {
      let entered: (() => void) | undefined
      let providerCalls = 0
      let providerMode: 'immediate' | 'pending' = 'pending'
      class RevealOwner extends TockTeamDesktopReveal {
        async reveal(
          input: TockTeamDesktopRevealInput,
          signal: AbortSignal,
        ): Promise<TockTeamDesktopRevealResult> {
          providerCalls += 1
          entered?.()
          if (providerMode === 'immediate') {
            return { operationId: input.operationId, status: 'revealed' }
          }
          return await new Promise(resolve => signal.addEventListener('abort', () => {
            resolve({ operationId: input.operationId, status: 'cancelled' })
          }, { once: true }))
        }
      }
      let owner = loaded.context.plugin(RevealOwner)
      await owner
      const firstState = loaded.context.noteVault.state
      if (!firstState.active) assert.fail('configured vault must be active')
      const firstExpected = { id: firstState.id, generation: firstState.generation }
      const waitForEntry = () => new Promise<void>(resolve => { entered = resolve })

      let didEnter = waitForEntry()
      const lostProvider = loaded.context.noteVault.revealEntry({
        expectedVault: firstExpected,
        path: 'Note.md',
      }, new AbortController().signal)
      await didEnter
      await owner.dispose()
      await assert.rejects(
        lostProvider,
        (error: unknown) => error instanceof NoteVaultError && error.code === 'unavailable',
      )

      owner = loaded.context.plugin(RevealOwner)
      await owner
      didEnter = waitForEntry()
      const switched = loaded.context.noteVault.revealEntry({
        expectedVault: firstExpected,
        path: 'Note.md',
      }, new AbortController().signal)
      await didEnter
      const secondState = loaded.context.noteVault.activate(secondVault, 1)
      await assert.rejects(
        switched,
        (error: unknown) => error instanceof NoteVaultError && error.code === 'stale-vault',
      )
      if (!secondState.active) assert.fail('activated vault must be active')

      const externalAbort = new AbortController()
      didEnter = waitForEntry()
      const externallyCancelled = loaded.context.noteVault.revealEntry({
        expectedVault: { id: secondState.id, generation: secondState.generation },
        path: 'Note.md',
      }, externalAbort.signal)
      await didEnter
      externalAbort.abort()
      await assert.rejects(
        externallyCancelled,
        (error: unknown) => error instanceof Error && error.name === 'AbortError',
      )

      providerMode = 'immediate'
      const beforeUnload = providerCalls
      const unloaded = loaded.context.noteVault.revealEntry({
        expectedVault: { id: secondState.id, generation: secondState.generation },
        path: 'Note.md',
      }, new AbortController().signal)
      const runtimeEntry = [...loaded.context.loader.entries()]
        .find(item => item.options.name === packageName)
      if (runtimeEntry?.fiber === undefined) assert.fail('runtime Loader entry is not active')
      await runtimeEntry.fiber.dispose()
      await assert.rejects(
        unloaded,
        (error: unknown) => error instanceof NoteVaultError && error.code === 'unavailable',
      )
      assert.equal(providerCalls, beforeUnload)
      assert.equal(loaded.context.get('noteVault'), undefined)
    } finally {
      await dispose(loaded.context, loaded.root)
    }
  } finally {
    await rm(fixture, { recursive: true, force: true })
  }
})

test('an injected consumer opens one bounded Markdown document', async () => {
  const fixture = await mkdtemp(join(tmpdir(), 'note-vault-open-'))
  const notes = join(fixture, 'Notes')
  try {
    await mkdir(notes)
    await writeFile(join(notes, 'Plan.md'), '# Non-guessable plan\n')
    const loaded = await load(`vaultRoot: ${JSON.stringify(fixture)}`)
    try {
      let opened: Awaited<ReturnType<NoteVaultRuntime['openDocument']>> | undefined
      await loaded.context.plugin(Object.assign(
        async (consumer: Context) => {
          const state = consumer.noteVault.state
          if (!state.active) assert.fail('configured vault must be active')
          opened = await consumer.noteVault.openDocument(
            'Notes/Plan.md',
            { id: state.id, generation: state.generation },
            new AbortController().signal,
          )
        },
        { inject: ['noteVault'] },
      ))
      assert.ok(opened)
      assert.deepEqual(
        { content: opened.content, generation: opened.generation, path: opened.path },
        { content: '# Non-guessable plan\n', generation: 1, path: 'Notes/Plan.md' },
      )
      assert.match(opened.digest, /^sha256:[0-9a-f]{64}$/)
      assert.match(opened.revision, /^file:[0-9a-f]{64}$/)
    } finally {
      await dispose(loaded.context, loaded.root)
    }
  } finally {
    await rm(fixture, { recursive: true, force: true })
  }
})

test('document open rejects inactive or stale vaults and unsafe paths', async () => {
  const fixture = await mkdtemp(join(tmpdir(), 'note-vault-open-paths-'))
  try {
    await writeFile(join(fixture, 'Plan.md'), '# Plan\n')
    await writeFile(join(fixture, 'Plan.txt'), 'unsupported\n')
    const loaded = await load(`vaultRoot: ${JSON.stringify(fixture)}`)
    try {
      await loaded.context.plugin(Object.assign(
        async (consumer: Context) => {
          const state = consumer.noteVault.state
          if (!state.active) assert.fail('configured vault must be active')
          const expected = { id: state.id, generation: state.generation }
          const signal = new AbortController().signal
          for (const unsafePath of [
            '../Plan.md',
            './Plan.md',
            join(fixture, 'Plan.md'),
            'C:Plan.md',
            'C:\\Plan.md',
            'folder/../Plan.md',
            'Plan.md\0outside',
          ]) {
            await assert.rejects(
              consumer.noteVault.openDocument(unsafePath, expected, signal),
              /safe vault-relative document path|stay inside/i,
            )
          }
          await assert.rejects(
            consumer.noteVault.openDocument('Plan.txt', expected, signal),
            /Markdown, Canvas, or Base/i,
          )
          await assert.rejects(
            consumer.noteVault.openDocument('missing.md', { ...expected, generation: 0 }, signal),
            error => error instanceof NoteVaultError && error.code === 'stale-vault',
          )
          await assert.rejects(
            consumer.noteVault.openDocument('missing.md', { ...expected, id: 'vault:stale' }, signal),
            /active vault changed/i,
          )
        },
        { inject: ['noteVault'] },
      ))
    } finally {
      await dispose(loaded.context, loaded.root)
    }

    const inactive = await load('vaultRoot: null')
    try {
      await assert.rejects(
        inactive.context.noteVault.openDocument(
          'Plan.md',
          { id: 'vault:none', generation: 0 },
          new AbortController().signal,
        ),
        error => error instanceof NoteVaultError && error.code === 'inactive',
      )
    } finally {
      await dispose(inactive.context, inactive.root)
    }
  } finally {
    await rm(fixture, { recursive: true, force: true })
  }
})

test('document open permits only same-kind in-vault file aliases', async () => {
  const fixture = await mkdtemp(join(tmpdir(), 'note-vault-open-aliases-'))
  const vault = join(fixture, 'Vault')
  const outside = join(fixture, 'Outside')
  try {
    await mkdir(join(vault, 'Notes'), { recursive: true })
    await mkdir(outside)
    const canonical = join(vault, 'Notes', 'Canonical.markdown')
    await writeFile(canonical, '# Shared\n')
    await writeFile(join(outside, 'Outside.md'), '# Outside\n')
    await symlink(canonical, join(vault, 'Alias.md'))
    await symlink(join(outside, 'Outside.md'), join(vault, 'Escape.md'))
    await symlink(join(vault, 'Missing.md'), join(vault, 'Broken.md'))
    await symlink(canonical, join(vault, 'Cross.canvas'))
    await symlink(join(vault, 'Notes'), join(vault, 'Linked Notes'), process.platform === 'win32' ? 'junction' : 'dir')

    const loaded = await load(`vaultRoot: ${JSON.stringify(vault)}`)
    try {
      const state = loaded.context.noteVault.state
      if (!state.active) assert.fail('configured vault must be active')
      const expected = { id: state.id, generation: state.generation }
      const signal = new AbortController().signal
      const alias = await loaded.context.noteVault.openDocument('Alias.md', expected, signal)
      const canonicalDocument = await loaded.context.noteVault.openDocument(
        'Notes/Canonical.markdown',
        expected,
        signal,
      )
      assert.deepEqual(
        { content: alias.content, generation: alias.generation, path: alias.path },
        { content: '# Shared\n', generation: 1, path: 'Alias.md' },
      )
      assert.equal(alias.digest, canonicalDocument.digest)
      assert.equal(alias.revision, canonicalDocument.revision)
      await assert.rejects(
        loaded.context.noteVault.openDocument('Escape.md', expected, signal),
        /stay inside/i,
      )
      await assert.rejects(
        loaded.context.noteVault.openDocument('Broken.md', expected, signal),
        /could not be opened safely/i,
      )
      await assert.rejects(
        loaded.context.noteVault.openDocument('Cross.canvas', expected, signal),
        /same supported file type/i,
      )
      await assert.rejects(
        loaded.context.noteVault.openDocument('Linked Notes/Canonical.markdown', expected, signal),
        /folders cannot be symbolic links/i,
      )
    } finally {
      await dispose(loaded.context, loaded.root)
    }
  } finally {
    await rm(fixture, { recursive: true, force: true })
  }
})

test('document open enforces its byte bound and cancellation', async () => {
  const fixture = await mkdtemp(join(tmpdir(), 'note-vault-open-bounds-'))
  try {
    await writeFile(join(fixture, 'Exact.md'), '12345678')
    await writeFile(join(fixture, 'Oversized.md'), '123456789')
    const loaded = await load([
      `vaultRoot: ${JSON.stringify(fixture)}`,
      'maxReadBytes: 8',
    ].join('\n'))
    try {
      const state = loaded.context.noteVault.state
      if (!state.active) assert.fail('configured vault must be active')
      const expected = { id: state.id, generation: state.generation }
      assert.equal(
        (await loaded.context.noteVault.openDocument(
          'Exact.md',
          expected,
          new AbortController().signal,
        )).content,
        '12345678',
      )
      await assert.rejects(
        loaded.context.noteVault.openDocument(
          'Oversized.md',
          expected,
          new AbortController().signal,
        ),
        error => error instanceof NoteVaultError && error.code === 'too-large',
      )
      const controller = new AbortController()
      controller.abort()
      await assert.rejects(
        loaded.context.noteVault.openDocument('Exact.md', expected, controller.signal),
        error => error instanceof Error && error.name === 'AbortError',
      )
    } finally {
      await dispose(loaded.context, loaded.root)
    }
  } finally {
    await rm(fixture, { recursive: true, force: true })
  }
})

test('document open fails closed on growth, replacement, and vault-switch races', async () => {
  const fixture = await mkdtemp(join(tmpdir(), 'note-vault-open-races-'))
  const firstVault = join(fixture, 'First Vault')
  const secondVault = join(fixture, 'Second Vault')
  const outside = join(fixture, 'Outside.md')
  try {
    await mkdir(firstVault)
    await mkdir(secondVault)
    await writeFile(outside, '# Outside\n')
    const growing = join(firstVault, 'Growing.md')
    const cancelled = join(firstVault, 'Cancelled.md')
    const replaced = join(firstVault, 'Replaced.md')
    const switched = join(firstVault, 'Switched.md')
    await writeFile(growing, '1234')
    await writeFile(cancelled, 'stop')
    await writeFile(replaced, 'safe')
    await writeFile(switched, 'stay')
    const loaded = await load([
      `vaultRoot: ${JSON.stringify(firstVault)}`,
      'maxReadBytes: 8',
    ].join('\n'))
    try {
      const state = loaded.context.noteVault.state
      if (!state.active) assert.fail('configured vault must be active')
      const expected = { id: state.id, generation: state.generation }

      await duringFirstFileRead(
        growing,
        async () => appendFile(growing, '5678901234'),
        async () => assert.rejects(
          loaded.context.noteVault.openDocument(
            'Growing.md',
            expected,
            new AbortController().signal,
          ),
          /configured 8-byte limit|changed while it was being read/i,
        ),
      )

      const controller = new AbortController()
      await duringFirstFileRead(
        cancelled,
        () => controller.abort(),
        async () => assert.rejects(
          loaded.context.noteVault.openDocument('Cancelled.md', expected, controller.signal),
          error => error instanceof Error && error.name === 'AbortError',
        ),
      )

      await duringFirstFileRead(
        replaced,
        async () => {
          await rm(replaced)
          await symlink(outside, replaced)
        },
        async () => assert.rejects(
          loaded.context.noteVault.openDocument(
            'Replaced.md',
            expected,
            new AbortController().signal,
          ),
          /changed while it was being read/i,
        ),
      )

      await duringFirstFileRead(
        switched,
        () => { loaded.context.noteVault.activate(secondVault, 1) },
        async () => assert.rejects(
          loaded.context.noteVault.openDocument(
            'Switched.md',
            expected,
            new AbortController().signal,
          ),
          /active vault changed/i,
        ),
      )
    } finally {
      await dispose(loaded.context, loaded.root)
    }
  } finally {
    await rm(fixture, { recursive: true, force: true })
  }
})

test('an injected consumer lists deterministic bounded vault tree pages', async () => {
  const fixture = await mkdtemp(join(tmpdir(), 'note-vault-tree-'))
  try {
    await mkdir(join(fixture, 'Folder'))
    await writeFile(join(fixture, 'A.md'), '# A\n')
    await writeFile(join(fixture, 'Folder', 'B.base'), 'views: []\n')
    await writeFile(join(fixture, 'Z.canvas'), '{"nodes":[],"edges":[]}')
    const loaded = await load([
      `vaultRoot: ${JSON.stringify(fixture)}`,
      'maxTreeResults: 2',
    ].join('\n'))
    try {
      await loaded.context.plugin(Object.assign(
        async (consumer: Context) => {
          const state = consumer.noteVault.state
          if (!state.active) assert.fail('configured vault must be active')
          const expectedVault = { id: state.id, generation: state.generation }
          const signal = new AbortController().signal
          const first = await consumer.noteVault.listTree({ expectedVault, limit: 2 }, signal)
          assert.deepEqual(first.entries.map(entry => entry.path), ['A.md', 'Folder'])
          assert.equal(typeof first.cursor, 'string')
          const second = await consumer.noteVault.listTree({
            cursor: first.cursor,
            expectedVault,
            limit: 2,
          }, signal)
          assert.deepEqual(second.entries.map(entry => entry.path), ['Folder/B.base', 'Z.canvas'])
          assert.equal(second.cursor, null)
          assert.equal(second.generation, 1)
          assert.equal(JSON.stringify([first, second]).includes(fixture), false)

          const beforeMutation = await consumer.noteVault.listTree({ expectedVault, limit: 2 }, signal)
          await writeFile(join(fixture, 'Changed.md'), '# Changed\n')
          await assert.rejects(
            consumer.noteVault.listTree({
              cursor: beforeMutation.cursor,
              expectedVault,
              limit: 2,
            }, signal),
            error => error instanceof NoteVaultError && error.code === 'changed',
          )
        },
        { inject: ['noteVault'] },
      ))
    } finally {
      await dispose(loaded.context, loaded.root)
    }
  } finally {
    await rm(fixture, { recursive: true, force: true })
  }
})

test('vault tree skips hidden and unsafe links while listing accepted attachments', async () => {
  const fixture = await mkdtemp(join(tmpdir(), 'note-vault-tree-links-'))
  const vault = join(fixture, 'Vault')
  const outside = join(fixture, 'Outside')
  try {
    await mkdir(vault)
    await mkdir(outside)
    await mkdir(join(vault, '.hidden'))
    await writeFile(join(vault, 'Visible.md'), '# Visible\n')
    await writeFile(join(vault, 'Image.png'), 'png')
    await writeFile(join(vault, 'ignore.txt'), 'ignored')
    await writeFile(join(vault, '.secret.md'), '# Secret\n')
    await writeFile(join(vault, '.hidden', 'Nested.md'), '# Nested\n')
    await writeFile(join(outside, 'Outside.md'), '# Outside\n')
    await symlink(join(vault, 'Image.png'), join(vault, 'Alias.png'))
    await symlink(join(outside, 'Outside.md'), join(vault, 'Escape.md'))
    for (let index = 0; index < 24; index += 1) {
      await symlink(
        join(outside, 'Outside.md'),
        join(vault, `Escape-${index.toString().padStart(2, '0')}.md`),
      )
    }
    await symlink(outside, join(vault, 'Linked'), process.platform === 'win32' ? 'junction' : 'dir')
    const loaded = await load(`vaultRoot: ${JSON.stringify(vault)}`)
    try {
      const state = loaded.context.noteVault.state
      if (!state.active) assert.fail('configured vault must be active')
      const page = await loaded.context.noteVault.listTree({
        expectedVault: { id: state.id, generation: state.generation },
        limit: 100,
      }, new AbortController().signal)
      assert.deepEqual(page.entries.map(entry => entry.path), [
        'Alias.png',
        'Image.png',
        'Visible.md',
      ])
      assert.equal(page.entries.filter(entry => entry.kind === 'attachment').length, 2)
      assert.equal(page.entries.some(entry => entry.path.includes('.secret')), false)
      assert.equal(page.entries.some(entry => entry.path.includes('Nested')), false)
      assert.equal(page.entries.some(entry => entry.path.includes('Escape')), false)
      assert.equal(page.warnings.length, 20)
      assert.equal(page.warnings.some(warning => warning.startsWith('Escape')), true)
      assert.equal(JSON.stringify(page).includes(vault), false)
    } finally {
      await dispose(loaded.context, loaded.root)
    }
  } finally {
    await rm(fixture, { recursive: true, force: true })
  }
})

test('passive backup authority lists, reads, and exclusively restores only inert Obsidian config bytes', async () => {
  const fixture = await mkdtemp(join(tmpdir(), 'note-vault-passive-backup-'))
  const vault = join(fixture, 'Vault')
  const secondVault = join(fixture, 'Second')
  try {
    await mkdir(join(vault, '.obsidian', 'plugins', 'demo'), { recursive: true })
    await mkdir(join(vault, '.obsidian', '.cache'), { recursive: true })
    await mkdir(join(vault, '.obsidian-dev', 'themes', 'Safe'), { recursive: true })
    await mkdir(secondVault)
    const dataPath = join(vault, '.obsidian', 'plugins', 'demo', 'data.json')
    await writeFile(dataPath, '{"enabled":true}\n')
    await writeFile(join(vault, '.obsidian-dev', 'themes', 'Safe', 'theme.css'), ':root {}\n')
    await writeFile(join(vault, '.obsidian', 'plugins', 'demo', 'main.js'), 'throw new Error()')
    await writeFile(join(vault, '.obsidian', 'plugins', 'demo', 'module.wasm'), 'wasm')
    await writeFile(join(vault, '.obsidian', 'plugins', 'demo', 'native.node'), 'native')
    await writeFile(join(vault, '.obsidian', 'plugins', 'demo', 'icon.svg'), '<svg/>')
    await writeFile(join(vault, '.obsidian', '.cache', 'state.json'), '{}')
    await writeFile(join(vault, '.obsidian', 'A.json'), '{}')
    await writeFile(join(vault, '.obsidian', 'Ａ.json'), '{}')
    await symlink(dataPath, join(vault, '.obsidian', 'plugins', 'demo', 'alias.json'))
    await symlink(join(vault, '.obsidian'), join(vault, '.obsidian-alias'), process.platform === 'win32' ? 'junction' : 'dir')

    const loaded = await load(`vaultRoot: ${JSON.stringify(vault)}`)
    try {
      const state = loaded.context.noteVault.state
      if (!state.active) assert.fail('configured vault must be active')
      const expectedVault = { id: state.id, generation: state.generation }
      const signal = new AbortController().signal

      await assert.rejects(
        loaded.context.noteVault.listPassiveBackupEntries({ expectedVault }, signal),
        error => error instanceof NoteVaultError && error.code === 'unsafe-target',
      )
      await rm(join(vault, '.obsidian', 'Ａ.json'))

      const listed = await loaded.context.noteVault.listPassiveBackupEntries({ expectedVault }, signal)
      assert.deepEqual(listed.entries.map(entry => entry.path), [
        '.obsidian-dev/themes/Safe/theme.css',
        '.obsidian/A.json',
        '.obsidian/plugins/demo/data.json',
      ])
      assert.equal(listed.generation, state.generation)
      assert.equal(JSON.stringify(listed).includes(vault), false)

      const data = listed.entries.find(entry => entry.path.endsWith('/data.json'))
      assert.ok(data)
      const read = await loaded.context.noteVault.readPassiveBackupEntry({
        expectedRevision: data.revision,
        expectedVault,
        path: data.path,
      }, signal)
      assert.equal(new TextDecoder().decode(read.data), '{"enabled":true}\n')
      assert.equal(read.digest, 'sha256:a050ef06ea542b8fd8781f1e945f9adcd03c7ae5190719e66ba826e2059fce12')

      await assert.rejects(
        loaded.context.noteVault.readPassiveBackupEntry({
          expectedRevision: 'file:changed',
          expectedVault,
          path: data.path,
        }, signal),
        error => error instanceof NoteVaultError && error.code === 'changed',
      )
      await assert.rejects(
        loaded.context.noteVault.readPassiveBackupEntry({
          expectedRevision: data.revision,
          expectedVault,
          path: '.obsidian/plugins/demo/alias.json',
        }, signal),
        error => error instanceof NoteVaultError && error.code === 'unsafe-target',
      )

      const restored = await loaded.context.noteVault.restorePassiveBackupEntry({
        data: new TextEncoder().encode('{"restored":true}\n'),
        expectedVault,
        path: '.obsidian/preferences/imported.json',
      }, signal)
      assert.equal(restored.status, 'restored')
      assert.equal(await readFile(join(vault, '.obsidian', 'preferences', 'imported.json'), 'utf8'), '{"restored":true}\n')
      await assert.rejects(
        loaded.context.noteVault.restorePassiveBackupEntry({
          data: new Uint8Array(),
          expectedVault,
          path: '.obsidian/preferences/imported.json',
        }, signal),
        error => error instanceof NoteVaultError && error.code === 'exists',
      )
      for (const rejected of ['main.js', 'module.wasm', 'native.node', 'icon.svg']) {
        await assert.rejects(
          loaded.context.noteVault.restorePassiveBackupEntry({
            data: new Uint8Array(),
            expectedVault,
            path: `.obsidian/${rejected}`,
          }, signal),
          error => error instanceof NoteVaultError && error.code === 'unsupported-type',
        )
      }
      await assert.rejects(
        loaded.context.noteVault.restorePassiveBackupEntry({
          data: new Uint8Array(),
          expectedVault,
          path: '.obsidian/.hidden/state.json',
        }, signal),
        error => error instanceof NoteVaultError && error.code === 'unsupported-type',
      )
      await assert.rejects(
        loaded.context.noteVault.listPassiveBackupEntries({
          expectedVault: { ...expectedVault, generation: 0 },
        }, signal),
        error => error instanceof NoteVaultError && error.code === 'stale-vault',
      )

      await duringFirstFileRead(
        dataPath,
        () => { loaded.context.noteVault.activate(secondVault, state.generation) },
        async () => assert.rejects(
          loaded.context.noteVault.readPassiveBackupEntry({
            expectedRevision: data.revision,
            expectedVault,
            path: data.path,
          }, signal),
          error => error instanceof NoteVaultError && error.code === 'stale-vault',
        ),
      )
    } finally {
      await dispose(loaded.context, loaded.root)
    }
  } finally {
    await rm(fixture, { recursive: true, force: true })
  }
})

test('vault tree reports entry and depth truncation with bound cursors', async () => {
  const fixture = await mkdtemp(join(tmpdir(), 'note-vault-tree-bounds-'))
  try {
    await mkdir(join(fixture, 'Folder'))
    await writeFile(join(fixture, 'A.md'), 'A')
    await writeFile(join(fixture, 'B.md'), 'B')
    await writeFile(join(fixture, 'C.md'), 'C')
    await writeFile(join(fixture, 'D.md'), 'D')
    await writeFile(join(fixture, 'Folder', 'Nested.md'), 'N')
    const bounded = await load([
      `vaultRoot: ${JSON.stringify(fixture)}`,
      'maxTreeEntries: 3',
      'maxTreeResults: 2',
    ].join('\n'))
    try {
      const state = bounded.context.noteVault.state
      if (!state.active) assert.fail('configured vault must be active')
      const expectedVault = { id: state.id, generation: state.generation }
      const first = await bounded.context.noteVault.listTree({ expectedVault }, new AbortController().signal)
      const firstPaths = first.entries.map(entry => entry.path)
      assert.equal(firstPaths.length, 2)
      assert.deepEqual(firstPaths, [...firstPaths].sort((left, right) => left.localeCompare(right)))
      const repeated = await bounded.context.noteVault.listTree({ expectedVault }, new AbortController().signal)
      assert.deepEqual(repeated.entries.map(entry => entry.path), firstPaths)
      assert.equal(repeated.cursor, first.cursor)
      assert.equal(first.truncated, true)
      assert.equal(first.truncationReason, 'entry-limit')
      assert.equal(first.scan.entries, 3)
      assert.equal(typeof first.cursor, 'string')
      const second = await bounded.context.noteVault.listTree({
        cursor: first.cursor,
        expectedVault,
      }, new AbortController().signal)
      assert.equal(second.entries.length, 1)
      assert.equal(firstPaths.includes(second.entries[0]?.path ?? ''), false)
      assert.equal(second.cursor, null)
      assert.equal(second.truncationReason, 'entry-limit')
      await assert.rejects(
        bounded.context.noteVault.listTree({ cursor: 'invalid', expectedVault }, new AbortController().signal),
        error => error instanceof NoteVaultError && error.code === 'invalid-path',
      )
    } finally {
      await dispose(bounded.context, bounded.root)
    }

    const shallow = await load([
      `vaultRoot: ${JSON.stringify(fixture)}`,
      'maxTreeDepth: 1',
    ].join('\n'))
    try {
      const state = shallow.context.noteVault.state
      if (!state.active) assert.fail('configured vault must be active')
      const page = await shallow.context.noteVault.listTree({
        expectedVault: { id: state.id, generation: state.generation },
      }, new AbortController().signal)
      assert.equal(page.entries.some(entry => entry.path === 'Folder'), true)
      assert.equal(page.entries.some(entry => entry.path === 'Folder/Nested.md'), false)
      assert.equal(page.truncationReason, 'depth-limit')
    } finally {
      await dispose(shallow.context, shallow.root)
    }
  } finally {
    await rm(fixture, { recursive: true, force: true })
  }
})

test('vault tree honors cancellation and rejects a vault switch during scanning', async () => {
  const fixture = await mkdtemp(join(tmpdir(), 'note-vault-tree-stale-'))
  const firstVault = join(fixture, 'First')
  const secondVault = join(fixture, 'Second')
  try {
    await mkdir(firstVault)
    await mkdir(secondVault)
    const note = join(firstVault, 'Note.md')
    await writeFile(note, '# Note\n')
    const loaded = await load(`vaultRoot: ${JSON.stringify(firstVault)}`)
    try {
      const state = loaded.context.noteVault.state
      if (!state.active) assert.fail('configured vault must be active')
      const expectedVault = { id: state.id, generation: state.generation }
      const controller = new AbortController()
      controller.abort()
      await assert.rejects(
        loaded.context.noteVault.listTree({ expectedVault }, controller.signal),
        error => error instanceof Error && error.name === 'AbortError',
      )
      await duringFirstFileStat(
        note,
        () => { loaded.context.noteVault.activate(secondVault, 1) },
        async () => assert.rejects(
          loaded.context.noteVault.listTree({ expectedVault }, new AbortController().signal),
          error => error instanceof NoteVaultError && error.code === 'stale-vault',
        ),
      )
    } finally {
      await dispose(loaded.context, loaded.root)
    }
  } finally {
    await rm(fixture, { recursive: true, force: true })
  }
})

test('shared vault inspection runs all eight contracts through generation-bound runtime authority', async () => {
  const fixture = await mkdtemp(join(tmpdir(), 'note-vault-inspection-'))
  const secondVault = await mkdtemp(join(tmpdir(), 'note-vault-inspection-second-'))
  try {
    await mkdir(join(fixture, 'notes'))
    await writeFile(join(fixture, 'notes', 'Alpha.md'), [
      '---',
      'tags: [canary, project/runtime]',
      'status: active',
      '---',
      '# Alpha',
      'canary body',
      '![[image.png]]',
      '[[Beta]]',
      '',
    ].join('\n'))
    await writeFile(join(fixture, 'notes', 'Beta.md'), '# Beta\ncanary backlink\n')
    await writeFile(join(fixture, 'Board.canvas'), JSON.stringify({
      nodes: [{ id: 'n1', type: 'text', text: 'canvas canary', x: 0, y: 0 }],
      edges: [],
    }))
    await writeFile(join(fixture, 'View.base'), 'filters:\n  and:\n    - status == "active"\n')
    await writeFile(join(fixture, 'image.png'), Buffer.from([1, 2, 3]))

    const loaded = await load(`vaultRoot: ${JSON.stringify(fixture)}`)
    try {
      const state = loaded.context.noteVault.state
      if (!state.active) assert.fail('configured vault must be active')
      const expectedVault = { id: state.id, generation: state.generation }
      const signal = new AbortController().signal
      const search = await loaded.context.noteVault.search(
        { query: 'canary' }, expectedVault, signal,
      )
      assert.equal(search.generation, 1)
      assert.equal(search.matches.some(match => match.path === 'notes/Alpha.md'), true)

      const read = await loaded.context.noteVault.read(
        { path: 'notes/Alpha.md', heading: 'Alpha' }, expectedVault, signal,
      )
      assert.equal(read.generation, 1)
      assert.match(read.content, /^# Alpha/mu)

      const listed = await loaded.context.noteVault.list(
        { kind: 'all' }, expectedVault, signal,
      )
      assert.equal(listed.generation, 1)
      assert.equal(listed.entries.some(entry => entry.path === 'image.png' && entry.type === 'attachment'), true)

      const links = await loaded.context.noteVault.links(
        { path: 'notes/Alpha.md' }, expectedVault, signal,
      )
      assert.equal(links.generation, 1)
      assert.equal(links.outgoing.includes('notes/Beta.md'), true)

      const outline = await loaded.context.noteVault.outline(
        { path: 'notes/Alpha.md' }, expectedVault, signal,
      )
      assert.equal(outline.generation, 1)
      assert.equal(outline.headings[0]?.text, 'Alpha')

      const graph = await loaded.context.noteVault.graph(
        { includeAttachments: true, scope: 'global' }, expectedVault, signal,
      )
      assert.equal(graph.generation, 1)
      assert.equal(graph.nodes.some(node => node.path === 'image.png'), true)

      const canvas = await loaded.context.noteVault.canvas(
        { path: 'Board.canvas' }, expectedVault, signal,
      )
      assert.equal(canvas.generation, 1)
      assert.equal(canvas.items[0]?.text, 'canvas canary')

      const facets = await loaded.context.noteVault.facets({}, expectedVault, signal)
      assert.equal(facets.generation, 1)
      assert.equal(facets.tags.some(entry => entry.tag === 'canary'), true)

      let unsafeRegexRead = false
      await duringFirstFileRead(
        join(fixture, 'notes', 'Alpha.md'),
        () => { unsafeRegexRead = true },
        async () => assert.rejects(
          loaded.context.noteVault.search({
            mode: 'query',
            query: '^a{0,64}a{0,64}a{0,64}a{0,64}b$',
            regex: true,
          }, expectedVault, signal),
          /unsafe search regex/u,
        ),
      )
      assert.equal(unsafeRegexRead, false)
      const aborted = new AbortController()
      aborted.abort()
      await assert.rejects(
        loaded.context.noteVault.search({ query: 'canary' }, expectedVault, aborted.signal),
        error => error instanceof Error && error.name === 'AbortError',
      )

      await duringFirstFileRead(
        join(fixture, 'notes', 'Alpha.md'),
        () => { loaded.context.noteVault.activate(secondVault, 1) },
        async () => assert.rejects(
          loaded.context.noteVault.search({ query: 'canary' }, expectedVault, signal),
          error => error instanceof NoteVaultError && error.code === 'stale-vault',
        ),
      )
    } finally {
      await dispose(loaded.context, loaded.root)
    }
  } finally {
    await rm(fixture, { recursive: true, force: true })
    await rm(secondVault, { recursive: true, force: true })
  }
})

test('shared inspection drains fingerprinted runtime inventory pages', async () => {
  const fixture = await mkdtemp(join(tmpdir(), 'note-vault-inspection-pages-'))
  try {
    await Promise.all(Array.from({ length: 205 }, async (_, index) => {
      const suffix = String(index).padStart(3, '0')
      await writeFile(
        join(fixture, `Document-${suffix}.md`),
        index === 204 ? 'second-page-canary' : `document ${suffix}`,
      )
    }))
    const loaded = await load(`vaultRoot: ${JSON.stringify(fixture)}`)
    try {
      const state = loaded.context.noteVault.state
      if (!state.active) assert.fail('configured vault must be active')
      const result = await loaded.context.noteVault.search(
        { query: 'second-page-canary' },
        { id: state.id, generation: state.generation },
        new AbortController().signal,
      )
      assert.equal(result.matches[0]?.path, 'Document-204.md')
      assert.equal(result.scan.entries, 205)
      assert.equal(result.generation, 1)
    } finally {
      await dispose(loaded.context, loaded.root)
    }
  } finally {
    await rm(fixture, { recursive: true, force: true })
  }
})

test('shared inspection globally orders nested inventory after directories are filtered', async () => {
  const fixture = await mkdtemp(join(tmpdir(), 'note-vault-inspection-order-'))
  try {
    await mkdir(join(fixture, 'A'))
    await writeFile(join(fixture, 'A', 'child.md'), 'nested canary')
    await writeFile(join(fixture, 'A-.md'), 'sibling canary')
    const loaded = await load(`vaultRoot: ${JSON.stringify(fixture)}`)
    try {
      const state = loaded.context.noteVault.state
      if (!state.active) assert.fail('configured vault must be active')
      const result = await loaded.context.noteVault.search(
        { query: 'canary' },
        { id: state.id, generation: state.generation },
        new AbortController().signal,
      )
      assert.deepEqual(result.matches.map(match => match.path), ['A-.md', 'A/child.md'])
    } finally {
      await dispose(loaded.context, loaded.root)
    }
  } finally {
    await rm(fixture, { recursive: true, force: true })
  }
})

test('watcher and runtime events rebind by generation and dispose with the provider', async () => {
  const fixture = await mkdtemp(join(tmpdir(), 'note-vault-events-'))
  const firstVault = join(fixture, 'First')
  const secondVault = join(fixture, 'Second')
  try {
    await mkdir(firstVault)
    await mkdir(secondVault)
    await writeFile(join(firstVault, 'Existing.md'), '# Before\n')
    const loaded = await load(`vaultRoot: ${JSON.stringify(firstVault)}`)
    const events: NoteVaultChangeEvent[] = []
    try {
      loaded.context.on('note-vault/change', event => { events.push(event) })
      const state = loaded.context.noteVault.state
      if (!state.active) assert.fail('configured vault must be active')
      const expectedVault = { id: state.id, generation: state.generation }
      const signal = new AbortController().signal
      const created = await loaded.context.noteVault.createDocument({
        content: '# Created\n',
        expectedVault,
        path: 'Created.md',
      }, signal)
      assert.equal(events.some(event => (
        event.kind === 'entry'
        && event.action === 'created'
        && event.path === created.path
        && event.vault.generation === 1
      )), true)

      const opened = await loaded.context.noteVault.openDocument('Existing.md', expectedVault, signal)
      await loaded.context.noteVault.saveDocument({
        content: '# Updated\n',
        expectedRevision: opened.revision,
        expectedVault,
        path: 'Existing.md',
      }, signal)
      assert.equal(events.some(event => (
        event.kind === 'entry'
        && event.action === 'updated'
        && event.path === 'Existing.md'
      )), true)

      events.length = 0
      await writeFile(join(firstVault, 'External.md'), '# External\n')
      await waitUntil(() => events.some(event => (
        event.kind === 'entry'
        && event.path === 'External.md'
        && event.action.startsWith('external-')
      )))
      assert.equal(JSON.stringify(events).includes(firstVault), false)

      events.length = 0
      const secondState = loaded.context.noteVault.activate(secondVault, 1)
      assert.equal(secondState.active, true)
      assert.equal(events.some(event => (
        event.kind === 'vault'
        && event.action === 'activated'
        && event.vault.generation === 2
      )), true)
      events.length = 0
      await writeFile(join(firstVault, 'Stale.md'), '# Stale\n')
      await new Promise(resolve => setTimeout(resolve, 100))
      assert.equal(events.some(event => event.vault.generation === 1), false)
      await writeFile(join(secondVault, 'Current.md'), '# Current\n')
      await waitUntil(() => events.some(event => (
        event.kind === 'entry'
        && event.path === 'Current.md'
        && event.vault.generation === 2
      )))

      const runtime = [...loaded.context.loader.entries()]
        .find(entry => entry.options.name === packageName)
      if (runtime?.fiber === undefined) throw new Error('runtime Loader entry is not active')
      await runtime.fiber.dispose()
      assert.equal(loaded.context.get('noteVault'), undefined)
      events.length = 0
      await writeFile(join(secondVault, 'After Dispose.md'), '# Disposed\n')
      await new Promise(resolve => setTimeout(resolve, 100))
      assert.deepEqual(events, [])
    } finally {
      await dispose(loaded.context, loaded.root)
    }
  } finally {
    await rm(fixture, { recursive: true, force: true })
  }
})

test('an injected consumer moves and duplicates regular files and safe aliases exclusively', async () => {
  const fixture = await mkdtemp(join(tmpdir(), 'note-vault-file-mutations-'))
  try {
    await writeFile(join(fixture, 'Source.md'), '# Source\n')
    await writeFile(join(fixture, 'Canonical.md'), '# Canonical\n')
    await symlink(join(fixture, 'Canonical.md'), join(fixture, 'Alias.markdown'))
    const loaded = await load(`vaultRoot: ${JSON.stringify(fixture)}`)
    try {
      const state = loaded.context.noteVault.state
      if (!state.active) assert.fail('configured vault must be active')
      const expectedVault = { id: state.id, generation: state.generation }
      const signal = new AbortController().signal
      const tree = await loaded.context.noteVault.listTree({ expectedVault, limit: 100 }, signal)
      const source = tree.entries.find(entry => entry.path === 'Source.md')
      const alias = tree.entries.find(entry => entry.path === 'Alias.markdown')
      if (source?.kind !== 'document' || alias?.kind !== 'document') {
        assert.fail('source and alias must be listed documents')
      }

      const moved = await loaded.context.noteVault.moveFile({
        expectedRevision: source.revision,
        expectedVault,
        fromPath: 'Source.md',
        toPath: 'Moved.md',
      }, signal)
      assert.equal(moved.status, 'moved')
      assert.equal(await readFile(join(fixture, 'Moved.md'), 'utf8'), '# Source\n')
      await assert.rejects(lstat(join(fixture, 'Source.md')), { code: 'ENOENT' })

      const duplicated = await loaded.context.noteVault.duplicateFile({
        expectedRevision: moved.revision,
        expectedVault,
        fromPath: 'Moved.md',
        toPath: 'Copy.md',
      }, signal)
      assert.equal(duplicated.status, 'duplicated')
      assert.equal(await readFile(join(fixture, 'Copy.md'), 'utf8'), '# Source\n')

      const movedAlias = await loaded.context.noteVault.moveFile({
        expectedRevision: alias.revision,
        expectedVault,
        fromPath: 'Alias.markdown',
        toPath: 'Renamed Alias.md',
      }, signal)
      assert.equal(movedAlias.status, 'moved')
      assert.equal((await lstat(join(fixture, 'Renamed Alias.md'))).isSymbolicLink(), true)
      assert.equal(await readFile(join(fixture, 'Canonical.md'), 'utf8'), '# Canonical\n')
    } finally {
      await dispose(loaded.context, loaded.root)
    }
  } finally {
    await rm(fixture, { recursive: true, force: true })
  }
})

test('file moves apply shared link plans with recovery evidence', async () => {
  const fixture = await mkdtemp(join(tmpdir(), 'note-vault-file-rewrite-'))
  try {
    await mkdir(join(fixture, 'Projects'))
    await writeFile(join(fixture, 'Index.md'), [
      '[Plan](./Plan.md)',
      '[plan-ref]: ./Plan.md#overview',
      '',
    ].join('\n'))
    await writeFile(join(fixture, 'Other.md'), '# Other\n')
    await writeFile(join(fixture, 'Plan.md'), '# Plan\n[Other](./Other.md)\n')
    const loaded = await load(`vaultRoot: ${JSON.stringify(fixture)}`)
    try {
      const state = loaded.context.noteVault.state
      if (!state.active) assert.fail('configured vault must be active')
      const expectedVault = { id: state.id, generation: state.generation }
      const opened = await loaded.context.noteVault.openDocument(
        'Plan.md', expectedVault, new AbortController().signal,
      )
      const result = await loaded.context.noteVault.moveFileWithLinkRewrite({
        expectedRevision: opened.revision,
        expectedVault,
        fromPath: 'Plan.md',
        toPath: 'Projects/Plan.md',
      }, new AbortController().signal)
      assert.equal(result.status, 'moved')
      assert.equal(result.path, 'Projects/Plan.md')
      assert.equal(result.rewriteError, undefined)
      assert.deepEqual(result.rewrittenPaths, ['Index.md', 'Projects/Plan.md'])
      assert.deepEqual(
        result.rewriteSnapshots.map(entry => entry.path),
        ['Index.md', 'Plan.md'],
      )
      assert.match(await readFile(join(fixture, 'Index.md'), 'utf8'), /\.\/Projects\/Plan\.md/u)
      assert.match(await readFile(join(fixture, 'Projects', 'Plan.md'), 'utf8'), /\.\.\/Other\.md/u)
      const final = await loaded.context.noteVault.openDocument(
        'Projects/Plan.md', expectedVault, new AbortController().signal,
      )
      assert.equal(result.revision, final.revision)
      for (const snapshot of result.rewriteSnapshots) {
        const listed = await loaded.context.noteVault.listSnapshots({
          expectedVault,
          path: snapshot.path,
        }, new AbortController().signal)
        assert.equal(listed.snapshots.some(entry => entry.id === snapshot.snapshotId), true)
      }
    } finally {
      await dispose(loaded.context, loaded.root)
    }
  } finally {
    await rm(fixture, { recursive: true, force: true })
  }
})

test('link rewrites never apply a conflicting logical alias plan to its canonical file', async () => {
  const fixture = await mkdtemp(join(tmpdir(), 'note-vault-rewrite-alias-'))
  try {
    await mkdir(join(fixture, 'Moved'))
    await mkdir(join(fixture, 'deep'))
    await writeFile(join(fixture, 'Index.md'), '[Plan](../Plan.md)\n')
    await writeFile(join(fixture, 'Plan.md'), '# Plan\n')
    await symlink('../Index.md', join(fixture, 'deep', 'Alias.md'))
    const loaded = await load(`vaultRoot: ${JSON.stringify(fixture)}`)
    try {
      const state = loaded.context.noteVault.state
      if (!state.active) assert.fail('configured vault must be active')
      const expectedVault = { id: state.id, generation: state.generation }
      const source = await loaded.context.noteVault.openDocument(
        'Plan.md', expectedVault, new AbortController().signal,
      )
      const result = await loaded.context.noteVault.moveFileWithLinkRewrite({
        expectedRevision: source.revision,
        expectedVault,
        fromPath: 'Plan.md',
        toPath: 'Moved/Plan.md',
      }, new AbortController().signal)
      assert.equal(result.status, 'moved')
      assert.match(result.rewriteError ?? '', /physically conflicting alias/u)
      assert.deepEqual(result.rewrittenPaths, [])
      assert.deepEqual(result.rewriteSnapshots, [])
      assert.equal(await readFile(join(fixture, 'Index.md'), 'utf8'), '[Plan](../Plan.md)\n')
      assert.equal(await readFile(join(fixture, 'deep', 'Alias.md'), 'utf8'), '[Plan](../Plan.md)\n')
      assert.equal((await lstat(join(fixture, 'Moved', 'Plan.md'))).isFile(), true)
    } finally {
      await dispose(loaded.context, loaded.root)
    }
  } finally {
    await rm(fixture, { recursive: true, force: true })
  }
})

test('physically identical alias rewrites save once and report every agreeing logical path', async () => {
  const fixture = await mkdtemp(join(tmpdir(), 'note-vault-rewrite-alias-agree-'))
  try {
    await mkdir(join(fixture, 'Moved'))
    await writeFile(join(fixture, 'Index.md'), '[Plan](./Plan.md)\n')
    await symlink('Index.md', join(fixture, 'Alias.md'))
    await writeFile(join(fixture, 'Plan.md'), '# Plan\n')
    const loaded = await load(`vaultRoot: ${JSON.stringify(fixture)}`)
    try {
      const state = loaded.context.noteVault.state
      if (!state.active) assert.fail('configured vault must be active')
      const expectedVault = { id: state.id, generation: state.generation }
      const source = await loaded.context.noteVault.openDocument(
        'Plan.md', expectedVault, new AbortController().signal,
      )
      const result = await loaded.context.noteVault.moveFileWithLinkRewrite({
        expectedRevision: source.revision,
        expectedVault,
        fromPath: 'Plan.md',
        toPath: 'Moved/Plan.md',
      }, new AbortController().signal)
      assert.equal(result.rewriteError, undefined)
      assert.deepEqual(result.rewrittenPaths, ['Alias.md', 'Index.md'])
      assert.equal(result.rewriteSnapshots.length, 1)
      assert.equal((await lstat(join(fixture, 'Alias.md'))).isSymbolicLink(), true)
      assert.equal(await readFile(join(fixture, 'Alias.md'), 'utf8'), '[Plan](./Moved/Plan.md)\n')
      assert.equal(await readFile(join(fixture, 'Index.md'), 'utf8'), '[Plan](./Moved/Plan.md)\n')
    } finally {
      await dispose(loaded.context, loaded.root)
    }
  } finally {
    await rm(fixture, { recursive: true, force: true })
  }
})

test('stale referrer conflicts report the completed move and pre-link rollback snapshot', async () => {
  const fixture = await mkdtemp(join(tmpdir(), 'note-vault-rewrite-conflict-'))
  try {
    await mkdir(join(fixture, 'Moved'))
    await writeFile(join(fixture, 'Index.md'), '[Plan](./Plan.md)\n')
    await writeFile(join(fixture, 'Plan.md'), '# Plan\n')
    const loaded = await load(`vaultRoot: ${JSON.stringify(fixture)}`)
    try {
      const state = loaded.context.noteVault.state
      if (!state.active) assert.fail('configured vault must be active')
      const expectedVault = { id: state.id, generation: state.generation }
      const source = await loaded.context.noteVault.openDocument(
        'Plan.md', expectedVault, new AbortController().signal,
      )
      let movedObserved = false
      loaded.context.on('note-vault/change', event => {
        if (event.kind === 'entry' && event.action === 'moved') movedObserved = true
      })
      let result: Awaited<ReturnType<typeof loaded.context.noteVault.moveFileWithLinkRewrite>> | undefined
      await duringFirstFileSyncWhen(
        join(fixture, 'Index.md'),
        () => movedObserved,
        async () => { await writeFile(join(fixture, 'Index.md'), 'concurrent referrer\n') },
        async () => {
          result = await loaded.context.noteVault.moveFileWithLinkRewrite({
            expectedRevision: source.revision,
            expectedVault,
            fromPath: 'Plan.md',
            toPath: 'Moved/Plan.md',
          }, new AbortController().signal)
        },
      )
      if (result === undefined) assert.fail('move result must be returned')
      assert.equal(result.status, 'moved')
      assert.match(result.rewriteError ?? '', /changed|conflict/u)
      assert.deepEqual(result.rewrittenPaths, [])
      assert.equal(await readFile(join(fixture, 'Index.md'), 'utf8'), 'concurrent referrer\n')
      assert.equal((await lstat(join(fixture, 'Moved', 'Plan.md'))).isFile(), true)
      const rollback = result.rewriteSnapshots.find(entry => entry.path === 'Index.md')
      if (rollback === undefined) assert.fail('pre-link rollback snapshot must be reported')
      const snapshot = await loaded.context.noteVault.readSnapshot({
        expectedVault,
        path: rollback.path,
        snapshotId: rollback.snapshotId,
      }, new AbortController().signal)
      assert.equal(snapshot.content, '[Plan](./Plan.md)\n')
      assert.equal(snapshot.snapshot.reason, 'pre-link-rewrite')
    } finally {
      await dispose(loaded.context, loaded.root)
    }
  } finally {
    await rm(fixture, { recursive: true, force: true })
  }
})

test('vault switches after a committed move are returned as explicit rewrite partials', async () => {
  const fixture = await mkdtemp(join(tmpdir(), 'note-vault-rewrite-switch-'))
  const secondVault = await mkdtemp(join(tmpdir(), 'note-vault-rewrite-switch-second-'))
  try {
    await mkdir(join(fixture, 'Moved'))
    await writeFile(join(fixture, 'Index.md'), '[Plan](./Plan.md)\n')
    await writeFile(join(fixture, 'Plan.md'), '# Plan\n')
    const loaded = await load(`vaultRoot: ${JSON.stringify(fixture)}`)
    try {
      const state = loaded.context.noteVault.state
      if (!state.active) assert.fail('configured vault must be active')
      const expectedVault = { id: state.id, generation: state.generation }
      const source = await loaded.context.noteVault.openDocument(
        'Plan.md', expectedVault, new AbortController().signal,
      )
      let activated = false
      loaded.context.on('note-vault/change', event => {
        if (!activated && event.kind === 'entry' && event.action === 'moved') {
          activated = true
          loaded.context.noteVault.activate(secondVault, 1)
        }
      })
      const result = await loaded.context.noteVault.moveFileWithLinkRewrite({
        expectedRevision: source.revision,
        expectedVault,
        fromPath: 'Plan.md',
        toPath: 'Moved/Plan.md',
      }, new AbortController().signal)
      assert.equal(result.status, 'moved')
      assert.equal(result.generation, 1)
      assert.match(result.rewriteError ?? '', /active vault changed/u)
      assert.deepEqual(result.rewrittenPaths, [])
      assert.equal((await lstat(join(fixture, 'Moved', 'Plan.md'))).isFile(), true)
      assert.equal(loaded.context.noteVault.state.generation, 2)
    } finally {
      await dispose(loaded.context, loaded.root)
    }
  } finally {
    await rm(fixture, { recursive: true, force: true })
    await rm(secondVault, { recursive: true, force: true })
  }
})

test('link-rewrite moves fail before mutation on incomplete plans and Markdown sidecars', async () => {
  const boundedVault = await mkdtemp(join(tmpdir(), 'note-vault-rewrite-bounded-'))
  const sidecarVault = await mkdtemp(join(tmpdir(), 'note-vault-rewrite-sidecar-'))
  try {
    await mkdir(join(boundedVault, 'Moved'))
    await writeFile(join(boundedVault, 'Index.md'), `[Plan](./Plan.md) ${'x'.repeat(100)}\n`)
    await writeFile(join(boundedVault, 'Plan.md'), '# Plan\n')
    const bounded = await load([
      `vaultRoot: ${JSON.stringify(boundedVault)}`,
      'maxReadBytes: 64',
    ].join('\n'))
    try {
      const state = bounded.context.noteVault.state
      if (!state.active) assert.fail('configured vault must be active')
      const expectedVault = { id: state.id, generation: state.generation }
      const source = await bounded.context.noteVault.openDocument(
        'Plan.md', expectedVault, new AbortController().signal,
      )
      await assert.rejects(
        bounded.context.noteVault.moveFileWithLinkRewrite({
          expectedRevision: source.revision,
          expectedVault,
          fromPath: 'Plan.md',
          toPath: 'Moved/Plan.md',
        }, new AbortController().signal),
        error => error instanceof NoteVaultError && error.code === 'changed',
      )
      assert.equal((await lstat(join(boundedVault, 'Plan.md'))).isFile(), true)
      assert.equal(await lstat(join(boundedVault, 'Moved', 'Plan.md')).catch(() => null), null)
    } finally {
      await dispose(bounded.context, bounded.root)
    }

    await mkdir(join(sidecarVault, 'Moved'))
    await mkdir(join(sidecarVault, 'Plan-md-images'))
    await writeFile(join(sidecarVault, 'Plan.md'), '# Plan\n')
    const sidecar = await load(`vaultRoot: ${JSON.stringify(sidecarVault)}`)
    try {
      const state = sidecar.context.noteVault.state
      if (!state.active) assert.fail('configured vault must be active')
      const expectedVault = { id: state.id, generation: state.generation }
      const source = await sidecar.context.noteVault.openDocument(
        'Plan.md', expectedVault, new AbortController().signal,
      )
      await assert.rejects(
        sidecar.context.noteVault.moveFileWithLinkRewrite({
          expectedRevision: source.revision,
          expectedVault,
          fromPath: 'Plan.md',
          toPath: 'Moved/Plan.md',
        }, new AbortController().signal),
        error => error instanceof NoteVaultError && error.code === 'unsupported-type',
      )
      assert.equal((await lstat(join(sidecarVault, 'Plan.md'))).isFile(), true)
      assert.equal((await lstat(join(sidecarVault, 'Plan-md-images'))).isDirectory(), true)
      assert.equal(await lstat(join(sidecarVault, 'Moved', 'Plan.md')).catch(() => null), null)
    } finally {
      await dispose(sidecar.context, sidecar.root)
    }
  } finally {
    await rm(boundedVault, { recursive: true, force: true })
    await rm(sidecarVault, { recursive: true, force: true })
  }
})

test('file mutations preserve source and concurrent destinations on conflicts', async () => {
  const fixture = await mkdtemp(join(tmpdir(), 'note-vault-file-mutation-guards-'))
  const vault = join(fixture, 'Vault')
  const outside = join(fixture, 'Outside')
  try {
    await mkdir(vault)
    await mkdir(outside)
    await writeFile(join(vault, 'Source.md'), '# Source\n')
    await writeFile(join(vault, 'Collision.md'), '# Competitor\n')
    await writeFile(join(outside, 'Outside.md'), '# Outside\n')
    await symlink(join(outside, 'Outside.md'), join(vault, 'Escape.md'))
    await symlink(outside, join(vault, 'Linked'), process.platform === 'win32' ? 'junction' : 'dir')
    const loaded = await load(`vaultRoot: ${JSON.stringify(vault)}`)
    try {
      const state = loaded.context.noteVault.state
      if (!state.active) assert.fail('configured vault must be active')
      const expectedVault = { id: state.id, generation: state.generation }
      const signal = new AbortController().signal
      const tree = await loaded.context.noteVault.listTree({ expectedVault, limit: 100 }, signal)
      const source = tree.entries.find(entry => entry.path === 'Source.md')
      if (source?.kind !== 'document') assert.fail('source must be listed')

      await assert.rejects(
        loaded.context.noteVault.moveFile({
          expectedRevision: source.revision,
          expectedVault,
          fromPath: 'Source.md',
          toPath: 'Collision.md',
        }, signal),
        error => error instanceof NoteVaultError && error.code === 'exists',
      )
      assert.equal(await readFile(join(vault, 'Source.md'), 'utf8'), '# Source\n')
      assert.equal(await readFile(join(vault, 'Collision.md'), 'utf8'), '# Competitor\n')
      await assert.rejects(
        loaded.context.noteVault.duplicateFile({
          expectedRevision: 'file:stale',
          expectedVault,
          fromPath: 'Source.md',
          toPath: 'Stale Copy.md',
        }, signal),
        error => error instanceof NoteVaultError && error.code === 'conflict',
      )
      await assert.rejects(lstat(join(vault, 'Stale Copy.md')), { code: 'ENOENT' })
      await assert.rejects(
        loaded.context.noteVault.duplicateFile({
          expectedRevision: source.revision,
          expectedVault,
          fromPath: 'Source.md',
          toPath: 'Linked/Copy.md',
        }, signal),
        error => error instanceof NoteVaultError && error.code === 'unsafe-target',
      )
      await assert.rejects(
        loaded.context.noteVault.moveFile({
          expectedRevision: source.revision,
          expectedVault,
          fromPath: 'Escape.md',
          toPath: 'Moved Escape.md',
        }, signal),
        error => error instanceof NoteVaultError && error.code === 'unsafe-target',
      )
      assert.equal(await readFile(join(outside, 'Outside.md'), 'utf8'), '# Outside\n')
    } finally {
      await dispose(loaded.context, loaded.root)
    }
  } finally {
    await rm(fixture, { recursive: true, force: true })
  }
})

test('file duplicate rolls back when the active vault changes during verification', async () => {
  const fixture = await mkdtemp(join(tmpdir(), 'note-vault-file-mutation-stale-'))
  const firstVault = join(fixture, 'First')
  const secondVault = join(fixture, 'Second')
  try {
    await mkdir(firstVault)
    await mkdir(secondVault)
    const sourcePath = join(firstVault, 'Source.md')
    await writeFile(sourcePath, '# Source\n')
    const loaded = await load(`vaultRoot: ${JSON.stringify(firstVault)}`)
    try {
      const state = loaded.context.noteVault.state
      if (!state.active) assert.fail('configured vault must be active')
      const expectedVault = { id: state.id, generation: state.generation }
      const tree = await loaded.context.noteVault.listTree({ expectedVault }, new AbortController().signal)
      const source = tree.entries.find(entry => entry.path === 'Source.md')
      if (source?.kind !== 'document') assert.fail('source must be listed')
      await duringFirstFileStat(
        sourcePath,
        () => { loaded.context.noteVault.activate(secondVault, 1) },
        async () => assert.rejects(
          loaded.context.noteVault.duplicateFile({
            expectedRevision: source.revision,
            expectedVault,
            fromPath: 'Source.md',
            toPath: 'Copy.md',
          }, new AbortController().signal),
          error => error instanceof NoteVaultError && error.code === 'stale-vault',
        ),
      )
      await assert.rejects(lstat(join(firstVault, 'Copy.md')), { code: 'ENOENT' })
      assert.equal(await readFile(sourcePath, 'utf8'), '# Source\n')
    } finally {
      await dispose(loaded.context, loaded.root)
    }
  } finally {
    await rm(fixture, { recursive: true, force: true })
  }
})

test('an injected consumer duplicates and moves a bounded folder subtree', async () => {
  const fixture = await mkdtemp(join(tmpdir(), 'note-vault-folder-mutations-'))
  try {
    await mkdir(join(fixture, 'Source', 'Nested'), { recursive: true })
    await writeFile(join(fixture, 'Source', 'A.md'), '# A\n')
    await writeFile(join(fixture, 'Source', 'Nested', 'B.base'), 'views: []\n')
    await symlink('A.md', join(fixture, 'Source', 'Alias.markdown'))
    const loaded = await load(`vaultRoot: ${JSON.stringify(fixture)}`)
    try {
      const state = loaded.context.noteVault.state
      if (!state.active) assert.fail('configured vault must be active')
      const expectedVault = { id: state.id, generation: state.generation }
      const signal = new AbortController().signal
      const tree = await loaded.context.noteVault.listTree({ expectedVault, limit: 100 }, signal)
      const source = tree.entries.find(entry => entry.path === 'Source')
      if (source?.kind !== 'directory') assert.fail('source folder must be listed')
      const duplicated = await loaded.context.noteVault.duplicateFolder({
        expectedRevision: source.revision,
        expectedVault,
        fromPath: 'Source',
        toPath: 'Copy',
      }, signal)
      assert.equal(duplicated.status, 'duplicated')
      assert.equal(await readFile(join(fixture, 'Copy', 'A.md'), 'utf8'), '# A\n')
      assert.equal(await readFile(join(fixture, 'Copy', 'Alias.markdown'), 'utf8'), '# A\n')
      assert.equal(await readFile(join(fixture, 'Source', 'A.md'), 'utf8'), '# A\n')

      const refreshed = await loaded.context.noteVault.listTree({ expectedVault, limit: 100 }, signal)
      const copy = refreshed.entries.find(entry => entry.path === 'Copy')
      if (copy?.kind !== 'directory') assert.fail('copied folder must be listed')
      const moved = await loaded.context.noteVault.moveFolder({
        expectedRevision: copy.revision,
        expectedVault,
        fromPath: 'Copy',
        toPath: 'Moved',
      }, signal)
      assert.equal(moved.status, 'moved')
      assert.equal(await readFile(join(fixture, 'Moved', 'Nested', 'B.base'), 'utf8'), 'views: []\n')
      await assert.rejects(lstat(join(fixture, 'Copy')), { code: 'ENOENT' })
    } finally {
      await dispose(loaded.context, loaded.root)
    }
  } finally {
    await rm(fixture, { recursive: true, force: true })
  }
})

test('folder moves rewrite inbound and moved-referrer links after copy verification', async () => {
  const fixture = await mkdtemp(join(tmpdir(), 'note-vault-folder-rewrite-'))
  try {
    await mkdir(join(fixture, 'Archive'))
    await mkdir(join(fixture, 'Topic'))
    await writeFile(join(fixture, 'Index.md'), '[A](./Topic/A.md)\n')
    await writeFile(join(fixture, 'Outside.md'), '# Outside\n')
    await writeFile(join(fixture, 'Topic', 'A.md'), '[Outside](../Outside.md)\n')
    const loaded = await load(`vaultRoot: ${JSON.stringify(fixture)}`)
    try {
      const state = loaded.context.noteVault.state
      if (!state.active) assert.fail('configured vault must be active')
      const expectedVault = { id: state.id, generation: state.generation }
      const tree = await loaded.context.noteVault.listTree({ expectedVault }, new AbortController().signal)
      const source = tree.entries.find(entry => entry.path === 'Topic' && entry.kind === 'directory')
      if (source === undefined) assert.fail('source folder must be listed')
      const result = await loaded.context.noteVault.moveFolderWithLinkRewrite({
        expectedRevision: source.revision,
        expectedVault,
        fromPath: 'Topic',
        toPath: 'Archive/Topic',
      }, new AbortController().signal)
      assert.equal(result.rewriteError, undefined)
      assert.deepEqual(result.rewrittenPaths, ['Archive/Topic/A.md', 'Index.md'])
      assert.match(await readFile(join(fixture, 'Index.md'), 'utf8'), /\.\/Archive\/Topic\/A\.md/u)
      assert.match(
        await readFile(join(fixture, 'Archive', 'Topic', 'A.md'), 'utf8'),
        /\.\.\/\.\.\/Outside\.md/u,
      )
      assert.equal(await lstat(join(fixture, 'Topic')).catch(() => null), null)
      assert.equal(result.rewriteSnapshots.length, 2)
    } finally {
      await dispose(loaded.context, loaded.root)
    }
  } finally {
    await rm(fixture, { recursive: true, force: true })
  }
})

test('folder operations reject unsafe, excessive, stale, and colliding sources before mutation', async () => {
  const fixture = await mkdtemp(join(tmpdir(), 'note-vault-folder-guards-'))
  const vault = join(fixture, 'Vault')
  const outside = join(fixture, 'Outside')
  try {
    await mkdir(vault)
    await mkdir(outside)
    await mkdir(join(vault, 'Valid'))
    await writeFile(join(vault, 'Valid', 'A.md'), '1234')
    await mkdir(join(vault, 'Big'))
    await writeFile(join(vault, 'Big', 'Large.md'), '12345')
    await mkdir(join(vault, 'Hidden'))
    await writeFile(join(vault, 'Hidden', '.secret.md'), 'secret')
    await mkdir(join(vault, 'Unsupported'))
    await writeFile(join(vault, 'Unsupported', 'data.txt'), 'text')
    await mkdir(join(vault, 'Linked'))
    await symlink(outside, join(vault, 'Linked', 'Outside'), process.platform === 'win32' ? 'junction' : 'dir')
    await mkdir(join(vault, 'Existing'))
    await symlink(join(vault, 'Valid'), join(vault, 'Folder Alias'), process.platform === 'win32' ? 'junction' : 'dir')
    const loaded = await load([
      `vaultRoot: ${JSON.stringify(vault)}`,
      'maxFolderBytes: 4',
    ].join('\n'))
    try {
      const state = loaded.context.noteVault.state
      if (!state.active) assert.fail('configured vault must be active')
      const expectedVault = { id: state.id, generation: state.generation }
      const tree = await loaded.context.noteVault.listTree({ expectedVault, limit: 100 }, new AbortController().signal)
      const revision = (path: string) => {
        const entry = tree.entries.find(candidate => candidate.path === path)
        if (entry?.kind !== 'directory') assert.fail(`${path} must be listed`)
        return entry.revision
      }
      const request = (fromPath: string, toPath: string) => ({
        expectedRevision: revision(fromPath),
        expectedVault,
        fromPath,
        toPath,
      })
      await assert.rejects(
        loaded.context.noteVault.duplicateFolder(request('Valid', 'Existing'), new AbortController().signal),
        error => error instanceof NoteVaultError && error.code === 'exists',
      )
      await assert.rejects(
        loaded.context.noteVault.duplicateFolder({
          ...request('Valid', 'Stale'),
          expectedRevision: 'file:stale',
        }, new AbortController().signal),
        error => error instanceof NoteVaultError && error.code === 'conflict',
      )
      await assert.rejects(
        loaded.context.noteVault.duplicateFolder(request('Big', 'Big Copy'), new AbortController().signal),
        error => error instanceof NoteVaultError && error.code === 'too-large',
      )
      await assert.rejects(
        loaded.context.noteVault.duplicateFolder(request('Hidden', 'Hidden Copy'), new AbortController().signal),
        error => error instanceof NoteVaultError && error.code === 'unsafe-target',
      )
      await assert.rejects(
        loaded.context.noteVault.duplicateFolder(
          request('Unsupported', 'Unsupported Copy'),
          new AbortController().signal,
        ),
        error => error instanceof NoteVaultError && error.code === 'unsupported-type',
      )
      await assert.rejects(
        loaded.context.noteVault.duplicateFolder(request('Linked', 'Linked Copy'), new AbortController().signal),
        error => error instanceof NoteVaultError && error.code === 'unsafe-target',
      )
      await assert.rejects(
        loaded.context.noteVault.duplicateFolder({
          expectedRevision: revision('Valid'),
          expectedVault,
          fromPath: 'Folder Alias',
          toPath: 'Alias Copy',
        }, new AbortController().signal),
        error => error instanceof NoteVaultError && error.code === 'unsafe-target',
      )
      for (const absent of [
        'Alias Copy',
        'Stale',
        'Big Copy',
        'Hidden Copy',
        'Unsupported Copy',
        'Linked Copy',
      ]) {
        await assert.rejects(lstat(join(vault, absent)), { code: 'ENOENT' })
      }
      assert.deepEqual(await readdir(join(vault, 'Existing')), [])
    } finally {
      await dispose(loaded.context, loaded.root)
    }
  } finally {
    await rm(fixture, { recursive: true, force: true })
  }
})

test('folder manifests enforce configured entry and depth bounds', async () => {
  const fixture = await mkdtemp(join(tmpdir(), 'note-vault-folder-structural-bounds-'))
  try {
    await mkdir(join(fixture, 'Deep', 'Nested'), { recursive: true })
    await writeFile(join(fixture, 'Deep', 'Nested', 'A.md'), 'A')
    await mkdir(join(fixture, 'Wide'))
    await writeFile(join(fixture, 'Wide', 'A.md'), 'A')
    await writeFile(join(fixture, 'Wide', 'B.md'), 'B')
    const baseline = await load(`vaultRoot: ${JSON.stringify(fixture)}`)
    let deepRevision = ''
    let wideRevision = ''
    try {
      const state = baseline.context.noteVault.state
      if (!state.active) assert.fail('configured vault must be active')
      const tree = await baseline.context.noteVault.listTree({
        expectedVault: { id: state.id, generation: state.generation },
        limit: 100,
      }, new AbortController().signal)
      const deep = tree.entries.find(entry => entry.path === 'Deep')
      const wide = tree.entries.find(entry => entry.path === 'Wide')
      if (deep?.kind !== 'directory' || wide?.kind !== 'directory') assert.fail('folders must be listed')
      deepRevision = deep.revision
      wideRevision = wide.revision
    } finally {
      await dispose(baseline.context, baseline.root)
    }

    for (const bounded of [
      { config: 'maxTreeDepth: 1', fromPath: 'Deep', revision: deepRevision, toPath: 'Deep Copy' },
      { config: 'maxTreeEntries: 1', fromPath: 'Wide', revision: wideRevision, toPath: 'Wide Copy' },
    ]) {
      const loaded = await load([
        `vaultRoot: ${JSON.stringify(fixture)}`,
        bounded.config,
      ].join('\n'))
      try {
        const state = loaded.context.noteVault.state
        if (!state.active) assert.fail('configured vault must be active')
        await assert.rejects(
          loaded.context.noteVault.duplicateFolder({
            expectedRevision: bounded.revision,
            expectedVault: { id: state.id, generation: state.generation },
            fromPath: bounded.fromPath,
            toPath: bounded.toPath,
          }, new AbortController().signal),
          error => error instanceof NoteVaultError && error.code === 'too-large',
        )
        await assert.rejects(lstat(join(fixture, bounded.toPath)), { code: 'ENOENT' })
      } finally {
        await dispose(loaded.context, loaded.root)
      }
    }
  } finally {
    await rm(fixture, { recursive: true, force: true })
  }
})

test('folder copy revalidation preserves a changed source and reports retained partial destination', async () => {
  const fixture = await mkdtemp(join(tmpdir(), 'note-vault-folder-partial-'))
  const sourceRoot = join(fixture, 'Source')
  try {
    await mkdir(sourceRoot)
    const first = join(sourceRoot, 'A.md')
    const second = join(sourceRoot, 'B.md')
    await writeFile(first, 'A')
    await writeFile(second, 'B')
    const loaded = await load(`vaultRoot: ${JSON.stringify(fixture)}`)
    try {
      const state = loaded.context.noteVault.state
      if (!state.active) assert.fail('configured vault must be active')
      const expectedVault = { id: state.id, generation: state.generation }
      const tree = await loaded.context.noteVault.listTree({ expectedVault }, new AbortController().signal)
      const source = tree.entries.find(entry => entry.path === 'Source')
      if (source?.kind !== 'directory') assert.fail('source folder must be listed')
      await duringFirstFileSync(
        first,
        async () => writeFile(second, 'changed'),
        async () => assert.rejects(
          loaded.context.noteVault.moveFolder({
            expectedRevision: source.revision,
            expectedVault,
            fromPath: 'Source',
            toPath: 'Moved',
          }, new AbortController().signal),
          error => (
            error instanceof NoteVaultError
            && error.code === 'partial'
            && error.message.includes('Moved')
            && !error.message.includes(fixture)
          ),
        ),
      )
      assert.equal(await readFile(second, 'utf8'), 'changed')
      assert.equal(await readFile(join(fixture, 'Moved', 'A.md'), 'utf8'), 'A')
      assert.equal(await readFile(join(fixture, 'Moved', 'B.md'), 'utf8'), 'changed')
    } finally {
      await dispose(loaded.context, loaded.root)
    }
  } finally {
    await rm(fixture, { recursive: true, force: true })
  }
})

test('an injected consumer inspects previews and exclusively stores accepted attachments', async () => {
  const fixture = await mkdtemp(join(tmpdir(), 'note-vault-attachments-'))
  try {
    await writeFile(join(fixture, 'Image.png'), Buffer.from([1, 2, 3, 4]))
    const loaded = await load([
      `vaultRoot: ${JSON.stringify(fixture)}`,
      'maxAttachmentBytes: 8',
    ].join('\n'))
    try {
      const state = loaded.context.noteVault.state
      if (!state.active) assert.fail('configured vault must be active')
      const expectedVault = { id: state.id, generation: state.generation }
      const signal = new AbortController().signal
      const metadata = await loaded.context.noteVault.inspectAttachment(
        'Image.png',
        expectedVault,
        signal,
      )
      assert.equal(metadata.mediaKind, 'image')
      assert.equal(metadata.mimeType, 'image/png')
      assert.equal(metadata.size, 4)
      const preview = await loaded.context.noteVault.previewAttachment(
        'Image.png',
        expectedVault,
        signal,
      )
      assert.deepEqual([...preview.data], [1, 2, 3, 4])
      assert.match(preview.digest, /^sha256:[0-9a-f]{64}$/)
      const stored = await loaded.context.noteVault.storeAttachment({
        data: Uint8Array.from([5, 6, 7]),
        expectedVault,
        path: 'Stored.pdf',
      }, signal)
      assert.equal(stored.status, 'stored')
      assert.deepEqual([...await readFile(join(fixture, 'Stored.pdf'))], [5, 6, 7])
    } finally {
      await dispose(loaded.context, loaded.root)
    }
  } finally {
    await rm(fixture, { recursive: true, force: true })
  }
})

test('attachment previews enforce bounds, cancellation, and file-alias confinement', async () => {
  const fixture = await mkdtemp(join(tmpdir(), 'note-vault-attachment-guards-'))
  const vault = join(fixture, 'Vault')
  const outside = join(fixture, 'Outside')
  try {
    await mkdir(join(vault, 'Assets'), { recursive: true })
    await mkdir(outside)
    const image = join(vault, 'Assets', 'Image.png')
    await writeFile(image, Buffer.from([1, 2, 3, 4]))
    await writeFile(join(vault, 'Large.pdf'), Buffer.alloc(9, 1))
    await writeFile(join(outside, 'Outside.png'), Buffer.from([9]))
    await symlink(image, join(vault, 'Alias.png'))
    await symlink(image, join(vault, 'Cross.jpg'))
    await symlink(join(outside, 'Outside.png'), join(vault, 'Escape.png'))
    await symlink(join(vault, 'Assets'), join(vault, 'Linked'), process.platform === 'win32' ? 'junction' : 'dir')
    const loaded = await load([
      `vaultRoot: ${JSON.stringify(vault)}`,
      'maxAttachmentBytes: 8',
    ].join('\n'))
    try {
      const state = loaded.context.noteVault.state
      if (!state.active) assert.fail('configured vault must be active')
      const expectedVault = { id: state.id, generation: state.generation }
      const signal = new AbortController().signal
      const alias = await loaded.context.noteVault.previewAttachment('Alias.png', expectedVault, signal)
      assert.deepEqual([...alias.data], [1, 2, 3, 4])
      assert.equal(alias.path, 'Alias.png')
      assert.equal(JSON.stringify({ ...alias, data: [] }).includes(vault), false)
      const largeMetadata = await loaded.context.noteVault.inspectAttachment(
        'Large.pdf',
        expectedVault,
        signal,
      )
      assert.equal(largeMetadata.size, 9)
      await assert.rejects(
        loaded.context.noteVault.previewAttachment('Large.pdf', expectedVault, signal),
        error => error instanceof NoteVaultError && error.code === 'too-large',
      )
      await assert.rejects(
        loaded.context.noteVault.previewAttachment('Cross.jpg', expectedVault, signal),
        error => error instanceof NoteVaultError && error.code === 'unsupported-type',
      )
      await assert.rejects(
        loaded.context.noteVault.previewAttachment('Escape.png', expectedVault, signal),
        error => error instanceof NoteVaultError && error.code === 'unsafe-target',
      )
      await assert.rejects(
        loaded.context.noteVault.previewAttachment('Linked/Image.png', expectedVault, signal),
        error => error instanceof NoteVaultError && error.code === 'unsafe-target',
      )
      await assert.rejects(
        loaded.context.noteVault.previewAttachment(
          'missing.png',
          { ...expectedVault, generation: 0 },
          signal,
        ),
        error => error instanceof NoteVaultError && error.code === 'stale-vault',
      )
      const controller = new AbortController()
      await duringFirstFileRead(
        image,
        () => controller.abort(),
        async () => assert.rejects(
          loaded.context.noteVault.previewAttachment('Assets/Image.png', expectedVault, controller.signal),
          error => error instanceof Error && error.name === 'AbortError',
        ),
      )
    } finally {
      await dispose(loaded.context, loaded.root)
    }
  } finally {
    await rm(fixture, { recursive: true, force: true })
  }
})

test('attachment stores use exclusive final claims and preserve concurrent data', async () => {
  const fixture = await mkdtemp(join(tmpdir(), 'note-vault-attachment-store-race-'))
  try {
    await writeFile(join(fixture, 'Existing.png'), Buffer.from([9]))
    const loaded = await load([
      `vaultRoot: ${JSON.stringify(fixture)}`,
      'maxAttachmentBytes: 8',
    ].join('\n'))
    try {
      const state = loaded.context.noteVault.state
      if (!state.active) assert.fail('configured vault must be active')
      const expectedVault = { id: state.id, generation: state.generation }
      const signal = new AbortController().signal
      await assert.rejects(
        loaded.context.noteVault.storeAttachment({
          data: Uint8Array.from([1]),
          expectedVault,
          path: 'Existing.png',
        }, signal),
        error => error instanceof NoteVaultError && error.code === 'exists',
      )
      assert.deepEqual([...await readFile(join(fixture, 'Existing.png'))], [9])
      await assert.rejects(
        loaded.context.noteVault.storeAttachment({
          data: new Uint8Array(9),
          expectedVault,
          path: 'Large.png',
        }, signal),
        error => error instanceof NoteVaultError && error.code === 'too-large',
      )
      const results = await Promise.allSettled([
        loaded.context.noteVault.storeAttachment({
          data: Uint8Array.from([1, 1]),
          expectedVault,
          path: 'Race.png',
        }, signal),
        loaded.context.noteVault.storeAttachment({
          data: Uint8Array.from([2, 2]),
          expectedVault,
          path: 'Race.png',
        }, signal),
      ])
      assert.equal(results.filter(result => result.status === 'fulfilled').length, 1)
      const rejected = results.find(result => result.status === 'rejected')
      assert.equal(
        rejected?.status === 'rejected'
          && rejected.reason instanceof NoteVaultError
          && rejected.reason.code === 'exists',
        true,
      )
      assert.equal(['1,1', '2,2'].includes([...await readFile(join(fixture, 'Race.png'))].join(',')), true)
    } finally {
      await dispose(loaded.context, loaded.root)
    }
  } finally {
    await rm(fixture, { recursive: true, force: true })
  }
})

test('an injected consumer atomically saves and exclusively creates documents', async () => {
  const fixture = await mkdtemp(join(tmpdir(), 'note-vault-write-'))
  try {
    await writeFile(join(fixture, 'Existing.md'), '# Before\n')
    const loaded = await load(`vaultRoot: ${JSON.stringify(fixture)}`)
    try {
      await loaded.context.plugin(Object.assign(
        async (consumer: Context) => {
          const state = consumer.noteVault.state
          if (!state.active) assert.fail('configured vault must be active')
          const expectedVault = { id: state.id, generation: state.generation }
          const signal = new AbortController().signal
          const opened = await consumer.noteVault.openDocument('Existing.md', expectedVault, signal)
          const saved = await consumer.noteVault.saveDocument({
            content: '# After\n',
            expectedRevision: opened.revision,
            expectedVault,
            path: 'Existing.md',
          }, signal)
          assert.equal(saved.status, 'saved')
          assert.equal(saved.path, 'Existing.md')
          assert.notEqual(saved.revision, opened.revision)

          const created = await consumer.noteVault.createDocument({
            content: '# New\n',
            expectedVault,
            path: 'New.md',
          }, signal)
          assert.equal(created.status, 'created')
          assert.equal(created.path, 'New.md')
        },
        { inject: ['noteVault'] },
      ))
      assert.equal(await readFile(join(fixture, 'Existing.md'), 'utf8'), '# After\n')
      assert.equal(await readFile(join(fixture, 'New.md'), 'utf8'), '# New\n')
    } finally {
      await dispose(loaded.context, loaded.root)
    }
  } finally {
    await rm(fixture, { recursive: true, force: true })
  }
})

test('document writes preserve conflicts, aliases, bounds, and confinement', async () => {
  const fixture = await mkdtemp(join(tmpdir(), 'note-vault-write-guards-'))
  const vault = join(fixture, 'Vault')
  const outside = join(fixture, 'Outside')
  try {
    await mkdir(join(vault, 'Notes'), { recursive: true })
    await mkdir(outside)
    const canonical = join(vault, 'Notes', 'Canonical.md')
    const alias = join(vault, 'Alias.markdown')
    await writeFile(canonical, 'old')
    await symlink(canonical, alias)
    await writeFile(join(vault, 'Existing.md'), 'keep')
    await writeFile(join(vault, 'Deleted.md'), 'delete')
    await symlink(outside, join(vault, 'Linked'), process.platform === 'win32' ? 'junction' : 'dir')
    const loaded = await load([
      `vaultRoot: ${JSON.stringify(vault)}`,
      'maxReadBytes: 8',
    ].join('\n'))
    try {
      const state = loaded.context.noteVault.state
      if (!state.active) assert.fail('configured vault must be active')
      const expectedVault = { id: state.id, generation: state.generation }
      const signal = new AbortController().signal
      const opened = await loaded.context.noteVault.openDocument('Alias.markdown', expectedVault, signal)
      await writeFile(canonical, 'external')
      await assert.rejects(
        loaded.context.noteVault.saveDocument({
          content: 'ours',
          expectedRevision: opened.revision,
          expectedVault,
          path: 'Alias.markdown',
        }, signal),
        error => error instanceof NoteVaultError && error.code === 'conflict',
      )
      assert.equal(await readFile(canonical, 'utf8'), 'external')

      const refreshed = await loaded.context.noteVault.openDocument('Alias.markdown', expectedVault, signal)
      const saved = await loaded.context.noteVault.saveDocument({
        content: 'ours',
        expectedRevision: refreshed.revision,
        expectedVault,
        path: 'Alias.markdown',
      }, signal)
      assert.equal(saved.status, 'saved')
      assert.equal(await readFile(canonical, 'utf8'), 'ours')
      assert.equal((await lstat(alias)).isSymbolicLink(), true)
      if (saved.status !== 'saved') assert.fail('alias save must capture recovery')
      const aliasSnapshot = await loaded.context.noteVault.readSnapshot({
        expectedVault,
        path: 'Alias.markdown',
        snapshotId: saved.snapshotId,
      }, signal)
      assert.equal(aliasSnapshot.content, 'external')
      assert.equal(aliasSnapshot.snapshot.path, 'Alias.markdown')

      const deleted = await loaded.context.noteVault.openDocument('Deleted.md', expectedVault, signal)
      await rm(join(vault, 'Deleted.md'))
      await assert.rejects(
        loaded.context.noteVault.saveDocument({
          content: 'recreate',
          expectedRevision: deleted.revision,
          expectedVault,
          path: 'Deleted.md',
        }, signal),
        error => error instanceof NoteVaultError && error.code === 'conflict',
      )
      await assert.rejects(lstat(join(vault, 'Deleted.md')), { code: 'ENOENT' })

      await assert.rejects(
        loaded.context.noteVault.createDocument({
          content: 'replace',
          expectedVault,
          path: 'Existing.md',
        }, signal),
        error => error instanceof NoteVaultError && error.code === 'exists',
      )
      assert.equal(await readFile(join(vault, 'Existing.md'), 'utf8'), 'keep')
      await assert.rejects(
        loaded.context.noteVault.createDocument({
          content: '123456789',
          expectedVault,
          path: 'Large.md',
        }, signal),
        error => error instanceof NoteVaultError && error.code === 'too-large',
      )
      await assert.rejects(
        loaded.context.noteVault.createDocument({
          content: 'escape',
          expectedVault,
          path: '../Escape.md',
        }, signal),
        error => error instanceof NoteVaultError && error.code === 'invalid-path',
      )
      await assert.rejects(
        loaded.context.noteVault.createDocument({
          content: 'escape',
          expectedVault,
          path: 'Linked/Escape.md',
        }, signal),
        error => error instanceof NoteVaultError && error.code === 'unsafe-target',
      )
      await assert.rejects(
        loaded.context.noteVault.createDocument({
          content: 'text',
          expectedVault,
          path: 'Unsupported.txt',
        }, signal),
        error => error instanceof NoteVaultError && error.code === 'unsupported-type',
      )
    } finally {
      await dispose(loaded.context, loaded.root)
    }
  } finally {
    await rm(fixture, { recursive: true, force: true })
  }
})

test('document write races preserve concurrent files and remove temporary files', async () => {
  const fixture = await mkdtemp(join(tmpdir(), 'note-vault-write-races-'))
  const firstVault = join(fixture, 'First Vault')
  const secondVault = join(fixture, 'Second Vault')
  try {
    await mkdir(firstVault)
    await mkdir(secondVault)
    const existing = join(firstVault, 'Existing.md')
    await writeFile(existing, 'before')
    const loaded = await load(`vaultRoot: ${JSON.stringify(firstVault)}`)
    try {
      const state = loaded.context.noteVault.state
      if (!state.active) assert.fail('configured vault must be active')
      const expectedVault = { id: state.id, generation: state.generation }
      const signal = new AbortController().signal
      const opened = await loaded.context.noteVault.openDocument('Existing.md', expectedVault, signal)

      await duringFirstFileSync(
        existing,
        async () => writeFile(existing, 'external'),
        async () => assert.rejects(
          loaded.context.noteVault.saveDocument({
            content: 'ours',
            expectedRevision: opened.revision,
            expectedVault,
            path: 'Existing.md',
          }, signal),
          error => error instanceof NoteVaultError && error.code === 'conflict',
        ),
      )
      assert.equal(await readFile(existing, 'utf8'), 'external')

      const collision = join(firstVault, 'Collision.md')
      await duringFirstFileSync(
        existing,
        async () => writeFile(collision, 'competitor'),
        async () => assert.rejects(
          loaded.context.noteVault.createDocument({
            content: 'ours',
            expectedVault,
            path: 'Collision.md',
          }, signal),
          error => error instanceof NoteVaultError && error.code === 'exists',
        ),
      )
      assert.equal(await readFile(collision, 'utf8'), 'competitor')

      const current = await loaded.context.noteVault.openDocument('Existing.md', expectedVault, signal)
      await duringFirstFileSync(
        existing,
        () => { loaded.context.noteVault.activate(secondVault, 1) },
        async () => assert.rejects(
          loaded.context.noteVault.saveDocument({
            content: 'stale',
            expectedRevision: current.revision,
            expectedVault,
            path: 'Existing.md',
          }, signal),
          error => error instanceof NoteVaultError && error.code === 'stale-vault',
        ),
      )
      assert.equal(await readFile(existing, 'utf8'), 'external')
      assert.deepEqual(
        (await readdir(firstVault)).filter(name => name.endsWith('.tmp')),
        [],
      )
    } finally {
      await dispose(loaded.context, loaded.root)
    }
  } finally {
    await rm(fixture, { recursive: true, force: true })
  }
})

test('every save captures a bounded recovery snapshot and restores it exclusively', async () => {
  const fixture = await mkdtemp(join(tmpdir(), 'note-vault-snapshots-'))
  try {
    await writeFile(join(fixture, 'Note.md'), 'one')
    const loaded = await load([
      `vaultRoot: ${JSON.stringify(fixture)}`,
      'snapshotLimit: 2',
    ].join('\n'))
    try {
      const state = loaded.context.noteVault.state
      if (!state.active) assert.fail('configured vault must be active')
      const expectedVault = { id: state.id, generation: state.generation }
      const signal = new AbortController().signal
      let opened = await loaded.context.noteVault.openDocument('Note.md', expectedVault, signal)
      const firstSave = await loaded.context.noteVault.saveDocument({
        content: 'two',
        expectedRevision: opened.revision,
        expectedVault,
        path: 'Note.md',
      }, signal)
      if (firstSave.status !== 'saved') assert.fail('save must return recovery evidence')
      assert.match(firstSave.snapshotId, /^\d{4}-/u)
      let snapshots = await loaded.context.noteVault.listSnapshots({
        expectedVault,
        path: 'Note.md',
      }, signal)
      assert.equal(snapshots.snapshots.length, 1)
      const original = await loaded.context.noteVault.readSnapshot({
        expectedVault,
        path: 'Note.md',
        snapshotId: firstSave.snapshotId,
      }, signal)
      assert.equal(original.content, 'one')
      assert.equal(original.snapshot.path, 'Note.md')
      assert.equal(JSON.stringify(original).includes(fixture), false)

      const restored = await loaded.context.noteVault.restoreSnapshotAsNew({
        expectedVault,
        path: 'Note.md',
        snapshotId: firstSave.snapshotId,
        toPath: 'Restored.md',
      }, signal)
      assert.equal(restored.status, 'created')
      assert.equal(await readFile(join(fixture, 'Restored.md'), 'utf8'), 'one')
      await assert.rejects(
        loaded.context.noteVault.restoreSnapshotAsNew({
          expectedVault,
          path: 'Note.md',
          snapshotId: firstSave.snapshotId,
          toPath: 'Restored.md',
        }, signal),
        error => error instanceof NoteVaultError && error.code === 'exists',
      )

      const manual = await loaded.context.noteVault.captureSnapshot({
        content: 'manual draft',
        expectedVault,
        path: 'Note.md',
        reason: 'manual',
      }, signal)
      assert.equal(manual.snapshot?.reason, 'manual')
      opened = await loaded.context.noteVault.openDocument('Note.md', expectedVault, signal)
      const overwrite = await loaded.context.noteVault.restoreSnapshot({
        expectedRevision: opened.revision,
        expectedVault,
        path: 'Note.md',
        snapshotId: firstSave.snapshotId,
      }, signal)
      assert.equal(overwrite.status, 'saved')
      assert.equal(await readFile(join(fixture, 'Note.md'), 'utf8'), 'one')

      for (const content of ['three', 'four']) {
        opened = await loaded.context.noteVault.openDocument('Note.md', expectedVault, signal)
        await loaded.context.noteVault.saveDocument({
          content,
          expectedRevision: opened.revision,
          expectedVault,
          path: 'Note.md',
        }, signal)
      }
      snapshots = await loaded.context.noteVault.listSnapshots({ expectedVault, path: 'Note.md' }, signal)
      assert.equal(snapshots.snapshots.length, 2)
      const cleared = await loaded.context.noteVault.clearSnapshots({ expectedVault, path: 'Note.md' }, signal)
      assert.equal(cleared.removed, 2)
      assert.equal((await loaded.context.noteVault.listSnapshots({ expectedVault, path: 'Note.md' }, signal)).snapshots.length, 0)
    } finally {
      await dispose(loaded.context, loaded.root)
    }
  } finally {
    await rm(fixture, { recursive: true, force: true })
  }
})

test('save fails before mutation when recovery storage is unavailable', async () => {
  const fixture = await mkdtemp(join(tmpdir(), 'note-vault-snapshot-required-'))
  try {
    await writeFile(join(fixture, 'Note.md'), 'before')
    const loaded = await load([
      `vaultRoot: ${JSON.stringify(fixture)}`,
      'stateRoot: null',
    ].join('\n'))
    try {
      const state = loaded.context.noteVault.state
      if (!state.active) assert.fail('configured vault must be active')
      const expectedVault = { id: state.id, generation: state.generation }
      const signal = new AbortController().signal
      const opened = await loaded.context.noteVault.openDocument('Note.md', expectedVault, signal)
      await assert.rejects(
        loaded.context.noteVault.saveDocument({
          content: 'after',
          expectedRevision: opened.revision,
          expectedVault,
          path: 'Note.md',
        }, signal),
        error => error instanceof NoteVaultError && error.code === 'recovery-unavailable',
      )
      assert.equal(await readFile(join(fixture, 'Note.md'), 'utf8'), 'before')
    } finally {
      await dispose(loaded.context, loaded.root)
    }
  } finally {
    await rm(fixture, { recursive: true, force: true })
  }
})

test('snapshot readers ignore malformed metadata and reject symlinked bodies', async () => {
  const fixture = await mkdtemp(join(tmpdir(), 'note-vault-snapshot-tamper-'))
  const outside = await mkdtemp(join(tmpdir(), 'note-vault-snapshot-outside-'))
  try {
    await writeFile(join(fixture, 'Note.md'), 'before')
    const loaded = await load(`vaultRoot: ${JSON.stringify(fixture)}`)
    try {
      const state = loaded.context.noteVault.state
      if (!state.active) assert.fail('configured vault must be active')
      const expectedVault = { id: state.id, generation: state.generation }
      const signal = new AbortController().signal
      const opened = await loaded.context.noteVault.openDocument('Note.md', expectedVault, signal)
      const saved = await loaded.context.noteVault.saveDocument({
        content: 'after',
        expectedRevision: opened.revision,
        expectedVault,
        path: 'Note.md',
      }, signal)
      if (saved.status !== 'saved') assert.fail('save must include a snapshot')
      const stateFiles = await readdir(join(loaded.root, 'state'), { recursive: true })
      const metadata = stateFiles.find(name => name.endsWith(`${saved.snapshotId}.json`))
      const body = stateFiles.find(name => name.endsWith(`${saved.snapshotId}.body`))
      if (metadata === undefined || body === undefined) assert.fail('snapshot files must exist')
      const metadataPath = join(loaded.root, 'state', metadata)
      await writeFile(metadataPath, JSON.stringify({ padding: 'x'.repeat(64 * 1024) }))
      assert.deepEqual(
        (await loaded.context.noteVault.listSnapshots({ expectedVault, path: 'Note.md' }, signal)).snapshots,
        [],
      )
      const outsideMetadata = join(outside, 'metadata.json')
      await writeFile(outsideMetadata, '{}')
      await rm(metadataPath)
      await symlink(outsideMetadata, metadataPath)
      assert.deepEqual(
        (await loaded.context.noteVault.listSnapshots({ expectedVault, path: 'Note.md' }, signal)).snapshots,
        [],
      )

      const current = await loaded.context.noteVault.openDocument('Note.md', expectedVault, signal)
      const replacement = await loaded.context.noteVault.saveDocument({
        content: 'again',
        expectedRevision: current.revision,
        expectedVault,
        path: 'Note.md',
      }, signal)
      if (replacement.status !== 'saved') assert.fail('replacement snapshot must exist')
      const replacementFiles = await readdir(join(loaded.root, 'state'), { recursive: true })
      const replacementBody = replacementFiles.find(name => name.endsWith(`${replacement.snapshotId}.body`))
      if (replacementBody === undefined) assert.fail('replacement body must exist')
      const outsideBody = join(outside, 'secret')
      await writeFile(outsideBody, 'secret')
      await rm(join(loaded.root, 'state', replacementBody))
      await symlink(outsideBody, join(loaded.root, 'state', replacementBody))
      assert.deepEqual(
        (await loaded.context.noteVault.listSnapshots({ expectedVault, path: 'Note.md' }, signal)).snapshots,
        [],
      )
      await assert.rejects(
        loaded.context.noteVault.readSnapshot({
          expectedVault,
          path: 'Note.md',
          snapshotId: replacement.snapshotId,
        }, signal),
        error => error instanceof NoteVaultError && error.code === 'not-found',
      )
    } finally {
      await dispose(loaded.context, loaded.root)
    }
  } finally {
    await rm(fixture, { recursive: true, force: true })
    await rm(outside, { recursive: true, force: true })
  }
})

test('an injected consumer trashes and exclusively restores documents aliases attachments and folders', async () => {
  const fixture = await mkdtemp(join(tmpdir(), 'note-vault-trash-'))
  try {
    await mkdir(join(fixture, 'Folder'))
    await mkdir(join(fixture, '.trash'))
    await writeFile(join(fixture, '.trash', 'Note.md'), 'collision')
    await writeFile(join(fixture, 'Note.md'), 'note')
    await writeFile(join(fixture, 'Canonical.md'), 'canonical')
    await symlink(join(fixture, 'Canonical.md'), join(fixture, 'Alias.markdown'))
    await writeFile(join(fixture, 'Image.png'), Buffer.from([1, 2]))
    await writeFile(join(fixture, 'Folder', 'Nested.md'), 'nested')
    const loaded = await load(`vaultRoot: ${JSON.stringify(fixture)}`)
    try {
      const state = loaded.context.noteVault.state
      if (!state.active) assert.fail('configured vault must be active')
      const expectedVault = { id: state.id, generation: state.generation }
      const signal = new AbortController().signal
      const tree = await loaded.context.noteVault.listTree({ expectedVault, limit: 100 }, signal)
      const revision = (path: string) => {
        const entry = tree.entries.find(candidate => candidate.path === path)
        if (entry === undefined) assert.fail(`${path} must be listed`)
        return entry.revision
      }
      const trashed = []
      for (const path of ['Note.md', 'Alias.markdown', 'Image.png', 'Folder']) {
        trashed.push(await loaded.context.noteVault.trashEntry({
          expectedRevision: revision(path),
          expectedVault,
          path,
        }, signal))
        await assert.rejects(lstat(join(fixture, path)), { code: 'ENOENT' })
      }
      assert.equal(await readFile(join(fixture, 'Canonical.md'), 'utf8'), 'canonical')
      assert.equal(await readFile(join(fixture, '.trash', 'Note.md'), 'utf8'), 'collision')
      const listed = await loaded.context.noteVault.listTrash({ expectedVault }, signal)
      assert.equal(listed.entries.length, 4)
      assert.equal(JSON.stringify(listed).includes(join(fixture, '.trash')), false)

      for (const entry of trashed) {
        const restored = await loaded.context.noteVault.restoreTrash({
          expectedVault,
          id: entry.id,
        }, signal)
        assert.equal(restored.status, 'restored')
      }
      assert.equal(await readFile(join(fixture, 'Note.md'), 'utf8'), 'note')
      assert.equal((await lstat(join(fixture, 'Alias.markdown'))).isSymbolicLink(), true)
      assert.deepEqual([...await readFile(join(fixture, 'Image.png'))], [1, 2])
      assert.equal(await readFile(join(fixture, 'Folder', 'Nested.md'), 'utf8'), 'nested')
      assert.deepEqual(
        (await loaded.context.noteVault.listTrash({ expectedVault }, signal)).entries,
        [],
      )
    } finally {
      await dispose(loaded.context, loaded.root)
    }
  } finally {
    await rm(fixture, { recursive: true, force: true })
  }
})

test('trash restore collisions preserve both the trash entry and concurrent destination', async () => {
  const fixture = await mkdtemp(join(tmpdir(), 'note-vault-trash-collision-'))
  try {
    await writeFile(join(fixture, 'Note.md'), 'source')
    await writeFile(join(fixture, 'Stale.md'), 'stale')
    const loaded = await load(`vaultRoot: ${JSON.stringify(fixture)}`)
    try {
      const state = loaded.context.noteVault.state
      if (!state.active) assert.fail('configured vault must be active')
      const expectedVault = { id: state.id, generation: state.generation }
      const signal = new AbortController().signal
      const tree = await loaded.context.noteVault.listTree({ expectedVault, limit: 100 }, signal)
      const note = tree.entries.find(entry => entry.path === 'Note.md')
      const stale = tree.entries.find(entry => entry.path === 'Stale.md')
      if (note?.kind !== 'document' || stale?.kind !== 'document') assert.fail('notes must be listed')
      await assert.rejects(
        loaded.context.noteVault.trashEntry({
          expectedRevision: 'file:stale',
          expectedVault,
          path: 'Stale.md',
        }, signal),
        error => error instanceof NoteVaultError && error.code === 'conflict',
      )
      assert.equal(await readFile(join(fixture, 'Stale.md'), 'utf8'), 'stale')

      const trashed = await loaded.context.noteVault.trashEntry({
        expectedRevision: note.revision,
        expectedVault,
        path: 'Note.md',
      }, signal)
      await writeFile(join(fixture, 'Note.md'), 'competitor')
      await assert.rejects(
        loaded.context.noteVault.restoreTrash({ expectedVault, id: trashed.id }, signal),
        error => error instanceof NoteVaultError && error.code === 'exists',
      )
      assert.equal(await readFile(join(fixture, 'Note.md'), 'utf8'), 'competitor')
      assert.equal((await loaded.context.noteVault.listTrash({ expectedVault }, signal)).entries.length, 1)
      const restored = await loaded.context.noteVault.restoreTrash({
        expectedVault,
        id: trashed.id,
        toPath: 'Recovered.md',
      }, signal)
      assert.equal(restored.path, 'Recovered.md')
      assert.equal(await readFile(join(fixture, 'Recovered.md'), 'utf8'), 'source')
      assert.equal(await readFile(join(fixture, 'Note.md'), 'utf8'), 'competitor')
    } finally {
      await dispose(loaded.context, loaded.root)
    }
  } finally {
    await rm(fixture, { recursive: true, force: true })
  }
})

test('trash collision naming stops after one thousand preserved destinations', async () => {
  const fixture = await mkdtemp(join(tmpdir(), 'note-vault-trash-collision-bound-'))
  try {
    await mkdir(join(fixture, '.trash'))
    await writeFile(join(fixture, 'Note.md'), 'source')
    for (let index = 0; index < 1_000; index += 1) {
      const suffix = index === 0 ? '' : ` ${String(index + 1)}`
      await writeFile(join(fixture, '.trash', `Note${suffix}.md`), `collision-${String(index)}`)
    }
    const loaded = await load(`vaultRoot: ${JSON.stringify(fixture)}`)
    try {
      const state = loaded.context.noteVault.state
      if (!state.active) assert.fail('configured vault must be active')
      const expectedVault = { id: state.id, generation: state.generation }
      const tree = await loaded.context.noteVault.listTree({ expectedVault }, new AbortController().signal)
      const note = tree.entries.find(entry => entry.path === 'Note.md')
      if (note?.kind !== 'document') assert.fail('note must be listed')
      await assert.rejects(
        loaded.context.noteVault.trashEntry({
          expectedRevision: note.revision,
          expectedVault,
          path: 'Note.md',
        }, new AbortController().signal),
        error => error instanceof NoteVaultError && error.code === 'exists',
      )
      assert.equal(await readFile(join(fixture, 'Note.md'), 'utf8'), 'source')
      assert.equal(await readFile(join(fixture, '.trash', 'Note 1000.md'), 'utf8'), 'collision-999')
    } finally {
      await dispose(loaded.context, loaded.root)
    }
  } finally {
    await rm(fixture, { recursive: true, force: true })
  }
})

test('trash listing ignores malformed oversized and symlinked metadata', async () => {
  const fixture = await mkdtemp(join(tmpdir(), 'note-vault-trash-metadata-'))
  const outside = await mkdtemp(join(tmpdir(), 'note-vault-trash-metadata-outside-'))
  try {
    await writeFile(join(fixture, 'Note.md'), 'source')
    const loaded = await load(`vaultRoot: ${JSON.stringify(fixture)}`)
    try {
      const state = loaded.context.noteVault.state
      if (!state.active) assert.fail('configured vault must be active')
      const expectedVault = { id: state.id, generation: state.generation }
      const signal = new AbortController().signal
      const tree = await loaded.context.noteVault.listTree({ expectedVault }, signal)
      const note = tree.entries.find(entry => entry.path === 'Note.md')
      if (note?.kind !== 'document') assert.fail('note must be listed')
      const trashed = await loaded.context.noteVault.trashEntry({
        expectedRevision: note.revision,
        expectedVault,
        path: 'Note.md',
      }, signal)
      const stateFiles = await readdir(join(loaded.root, 'state'), { recursive: true })
      const metadata = stateFiles.find(name => name.endsWith(`${trashed.id}.json`))
      if (metadata === undefined) assert.fail('trash metadata must exist')
      const metadataPath = join(loaded.root, 'state', metadata)
      const valid = JSON.parse(await readFile(metadataPath, 'utf8')) as Record<string, unknown>
      await writeFile(metadataPath, JSON.stringify({ ...valid, originalPath: '../escape' }))
      assert.deepEqual(
        (await loaded.context.noteVault.listTrash({ expectedVault }, signal)).entries,
        [],
      )
      await writeFile(metadataPath, JSON.stringify({ padding: 'x'.repeat(64 * 1024) }))
      assert.deepEqual(
        (await loaded.context.noteVault.listTrash({ expectedVault }, signal)).entries,
        [],
      )
      const outsideMetadata = join(outside, 'meta.json')
      await writeFile(outsideMetadata, JSON.stringify(valid))
      await rm(metadataPath)
      await symlink(outsideMetadata, metadataPath)
      assert.deepEqual(
        (await loaded.context.noteVault.listTrash({ expectedVault }, signal)).entries,
        [],
      )
    } finally {
      await dispose(loaded.context, loaded.root)
    }
  } finally {
    await rm(fixture, { recursive: true, force: true })
    await rm(outside, { recursive: true, force: true })
  }
})

test('trash restores an entry when metadata storage fails after the move', async () => {
  const fixture = await mkdtemp(join(tmpdir(), 'note-vault-trash-metadata-rollback-'))
  try {
    await writeFile(join(fixture, 'Recover.md'), 'recover me')
    const loaded = await load(`vaultRoot: ${JSON.stringify(fixture)}`)
    try {
      const state = loaded.context.noteVault.state
      if (!state.active) assert.fail('configured vault must be active')
      const expectedVault = { id: state.id, generation: state.generation }
      const opened = await loaded.context.noteVault.openDocument(
        'Recover.md', expectedVault, new AbortController().signal,
      )
      await writeFile(join(loaded.root, 'state', 'trash'), 'blocks metadata directory')
      await assert.rejects(
        loaded.context.noteVault.trashEntry({
          expectedRevision: opened.revision,
          expectedVault,
          path: 'Recover.md',
        }, new AbortController().signal),
        error => error instanceof NoteVaultError && error.code === 'recovery-unavailable',
      )
      assert.equal(await readFile(join(fixture, 'Recover.md'), 'utf8'), 'recover me')
      assert.deepEqual(await readdir(join(fixture, '.trash')), [])
    } finally {
      await dispose(loaded.context, loaded.root)
    }
  } finally {
    await rm(fixture, { recursive: true, force: true })
  }
})

test('trash refuses to mutate when metadata storage is unavailable', async () => {
  const fixture = await mkdtemp(join(tmpdir(), 'note-vault-trash-required-'))
  try {
    await writeFile(join(fixture, 'Note.md'), 'source')
    const loaded = await load(`vaultRoot: ${JSON.stringify(fixture)}\nstateRoot: null`)
    try {
      const state = loaded.context.noteVault.state
      if (!state.active) assert.fail('configured vault must be active')
      const expectedVault = { id: state.id, generation: state.generation }
      const tree = await loaded.context.noteVault.listTree({ expectedVault }, new AbortController().signal)
      const note = tree.entries.find(entry => entry.path === 'Note.md')
      if (note?.kind !== 'document') assert.fail('note must be listed')
      await assert.rejects(
        loaded.context.noteVault.trashEntry({
          expectedRevision: note.revision,
          expectedVault,
          path: 'Note.md',
        }, new AbortController().signal),
        error => error instanceof NoteVaultError && error.code === 'recovery-unavailable',
      )
      assert.equal(await readFile(join(fixture, 'Note.md'), 'utf8'), 'source')
    } finally {
      await dispose(loaded.context, loaded.root)
    }
  } finally {
    await rm(fixture, { recursive: true, force: true })
  }
})

test('active vault recent identity and drafts survive a bounded runtime restart', async () => {
  const vault = await mkdtemp(join(tmpdir(), 'note-vault-persistence-vault-'))
  const stateRoot = await mkdtemp(join(tmpdir(), 'note-vault-persistence-state-'))
  try {
    await writeFile(join(vault, 'Note.md'), 'note')
    const first = await load([
      `vaultRoot: ${JSON.stringify(vault)}`,
      `stateRoot: ${JSON.stringify(stateRoot)}`,
      'restoreActiveVault: true',
    ].join('\n'))
    let vaultId = ''
    try {
      const state = first.context.noteVault.state
      if (!state.active) assert.fail('configured vault must be active')
      vaultId = state.id
      const saved = await first.context.noteVault.saveDraft({
        content: 'draft canary',
        expectedVault: { id: state.id, generation: state.generation },
        path: 'Note.md',
        revision: 'file:canary',
      }, new AbortController().signal)
      assert.equal(saved.ok, true)
    } finally {
      await dispose(first.context, first.root)
    }
    assert.deepEqual(
      (await readdir(join(stateRoot, 'vault-state'))).sort(),
      ['selection.json'],
    )

    const second = await load([
      'vaultRoot: null',
      `stateRoot: ${JSON.stringify(stateRoot)}`,
      'restoreActiveVault: true',
    ].join('\n'))
    try {
      const state = second.context.noteVault.state
      if (!state.active) assert.fail('persisted vault must reactivate')
      assert.equal(state.id, vaultId)
      const recents = second.context.noteVault.listRecentVaults()
      assert.deepEqual(recents, [{ id: vaultId, lastOpenedAt: recents[0]?.lastOpenedAt }])
      assert.equal(JSON.stringify(recents).includes(vault), false)
      const draft = await second.context.noteVault.readDraft({
        expectedVault: { id: state.id, generation: state.generation },
        path: 'Note.md',
      }, new AbortController().signal)
      assert.equal(draft.draft?.content, 'draft canary')
      assert.equal(draft.draft?.revision, 'file:canary')
      await second.context.noteVault.clearDraft({
        expectedVault: { id: state.id, generation: state.generation },
        path: 'Note.md',
      }, new AbortController().signal)
      assert.equal((await second.context.noteVault.readDraft({
        expectedVault: { id: state.id, generation: state.generation },
        path: 'Note.md',
      }, new AbortController().signal)).draft, null)
    } finally {
      await dispose(second.context, second.root)
    }
  } finally {
    await rm(vault, { recursive: true, force: true })
    await rm(stateRoot, { recursive: true, force: true })
  }
})

test('recent vault persistence dedupes caps and reactivates by opaque ID', async () => {
  const stateRoot = await mkdtemp(join(tmpdir(), 'note-vault-recents-state-'))
  const vaults = await Promise.all(['A', 'B', 'C'].map(async name => {
    const vault = await mkdtemp(join(tmpdir(), `note-vault-recent-${name}-`))
    return vault
  }))
  try {
    const first = await load([
      `vaultRoot: ${JSON.stringify(vaults[0])}`,
      `stateRoot: ${JSON.stringify(stateRoot)}`,
      'recentVaultLimit: 2',
    ].join('\n'))
    let ids: string[] = []
    try {
      first.context.noteVault.activate(vaults[1]!, 1)
      first.context.noteVault.activate(vaults[2]!, 2)
      ids = first.context.noteVault.listRecentVaults().map(entry => entry.id)
      assert.equal(ids.length, 2)
    } finally {
      await dispose(first.context, first.root)
    }
    const second = await load([
      'vaultRoot: null',
      `stateRoot: ${JSON.stringify(stateRoot)}`,
      'recentVaultLimit: 2',
      'restoreActiveVault: true',
    ].join('\n'))
    try {
      const state = second.context.noteVault.state
      if (!state.active) assert.fail('last active vault must restore')
      assert.equal(state.id, ids[0])
      assert.deepEqual(second.context.noteVault.listRecentVaults().map(entry => entry.id), ids)
      const reactivated = second.context.noteVault.activateRecentVault(ids[1]!, 1)
      assert.equal(reactivated.active, true)
      if (!reactivated.active) assert.fail('recent vault must activate')
      assert.equal(reactivated.id, ids[1])
      assert.equal(reactivated.generation, 2)
    } finally {
      await dispose(second.context, second.root)
    }
  } finally {
    await rm(stateRoot, { recursive: true, force: true })
    await Promise.all(vaults.map(vault => rm(vault, { recursive: true, force: true })))
  }
})

test('legacy Tockbot vault state migrates read-only and sandbox/removal stay opaque', async () => {
  const stateRoot = await mkdtemp(join(tmpdir(), 'note-vault-legacy-state-'))
  const active = await mkdtemp(join(tmpdir(), 'note-vault-legacy-active-'))
  const recent = await mkdtemp(join(tmpdir(), 'note-vault-legacy-recent-'))
  try {
    await writeFile(join(stateRoot, 'notes-vault-path'), `${active}\n`)
    await writeFile(join(stateRoot, 'notes-recent-vaults.json'), JSON.stringify([recent, active]))
    const loaded = await load([
      'vaultRoot: null',
      `stateRoot: ${JSON.stringify(stateRoot)}`,
      'restoreActiveVault: true',
    ].join('\n'))
    try {
      const state = loaded.context.noteVault.state
      if (!state.active) assert.fail('legacy active vault must restore')
      const recents = loaded.context.noteVault.listRecentVaults()
      assert.equal(recents.length, 2)
      assert.equal(JSON.stringify(recents).includes(active), false)
      assert.equal(JSON.stringify(recents).includes(recent), false)
      const other = recents.find(vault => vault.id !== state.id)
      assert.ok(other)
      assert.deepEqual(loaded.context.noteVault.removeRecentVault(other.id, state.generation), [recents.find(vault => vault.id === state.id)])

      const managed = loaded.context.noteVault.createManagedVault('Class Notes', state.generation)
      if (!managed.active) assert.fail('managed vault must activate')
      assert.equal(await lstat(join(stateRoot, 'TockTutor Vaults', 'Class Notes')).then(entry => entry.isDirectory()), true)
      assert.throws(() => loaded.context.noteVault.createManagedVault('../escape', managed.generation), /invalid/i)

      const sandbox = loaded.context.noteVault.openSandboxVault(managed.generation)
      if (!sandbox.active) assert.fail('sandbox must activate')
      const sandboxRoot = join(stateRoot, 'TockTutor Sandbox')
      assert.match(await readFile(join(sandboxRoot, 'Welcome.md'), 'utf8'), /TockTutor Sandbox/u)
      await writeFile(join(sandboxRoot, 'Welcome.md'), 'local edit')
      loaded.context.noteVault.openSandboxVault(sandbox.generation)
      assert.equal(await readFile(join(sandboxRoot, 'Welcome.md'), 'utf8'), 'local edit')
    } finally {
      await dispose(loaded.context, loaded.root)
    }
  } finally {
    await rm(stateRoot, { recursive: true, force: true })
    await rm(active, { recursive: true, force: true })
    await rm(recent, { recursive: true, force: true })
  }
})

test('persisted vault state fails closed on symlinked malformed oversized and future records', async () => {
  const stateRoot = await mkdtemp(join(tmpdir(), 'note-vault-state-tamper-'))
  const vault = await mkdtemp(join(tmpdir(), 'note-vault-state-valid-'))
  const outside = await mkdtemp(join(tmpdir(), 'note-vault-state-outside-'))
  try {
    const directory = join(stateRoot, 'vault-state')
    await mkdir(directory)
    const outsideActive = join(outside, 'active')
    await writeFile(outsideActive, `${vault}\n`)
    await symlink(outsideActive, join(directory, 'active'))
    await symlink(outsideActive, join(directory, 'recent.json'))
    await writeFile(join(directory, 'active.crash.tmp'), `${vault}\n`)
    const unsafe = await load([
      'vaultRoot: null',
      `stateRoot: ${JSON.stringify(stateRoot)}`,
      'restoreActiveVault: true',
    ].join('\n'))
    try {
      assert.deepEqual(unsafe.context.noteVault.state, { active: false, generation: 0 })
      assert.deepEqual(unsafe.context.noteVault.listRecentVaults(), [])
    } finally {
      await dispose(unsafe.context, unsafe.root)
    }

    await rm(join(directory, 'active'))
    await rm(join(directory, 'recent.json'))
    await writeFile(join(directory, 'active'), `${vault}\n`)
    await writeFile(join(directory, 'recent.json'), JSON.stringify([
      { root: vault, lastOpenedAt: Date.now() + 48 * 60 * 60_000 },
      { root: 'x'.repeat(32_769), lastOpenedAt: 1 },
    ]))
    const inspected = await load([
      'vaultRoot: null',
      `stateRoot: ${JSON.stringify(stateRoot)}`,
      'restoreActiveVault: false',
    ].join('\n'))
    try {
      assert.deepEqual(inspected.context.noteVault.state, { active: false, generation: 0 })
      assert.equal(inspected.context.noteVault.listRecentVaults()[0]?.lastOpenedAt, 0)
    } finally {
      await dispose(inspected.context, inspected.root)
    }

    const bounded = await load([
      'vaultRoot: null',
      `stateRoot: ${JSON.stringify(stateRoot)}`,
      'restoreActiveVault: true',
    ].join('\n'))
    try {
      assert.equal(bounded.context.noteVault.state.active, true)
      const recents = bounded.context.noteVault.listRecentVaults()
      assert.equal(recents.length, 1)
      assert.equal((recents[0]?.lastOpenedAt ?? -1) >= 0, true)
    } finally {
      await dispose(bounded.context, bounded.root)
    }
  } finally {
    await rm(stateRoot, { recursive: true, force: true })
    await rm(vault, { recursive: true, force: true })
    await rm(outside, { recursive: true, force: true })
  }
})

test('draft reads reject malformed oversized and symlinked state and stale writes clean up', async () => {
  const fixture = await mkdtemp(join(tmpdir(), 'note-vault-draft-guards-'))
  const secondVault = await mkdtemp(join(tmpdir(), 'note-vault-draft-second-'))
  const outside = await mkdtemp(join(tmpdir(), 'note-vault-draft-outside-'))
  try {
    await writeFile(join(fixture, 'Note.md'), 'note')
    const loaded = await load([
      `vaultRoot: ${JSON.stringify(fixture)}`,
      'maxDraftBytes: 128',
    ].join('\n'))
    try {
      const state = loaded.context.noteVault.state
      if (!state.active) assert.fail('configured vault must be active')
      const expectedVault = { id: state.id, generation: state.generation }
      const signal = new AbortController().signal
      await loaded.context.noteVault.saveDraft({
        content: 'valid',
        expectedVault,
        path: 'Note.md',
      }, signal)
      const draftFiles = await readdir(join(loaded.root, 'state'), { recursive: true })
      const draft = draftFiles.find(name => name.includes('drafts/') && name.endsWith('.json'))
      if (draft === undefined) assert.fail('draft file must exist')
      const draftPath = join(loaded.root, 'state', draft)
      await writeFile(draftPath, JSON.stringify({ content: 'x'.repeat(200), path: 'Note.md', updatedAt: 1 }))
      assert.equal((await loaded.context.noteVault.readDraft({ expectedVault, path: 'Note.md' }, signal)).draft, null)
      const outsideDraft = join(outside, 'draft.json')
      await writeFile(outsideDraft, JSON.stringify({ content: 'outside', path: 'Note.md', updatedAt: 1 }))
      await rm(draftPath)
      await symlink(outsideDraft, draftPath)
      assert.equal((await loaded.context.noteVault.readDraft({ expectedVault, path: 'Note.md' }, signal)).draft, null)
      await loaded.context.noteVault.saveDraft({
        content: 'preserved',
        expectedVault,
        path: 'Note.md',
      }, signal)
      assert.equal(await readFile(outsideDraft, 'utf8'), JSON.stringify({
        content: 'outside',
        path: 'Note.md',
        updatedAt: 1,
      }))
      assert.equal((await lstat(draftPath)).isSymbolicLink(), false)
      await duringFirstFileSync(
        join(fixture, 'Note.md'),
        () => { loaded.context.noteVault.activate(secondVault, 1) },
        async () => assert.rejects(
          loaded.context.noteVault.saveDraft({
            content: 'stale',
            expectedVault,
            path: 'Note.md',
          }, signal),
          error => error instanceof NoteVaultError && error.code === 'stale-vault',
        ),
      )
      assert.equal((await readFile(draftPath, 'utf8')).includes('preserved'), true)
      assert.deepEqual(
        (await readdir(dirname(draftPath))).filter(name => name.endsWith('.tmp')),
        [],
      )
    } finally {
      await dispose(loaded.context, loaded.root)
    }
  } finally {
    await rm(fixture, { recursive: true, force: true })
    await rm(secondVault, { recursive: true, force: true })
    await rm(outside, { recursive: true, force: true })
  }
})

test('Loader rejects a symlinked recovery state root', async () => {
  const outside = await mkdtemp(join(tmpdir(), 'note-vault-state-root-outside-'))
  const parent = await mkdtemp(join(tmpdir(), 'note-vault-state-root-link-'))
  try {
    const linked = join(parent, 'state')
    await symlink(outside, linked, process.platform === 'win32' ? 'junction' : 'dir')
    await assert.rejects(
      load(`vaultRoot: null\nstateRoot: ${JSON.stringify(linked)}`),
      /stateRoot.*safe directory/i,
    )
  } finally {
    await rm(outside, { recursive: true, force: true })
    await rm(parent, { recursive: true, force: true })
  }
})

test('Loader rejects invalid vault and read-bound configuration', async () => {
  await assert.rejects(load('vaultRoot: 42'), /vaultRoot.*string/i)
  await assert.rejects(load('vaultRoot: null\nmaxReadBytes: 0'), /maxReadBytes.*1/i)
  await assert.rejects(load('vaultRoot: null\nmaxAttachmentBytes: 0'), /maxAttachmentBytes.*1/i)
  await assert.rejects(
    load('vaultRoot: null\nmaxAttachmentBytes: 268435457'),
    /maxAttachmentBytes.*268435456/i,
  )
  await assert.rejects(load('vaultRoot: null\nmaxDraftBytes: 0'), /maxDraftBytes.*1/i)
  await assert.rejects(load('vaultRoot: null\nmaxDraftBytes: 33554433'), /maxDraftBytes.*33554432/i)
  await assert.rejects(load('vaultRoot: null\nmaxFolderBytes: 0'), /maxFolderBytes.*1/i)
  await assert.rejects(load('vaultRoot: null\nmaxFolderBytes: 1073741825'), /maxFolderBytes.*1073741824/i)
  await assert.rejects(load('vaultRoot: null\nmaxReadBytes: 2097153'), /maxReadBytes.*2097152/i)
  await assert.rejects(load('vaultRoot: null\nmaxTreeDepth: 0'), /maxTreeDepth.*1/i)
  await assert.rejects(load('vaultRoot: null\nmaxTreeDepth: 129'), /maxTreeDepth.*128/i)
  await assert.rejects(load('vaultRoot: null\nmaxTreeEntries: 100001'), /maxTreeEntries.*100000/i)
  await assert.rejects(load('vaultRoot: null\nmaxTreeResults: 1001'), /maxTreeResults.*1000/i)
  await assert.rejects(load('vaultRoot: null\nrecentVaultLimit: 0'), /recentVaultLimit.*1/i)
  await assert.rejects(load('vaultRoot: null\nrecentVaultLimit: 101'), /recentVaultLimit.*100/i)
  await assert.rejects(load('vaultRoot: null\nrestoreActiveVault: 1'), /restoreActiveVault.*boolean/i)
  await assert.rejects(load('vaultRoot: null\nsnapshotLimit: 0'), /snapshotLimit.*1/i)
  await assert.rejects(load('vaultRoot: null\nsnapshotLimit: 101'), /snapshotLimit.*100/i)
  await assert.rejects(load('vaultRoot: null\nsnapshotRetentionDays: 3651'), /snapshotRetentionDays.*3650/i)
  await assert.rejects(load('vaultRoot: null\nstateRoot: 42'), /stateRoot.*string/i)
})

test('Loader rejects configured roots that are not existing directories', async () => {
  const fixture = await mkdtemp(join(tmpdir(), 'note-vault-invalid-root-'))
  try {
    const file = join(fixture, 'note.md')
    await writeFile(file, '# Note\n')
    await assert.rejects(
      load(`vaultRoot: ${JSON.stringify(file)}`),
      /vaultRoot.*existing directory/i,
    )
    await assert.rejects(
      load(`vaultRoot: ${JSON.stringify(join(fixture, 'missing'))}`),
      /vaultRoot.*existing directory/i,
    )
  } finally {
    await rm(fixture, { recursive: true, force: true })
  }
})
