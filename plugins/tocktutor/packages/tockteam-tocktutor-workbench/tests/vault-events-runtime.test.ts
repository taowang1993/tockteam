import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import test from 'node:test'
import { Context, Service } from '@deepseek-ai/cordis'
import { applyNoteVaultEventForwarding } from '../../../../../scripts/note-vault-event-forwarding.mjs'
import NoteVaultRuntime from 'tockbot-note-runtime'
import { WorkbenchRouteController } from '../dist/route.js'
import { TockTutorWorkbenchGateway } from '../dist/host-read.js'
import type { WorkbenchRouteRemote } from '../src/route.tsx'
import { isNoteVaultChangeEvent, type NoteVaultChangeEvent } from '../src/vault-events.ts'

declare module '@deepseek-ai/cordis' {
  interface Events {
    'commands/change'(): void
    'note-vault/private'(value: { secret: string }): void
  }
}

const require = createRequire(import.meta.url)
const installedManifest = require.resolve('@deepseek-ai/dsh-api-remotes/package.json')

async function stagedRemotes(root: string) {
  const manifest = JSON.parse(await readFile(installedManifest, 'utf8'))
  const installedRequire = createRequire(installedManifest)
  const packageRoot = join(root, 'node_modules', manifest.name)
  await mkdir(join(packageRoot, 'lib'), { recursive: true })
  await writeFile(join(packageRoot, 'package.json'), JSON.stringify(manifest))
  const original = await readFile(join(dirname(installedManifest), 'lib/index.js'), 'utf8')
  await writeFile(join(packageRoot, 'lib/index.js'), original)
  for (const dependency of Object.keys({ ...manifest.dependencies, ...manifest.peerDependencies })) {
    const target = join(root, 'node_modules', dependency)
    await mkdir(dirname(target), { recursive: true })
    await symlink(dirname(installedRequire.resolve(`${dependency}/package.json`)), target, 'dir')
  }
  applyNoteVaultEventForwarding(root)
  assert.equal(await readFile(join(dirname(installedManifest), 'lib/index.js'), 'utf8'), original)
  return await import(pathToFileURL(join(packageRoot, 'lib/index.js')).href)
}

type Frame = { event: string; args: unknown[] }

// Observe the real upstream event source at the existing Gateway boundary.
class EventSink extends Service {
  frames: Frame[] = []
  activeRegistrations = 0
  onFrame: ((frame: Frame) => void) | undefined
  acknowledged: (() => void) | undefined
  constructor(ctx: Context) { super(ctx, 'typertGateway') }
  registerRemoteEvents(source: (signal: AbortSignal) => AsyncIterable<Frame>): () => Promise<void> {
    assert.equal(this.activeRegistrations, 0, 'only one Remote event source may be active')
    this.activeRegistrations++
    const abort = new AbortController()
    const stream = source(abort.signal)
    const done = (async () => {
      for await (const frame of stream) {
        this.frames.push(frame)
        this.onFrame?.(frame)
        if (frame.event === 'commands/change') this.acknowledged?.()
      }
    })()
    return async () => { abort.abort(); await done; this.activeRegistrations-- }
  }
}

for (const mutation of ['save', 'external'] as const) test(`forwards a real Runtime ${mutation} through the sole pinned Host event source`, { timeout: 10_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'tocktutor-event-source-'))
  const vaultRoot = join(root, 'vault')
  const context = new Context()
  try {
    await mkdir(vaultRoot)
    await writeFile(join(vaultRoot, 'A.md'), '# A\n')
    await context.plugin(EventSink)
    const forwarding = await context.plugin(await stagedRemotes(root))
    await context.plugin(NoteVaultRuntime, { ...NoteVaultRuntime.Config(), vaultRoot, stateRoot: join(root, 'state') })
    const runtime = context.get('noteVault')
    assert.ok(runtime)
    const sink = context.get('typertGateway') as unknown as EventSink
    const state = runtime.state
    assert.equal(state.active, true)
    if (!state.active) throw new Error('Runtime did not activate fixture vault')
    const vault = { id: state.id, generation: state.generation }
    const local: unknown[] = []
    context.on('note-vault/change', event => { local.push(event) })
    if (mutation === 'save') {
      const signal = new AbortController().signal
      const opened = await runtime.openDocument('A.md', vault, signal)
      await runtime.saveDocument({ path: 'A.md', expectedVault: vault, expectedRevision: opened.revision, content: '# A\n[[B]]\n' }, signal)
    } else {
      await writeFile(join(vaultRoot, 'A.md'), '# External\n[[B]]\n')
      for (let attempt = 0; attempt < 100 && !local.some(matchesMutation); attempt++) await new Promise(resolve => setTimeout(resolve, 10))
    }
    function matchesMutation(event: unknown): boolean {
      return isNoteVaultChangeEvent(event) && event.kind === 'entry' && event.path === 'A.md'
        && (mutation === 'save' ? event.action === 'updated' : event.action.startsWith('external-'))
    }
    const acknowledged = new Promise<void>(resolve => { sink.acknowledged = resolve })
    context.emit('note-vault/private', { secret: 'not forwarded' })
    context.emit('commands/change')
    await acknowledged
    assert.match(await readFile(join(vaultRoot, 'A.md'), 'utf8'), /\[\[B\]\]/u)
    assert.ok(local.some(matchesMutation), `Runtime must emit its real ${mutation} event locally`)
    assert.ok(sink.frames.some(frame => frame.event === 'note-vault/change' && matchesMutation(frame.args[0])), `Runtime ${mutation} event must reach the real registered Remote source`)
    assert.equal(sink.frames.some(frame => frame.event === 'note-vault/private'), false)
    assert.equal(sink.activeRegistrations, 1)
    await forwarding.dispose()
    assert.equal(sink.activeRegistrations, 0)
    const count = sink.frames.length
    context.emit('note-vault/change', { kind: 'tree', action: 'changed', vault })
    context.emit('commands/change')
    await new Promise(resolve => setTimeout(resolve, 0))
    assert.equal(sink.frames.length, count)
  } finally {
    await context.fiber.dispose()
    await rm(root, { recursive: true, force: true })
  }
})


test('real save, Properties save and external mutation refresh linked peers through the staged Cordis event source', { timeout: 15_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'tocktutor-linked-runtime-'))
  const vaultRoot = join(root, 'vault')
  const host = new Context()
  const client = new Context()
  let controller: WorkbenchRouteController | undefined
  try {
    await mkdir(vaultRoot)
    await writeFile(join(vaultRoot, 'B.md'), '# B\n')
    await writeFile(join(vaultRoot, '中文 A.md'), '# A\n')
    await host.plugin(EventSink)
    await host.plugin(await stagedRemotes(root))
    await host.plugin(NoteVaultRuntime, { ...NoteVaultRuntime.Config(), vaultRoot, stateRoot: join(root, 'state') })
    await host.plugin(TockTutorWorkbenchGateway)
    const sink = host.get('typertGateway') as unknown as EventSink
    sink.onFrame = frame => {
      if (frame.event === 'note-vault/change' && isNoteVaultChangeEvent(frame.args[0])) client.emit('note-vault/change', frame.args[0])
    }
    const gateway = host.get('tocktutorWorkbench')
    const runtime = host.get('noteVault')
    assert.ok(gateway)
    assert.ok(runtime)
    const methods = Object.fromEntries(['currentVault', 'listTree', 'openDocument', 'readDraft', 'saveDraft', 'clearDraft', 'saveDocument', 'outline', 'links'].map(name => [name, async (...args: unknown[]) => {
      if (!(args.at(-1) instanceof AbortSignal)) {
        if (args.at(-1) === undefined) args.pop()
        args.push(new AbortController().signal)
      }
      return { ok: true, value: await Reflect.apply(Reflect.get(gateway, name), gateway, args) }
    }]))
    // The fixture activates its vault directly; it does not emulate Desktop selection authority.
    methods.currentVault = async () => {
      const state = runtime.state
      assert.equal(state.active, true)
      if (!state.active) throw new Error('Fixture vault inactive')
      return { ok: true, value: { generation: state.generation, vault: { id: state.id, generation: state.generation }, name: 'Fixture', displayPath: vaultRoot } }
    }
    const remote = { $on: (event: 'note-vault/change', listener: (event: NoteVaultChangeEvent) => void) => client.on(event, listener), tocktutorWorkbench: methods } as unknown as WorkbenchRouteRemote
    controller = new WorkbenchRouteController(remote, () => {}, () => new Date(), null)
    const route = controller
    await route.syncLocation('/tocktutor/B.md')
    assert.equal(route.getSnapshot().phase, 'ready', route.getSnapshot().message)
    assert.equal(route.getSnapshot().path, 'B.md', route.getSnapshot().message)
    const source = route.getSnapshot().focusedPaneId
    assert.equal(await route.openLinkedView(source, 'backlinks'), true)
    assert.equal(await route.openLinkedView(source, 'outgoing-links'), true)
    const peers = route.getSnapshot().panes.filter(pane => pane.linkedView).map(pane => pane.id)
    const settled = async (phase: string, check: () => boolean) => {
      for (let i = 0; i < 200 && !check(); i++) await new Promise(resolve => setTimeout(resolve, 10))
      if (!check()) assert.fail(`linked relationship state must settle: ${JSON.stringify({
        phase, source: await readFile(join(vaultRoot, '中文 A.md'), 'utf8'),
        frames: sink.frames.filter(frame => frame.event === 'note-vault/change').slice(-40),
        peers: peers.map(id => { const pane = route.getPaneSnapshot(id); return { id, path: pane.path, links: pane.links, error: pane.linkedError } }),
      })}`)
    }
    await route.splitPane(source, 'horizontal')
    assert.equal(await route.select('中文 A.md'), true, route.getSnapshot().message)
    route.setMode('source')
    route.edit('# A\n[[B]]\n')
    assert.equal(await route.save(), true)
    await settled('owned save adds link', () => peers.every(id => route.getPaneSnapshot(id).links?.backlinks.includes('中文 A.md')))
    assert.match(await readFile(join(vaultRoot, '中文 A.md'), 'utf8'), /\[\[B\]\]/u)

    await route.openLinkedView(route.getSnapshot().focusedPaneId, 'properties')
    const properties = route.getSnapshot().panes.find(pane => pane.linkedView?.kind === 'properties')!.id
    assert.equal(route.bindLinkedProperty(properties)('title', 'Saved through Properties'), true)
    assert.equal(await route.saveLinkedView(properties), true)
    assert.match(await readFile(join(vaultRoot, '中文 A.md'), 'utf8'), /title: Saved through Properties/u)
    route.edit('# A\n')
    assert.equal(await route.save(), true)
    await settled('owned save removes link', () => peers.every(id => route.getPaneSnapshot(id).links?.backlinks.length === 0))

    await writeFile(join(vaultRoot, '中文 A.md'), '# External\n[[B]]\n')
    await settled('external write adds link', () => peers.every(id => route.getPaneSnapshot(id).links?.backlinks.includes('中文 A.md')))
    await route.closePane(peers[0]!)
    await writeFile(join(vaultRoot, '中文 A.md'), '# External without link\n')
    await settled('external write removes link after peer close', () => route.getPaneSnapshot(peers[1]!).links?.backlinks.length === 0)
  } finally {
    await controller?.dispose()
    await client.fiber.dispose()
    await host.fiber.dispose()
    await rm(root, { recursive: true, force: true })
  }
})

for (const operation of ['selection', 'active-entry', 'rename'] as const) test(`real tree delivery cannot cancel a pending ${operation}`, { timeout: 15_000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), 'tocktutor-operation-runtime-'))
  const vaultRoot = join(root, 'vault')
  const host = new Context()
  const client = new Context()
  const responseEntered = Promise.withResolvers<void>()
  const releaseResponse = Promise.withResolvers<void>()
  const deliveredTree = Promise.withResolvers<void>()
  const publishedTree = Promise.withResolvers<void>()
  t.signal.addEventListener('abort', () => {
    responseEntered.resolve()
    releaseResponse.resolve()
    deliveredTree.resolve()
    publishedTree.resolve()
  }, { once: true })
  let controller: WorkbenchRouteController | undefined
  let armed = false
  let mutationSeen = false
  let companionTreeSeen = false
  let responseReturned = false
  let renameResult: { rewrittenPaths: string[]; rewriteError?: string } | undefined
  let operationSignal: AbortSignal | undefined
  const invalidLinkedStates: string[] = []
  try {
    await mkdir(vaultRoot)
    for (const [path, content] of Object.entries({ 'A.md': '# A\n', 'B.md': '# B\n', 'Referrer.md': '[A](./A.md)\n', 'Unrelated.md': '# Unrelated\n' })) await writeFile(join(vaultRoot, path), content)
    await host.plugin(EventSink)
    await host.plugin(await stagedRemotes(root))
    await host.plugin(NoteVaultRuntime, { ...NoteVaultRuntime.Config(), vaultRoot, stateRoot: join(root, 'state') })
    await host.plugin(TockTutorWorkbenchGateway)
    const gateway = host.get('tocktutorWorkbench')!
    const runtime = host.get('noteVault')!
    const sink = host.get('typertGateway') as unknown as EventSink
    sink.onFrame = frame => {
      if (frame.event !== 'note-vault/change' || !isNoteVaultChangeEvent(frame.args[0])) return
      const event = frame.args[0]
      if (armed && event.kind === 'entry' && (operation === 'selection'
        ? event.path === 'Unrelated.md' && event.action.startsWith('external-')
        : operation === 'active-entry'
          ? event.path === 'A.md' && event.action.startsWith('external-')
          : event.action === 'moved' && event.fromPath === 'A.md' && event.path === 'Renamed.md')) {
        mutationSeen = true
        assert.equal(responseReturned, false, 'actual mutation must arrive before method response')
      }
      client.emit('note-vault/change', event)
      if (armed && mutationSeen && event.kind === 'tree') {
        companionTreeSeen = true
        deliveredTree.resolve()
      }
    }
    const methods = Object.fromEntries(['listTree', 'openDocument', 'readDraft', 'saveDraft', 'clearDraft', 'saveDocument', 'outline', 'links', 'renameDocument'].map(name => [name, async (...args: unknown[]) => {
      if (!(args.at(-1) instanceof AbortSignal)) {
        if (args.at(-1) === undefined) args.pop()
        args.push(new AbortController().signal)
      }
      const value = await Reflect.apply(Reflect.get(gateway, name), gateway, args)
      if (armed && (operation === 'rename' ? name === 'renameDocument' : name === 'openDocument' && args[0] === 'B.md')) {
        operationSignal = args.at(-1) as AbortSignal
        if (name === 'renameDocument') {
          renameResult = value as typeof renameResult
          assert.equal(mutationSeen && companionTreeSeen, true, 'real move and companion tree arrive before Runtime rewrite method returns')
        }
        responseEntered.resolve()
        await releaseResponse.promise
        responseReturned = true
      }
      return { ok: true, value }
    }]))
    methods.currentVault = async () => {
      const state = runtime.state
      if (!state.active) throw new Error('Fixture vault inactive')
      return { ok: true, value: { generation: state.generation, vault: { id: state.id, generation: state.generation }, name: 'Fixture', displayPath: vaultRoot } }
    }
    const remote = { $on: (event: 'note-vault/change', listener: (event: NoteVaultChangeEvent) => void) => client.on(event, listener), tocktutorWorkbench: methods } as unknown as WorkbenchRouteRemote
    const navigations: string[] = []
    controller = new WorkbenchRouteController(remote, path => { navigations.push(path) }, () => new Date(), null)
    const route = controller
    await route.syncLocation(operation === 'rename' ? '/tocktutor/B.md' : '/tocktutor/A.md')
    await route.select('A.md', true, undefined, true, true)
    if (operation === 'rename') {
      assert.equal(await route.select('B.md'), true)
      assert.equal(await route.select('A.md'), true)
    }
    const source = route.getSnapshot().focusedPaneId
    assert.equal(await route.openLinkedView(source, 'backlinks'), true)
    const linked = route.getSnapshot().panes.find(pane => pane.linkedView)!.id
    await route.focusPane(source)
    const binding = route.getSnapshot().panes.find(pane => pane.id === linked)!.linkedView!
    const tabId = binding.sourceTabId
    route.subscribe(() => {
      if (!armed) return
      const snapshot = route.getSnapshot()
      const pane = route.getPaneSnapshot(linked)
      if (!responseReturned && (pane.documentUnavailable || pane.linkedError)) invalidLinkedStates.push(pane.linkedError ?? 'unavailable')
      const currentBinding = snapshot.panes.find(candidate => candidate.id === linked)?.linkedView
      if (!responseReturned && (currentBinding?.path !== 'A.md' || currentBinding.sourceGroupId !== source || currentBinding.sourceTabId !== tabId)) invalidLinkedStates.push('source binding changed before rename response')
      if (companionTreeSeen && (operation === 'selection'
        ? snapshot.entries.some(entry => entry.path === 'Unrelated.md' && entry.kind === 'document' && entry.size === '# External mutation\n'.length)
        : operation === 'active-entry'
          ? snapshot.source === '# External active mutation\n'
            && snapshot.entries.some(entry => entry.path === 'A.md' && entry.kind === 'document' && entry.size === '# External active mutation\n'.length)
          : snapshot.entries.some(entry => entry.path === 'Renamed.md') && !snapshot.entries.some(entry => entry.path === 'A.md'))) publishedTree.resolve()
    })
    armed = true
    const pending = operation === 'rename' ? route.renameActiveTitle('Renamed') : route.select('B.md')
    if (operation === 'selection') {
      await responseEntered.promise
      await writeFile(join(vaultRoot, 'Unrelated.md'), '# External mutation\n')
    } else if (operation === 'active-entry') {
      await responseEntered.promise
      await writeFile(join(vaultRoot, 'A.md'), '# External active mutation\n')
    }
    await deliveredTree.promise
    await publishedTree.promise
    await responseEntered.promise
    t.signal.throwIfAborted()
    assert.equal(route.getSnapshot().path, 'A.md', 'foreground response remains held')
    releaseResponse.resolve()
    assert.equal(await pending, true, `${operation} must reconcile after background tree delivery: ${JSON.stringify({ signalAborted: operationSignal?.aborted, renameResult, message: route.getSnapshot().message, events: sink.frames.filter(frame => frame.event === 'note-vault/change').map(frame => frame.args[0]) })}`)
    assert.equal(operationSignal?.aborted, false)
    assert.deepEqual(invalidLinkedStates, [], 'committed rename must not transiently orphan the linked source')
    if (operation === 'rename') {
      assert.equal(renameResult?.rewriteError, undefined)
      assert.deepEqual(renameResult?.rewrittenPaths, ['Referrer.md'])
      assert.equal(await readFile(join(vaultRoot, 'Referrer.md'), 'utf8'), '[A](./Renamed.md)\n')
      assert.equal(route.getSnapshot().path, 'Renamed.md')
      assert.ok(route.getSnapshot().panes.find(pane => pane.id === source)!.tabs.some(tab => tab.path === 'Renamed.md'))
      const renamedBinding = route.getSnapshot().panes.find(pane => pane.id === linked)!.linkedView!
      assert.equal(renamedBinding.path, 'Renamed.md')
      assert.equal(renamedBinding.sourceTabId, tabId)
      assert.equal(renamedBinding.sourceGroupId, source)
      assert.equal(navigations.at(-1), '/tocktutor/Renamed.md')
      armed = false
      assert.equal(await route.goBack(), true)
      assert.equal(route.getSnapshot().path, 'B.md')
      assert.equal(await route.goBack(), true)
      assert.equal(route.getSnapshot().path, 'Renamed.md', 'pre-rename history must be remapped, not left at A.md')
      assert.equal(await route.goForward(), true)
      assert.equal(route.getSnapshot().path, 'B.md')
      assert.equal(await route.goForward(), true)
      assert.equal(route.getSnapshot().path, 'Renamed.md')
    } else assert.equal(route.getSnapshot().path, 'B.md')
  } finally {
    releaseResponse.resolve()
    try { await controller?.dispose() } finally {
      try { await client.fiber.dispose() } finally {
        try { await host.fiber.dispose() } finally { await rm(root, { recursive: true, force: true }) }
      }
    }
  }
})
