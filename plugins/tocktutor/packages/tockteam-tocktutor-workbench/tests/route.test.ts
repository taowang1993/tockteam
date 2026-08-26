import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createCanvasChange } from '../dist/canvas-change.js'
import { updateCanvasNodeGeometry } from '../dist/canvas-nodes.js'
import {
  MAX_ROUTE_SOURCE_BYTES,
  pathFromTockTutorLocation,
  TockTutorRouteView,
  WorkbenchRouteController,
  type WorkbenchRouteRemote,
} from '../dist/route.js'
import type {
  CreateDocumentRequest,
  NoteVaultChangeEvent,
  OpenDocumentResult,
  VaultReference,
  VaultTreePage,
  WriteDocumentResult,
} from '../dist/types.js'

const firstVault = Object.freeze({ generation: 3, id: `vault:${'1'.repeat(64)}` })
const secondVault = Object.freeze({ generation: 4, id: `vault:${'2'.repeat(64)}` })
const sandboxVault = Object.freeze({ generation: 5, id: `vault:${'3'.repeat(64)}` })
const firstRevision = `file:${'a'.repeat(64)}`
const secondRevision = `file:${'b'.repeat(64)}`
function success<T>(value: T) {
  return Promise.resolve({ ok: true as const, value })
}

function failure(code: string, message: string) {
  return Promise.resolve({
    error: { code, details: {}, message },
    ok: false as const,
  })
}

class MemoryStorage {
  readonly values = new Map<string, string>()
  getItem(key: string) { return this.values.get(key) ?? null }
  setItem(key: string, value: string) { this.values.set(key, value) }
  removeItem(key: string) { this.values.delete(key) }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(next => { resolve = next })
  return { promise, resolve }
}

function tree(vault: VaultReference): VaultTreePage {
  return {
    complete: true,
    cursor: null,
    entries: [
      {
        createdAt: 1,
        kind: 'document',
        modifiedAt: 2,
        path: 'Folder/Note.md',
        revision: firstRevision,
        size: 30,
      },
      {
        createdAt: 1,
        kind: 'document',
        modifiedAt: 2,
        path: 'Second.md',
        revision: firstRevision,
        size: 12,
      },
      {
        createdAt: 1,
        kind: 'document',
        modifiedAt: 2,
        path: 'Board.canvas',
        revision: firstRevision,
        size: 120,
      },
      {
        createdAt: 1,
        kind: 'document',
        modifiedAt: 2,
        path: 'Tasks.base',
        revision: firstRevision,
        size: 120,
      },
    ],
    generation: vault.generation,
    scan: { entries: 4 },
    truncated: false,
    truncationReason: null,
    warnings: [],
  }
}

class FakeRemote implements WorkbenchRouteRemote {
  vault: VaultReference | null = firstVault
  saveFailure: { code: string; message: string } | null = null
  draftContent: string | null = null
  snapshots: Array<{ createdAt: number; digest: string; id: string; path: string; reason: string; size: number }> = []
  trashEntries: Array<{ createdAt: number; id: string; kind: 'document'; originalPath: string }> = []
  readonly calls: Array<{ method: string; parameters: unknown[] }> = []
  readonly listeners = new Set<(event: NoteVaultChangeEvent) => void>()
  createOverride: ((request: CreateDocumentRequest) => Promise<{
    ok: true
    value: WriteDocumentResult
  }>) | null = null
  openOverride: ((path: string) => Promise<{ ok: true; value: OpenDocumentResult }>) | null = null
  saveOverride: (() => Promise<{ ok: true; value: WriteDocumentResult }>) | null = null

  readonly tocktutorWorkbench = {
    activateRecentVault: (request: { expectedGeneration: number; id: string }, signal?: AbortSignal) => {
      this.calls.push({ method: 'activateRecentVault', parameters: [request, signal] })
      const target = request.id === secondVault.id ? secondVault : firstVault
      this.vault = target
      return success(target)
    },
    createDocument: (request: CreateDocumentRequest, signal?: AbortSignal) => {
      this.calls.push({ method: 'createDocument', parameters: [request, signal] })
      if (this.createOverride !== null) return this.createOverride(request)
      return success({
        digest: `sha256:${'e'.repeat(64)}`,
        generation: request.expectedVault.generation,
        path: request.path,
        revision: secondRevision,
        status: 'created' as const,
      })
    },
    currentVault: (signal?: AbortSignal) => {
      this.calls.push({ method: 'currentVault', parameters: [signal] })
      return success(this.vault)
    },
    clearDraft: (request: { expectedVault: VaultReference; path: string }, signal?: AbortSignal) => {
      this.calls.push({ method: 'clearDraft', parameters: [request, signal] })
      this.draftContent = null
      return success({ generation: request.expectedVault.generation, ok: true as const })
    },
    listRecentVaults: (signal?: AbortSignal) => {
      this.calls.push({ method: 'listRecentVaults', parameters: [signal] })
      return success({
        generation: this.vault?.generation ?? 0,
        vaults: [firstVault, secondVault].map(vault => ({ id: vault.id, lastOpenedAt: vault.generation })),
      })
    },
    listSnapshots: (request: { expectedVault: VaultReference; path: string }, signal?: AbortSignal) => {
      this.calls.push({ method: 'listSnapshots', parameters: [request, signal] })
      return success({ generation: request.expectedVault.generation, snapshots: this.snapshots })
    },
    listTrash: (request: { expectedVault: VaultReference }, signal?: AbortSignal) => {
      this.calls.push({ method: 'listTrash', parameters: [request, signal] })
      return success({ entries: this.trashEntries, generation: request.expectedVault.generation })
    },
    listTree: (request: { expectedVault: VaultReference; cursor?: string | null; limit?: number }, signal?: AbortSignal) => {
      this.calls.push({ method: 'listTree', parameters: [request, signal] })
      return success(tree(request.expectedVault))
    },
    openSandboxVault: (request: { expectedGeneration: number }, signal?: AbortSignal) => {
      this.calls.push({ method: 'openSandboxVault', parameters: [request, signal] })
      this.vault = sandboxVault
      return success(sandboxVault)
    },
    readDraft: (request: { expectedVault: VaultReference; path: string }, signal?: AbortSignal) => {
      this.calls.push({ method: 'readDraft', parameters: [request, signal] })
      return success({
        draft: this.draftContent === null ? null : {
          content: this.draftContent,
          path: request.path,
          revision: firstRevision,
          updatedAt: 1,
        },
        generation: request.expectedVault.generation,
      })
    },
    readSnapshot: (request: { expectedVault: VaultReference; path: string; snapshotId: string }, signal?: AbortSignal) => {
      this.calls.push({ method: 'readSnapshot', parameters: [request, signal] })
      return success({
        content: '# Snapshot\n',
        generation: request.expectedVault.generation,
        snapshot: { createdAt: 1, digest: `sha256:${'a'.repeat(64)}`, id: request.snapshotId, path: request.path, reason: 'save', size: 11 },
      })
    },
    openDocument: (path: string, expectedVault: VaultReference, signal?: AbortSignal) => {
      this.calls.push({ method: 'openDocument', parameters: [path, expectedVault, signal] })
      if (this.openOverride !== null) return this.openOverride(path)
      return success({
        content: path === 'Folder/Note.md'
          ? '# Before\n- [ ] Verify route\n'
          : path === 'Board.canvas'
            ? JSON.stringify({
                customRoot: { preserve: true },
                nodes: [{
                  customNode: 'keep',
                  height: 80,
                  id: 'node-1',
                  text: 'Plan',
                  type: 'text',
                  width: 120,
                  x: 10,
                  y: 20,
                }],
              })
            : path === 'Tasks.base'
              ? 'views:\n  - type: table\n    name: Tasks\n    formula: status == "open"\n'
              : '# Second\n',
        digest: `sha256:${'c'.repeat(64)}`,
        generation: expectedVault.generation,
        path,
        revision: firstRevision,
      })
    },
    removeRecentVault: (request: { expectedGeneration: number; id: string }, signal?: AbortSignal) => {
      this.calls.push({ method: 'removeRecentVault', parameters: [request, signal] })
      return success({
        generation: this.vault?.generation ?? request.expectedGeneration,
        vaults: [firstVault, secondVault]
          .filter(vault => vault.id !== request.id)
          .map(vault => ({ id: vault.id, lastOpenedAt: vault.generation })),
      })
    },
    restoreSnapshotAsNew: (request: { expectedVault: VaultReference; path: string; snapshotId: string; toPath: string }, signal?: AbortSignal) => {
      this.calls.push({ method: 'restoreSnapshotAsNew', parameters: [request, signal] })
      return success({ digest: `sha256:${'a'.repeat(64)}`, generation: request.expectedVault.generation, path: request.toPath, revision: secondRevision, status: 'created' as const })
    },
    restoreTrash: (request: { expectedVault: VaultReference; id: string; toPath?: string }, signal?: AbortSignal) => {
      this.calls.push({ method: 'restoreTrash', parameters: [request, signal] })
      return success({ generation: request.expectedVault.generation, status: 'restored' })
    },
    saveDraft: (request: { content: string; expectedVault: VaultReference; path: string; revision?: string }, signal?: AbortSignal) => {
      this.calls.push({ method: 'saveDraft', parameters: [request, signal] })
      this.draftContent = request.content
      return success({ generation: request.expectedVault.generation, ok: true as const, updatedAt: 2 })
    },
    facets: (request: { expectedVault: VaultReference; limit?: number }, signal?: AbortSignal) => {
      this.calls.push({ method: 'facets', parameters: [request, signal] })
      return success({
        complete: true,
        cursor: null,
        generation: request.expectedVault.generation,
        properties: [{ count: 2, key: 'status', types: ['string' as const] }],
        scan: { bytes: 30, entries: 2, files: 2 },
        tags: [{ count: 2, tag: 'lesson/intro' }],
        truncated: false,
        truncationReason: null,
        warnings: [],
      })
    },
    graph: (request: { expectedVault: VaultReference; path?: string; scope?: 'local' | 'global' }, signal?: AbortSignal) => {
      this.calls.push({ method: 'graph', parameters: [request, signal] })
      return success({
        complete: true,
        cursor: null,
        edges: [{ fragment: null, kind: 'wiki' as const, line: 1, sourcePath: 'Folder/Note.md', targetPath: 'Second.md' }],
        generation: request.expectedVault.generation,
        missing: [],
        nodes: [{ depth: request.scope === 'local' ? 0 : null, path: 'Folder/Note.md' }, { depth: 1, path: 'Second.md' }],
        orphans: [],
        path: request.path ?? null,
        scan: { bytes: 30, entries: 2, files: 2 },
        truncated: false,
        truncationReason: null,
        warnings: [],
      })
    },
    links: (request: { expectedVault: VaultReference; includeUnlinked?: boolean; path: string }, signal?: AbortSignal) => {
      this.calls.push({ method: 'links', parameters: [request, signal] })
      return success({
        backlinkDetails: [{ authoredTarget: request.path, displayText: 'Note', fragment: null, kind: 'wiki' as const, line: 3, normalizedTarget: request.path, resolvedPath: request.path, sourcePath: 'Second.md', status: 'resolved' as const }],
        backlinks: ['Second.md'],
        cursor: null,
        generation: request.expectedVault.generation,
        outgoing: ['Second.md'],
        outgoingDetails: [{ authoredTarget: 'Second', displayText: 'Second', fragment: null, kind: 'wiki' as const, line: 2, normalizedTarget: 'Second.md', resolvedPath: 'Second.md', sourcePath: request.path, status: 'resolved' as const }],
        path: request.path,
        scan: { bytes: 30, entries: 2, files: 2 },
        tagRelations: [],
        truncated: false,
        truncationReason: null,
        unlinkedMentions: [],
        warnings: [],
      })
    },
    outline: (request: { expectedVault: VaultReference; includeFootnotes?: boolean; path: string }, signal?: AbortSignal) => {
      this.calls.push({ method: 'outline', parameters: [request, signal] })
      return success({
        footnotes: [{ content: 'Footnote', kind: 'inline' as const, line: 4, ordinal: 1 }],
        generation: request.expectedVault.generation,
        headings: [{ level: 1, line: 1, selector: 'Before', text: 'Before' }],
        path: request.path,
        truncated: false,
      })
    },
    search: (request: { expectedVault: VaultReference; limit?: number; mode?: string; query: string }, signal?: AbortSignal) => {
      this.calls.push({ method: 'search', parameters: [request, signal] })
      return success({
        cursor: null,
        generation: request.expectedVault.generation,
        matches: [{ kind: 'content' as const, line: 2, path: 'Folder/Note.md', preview: `Match ${request.query}` }],
        query: request.query,
        scan: { bytes: 30, entries: 4, files: 2 },
        truncated: false,
        truncationReason: null,
        warnings: [],
      })
    },
    saveDocument: (request: {
      content: string
      expectedRevision: string
      expectedVault: VaultReference
      path: string
    }, signal?: AbortSignal) => {
      this.calls.push({ method: 'saveDocument', parameters: [request, signal] })
      if (this.saveOverride !== null) return this.saveOverride()
      if (this.saveFailure !== null) return failure(this.saveFailure.code, this.saveFailure.message)
      const result: WriteDocumentResult = {
        digest: `sha256:${'d'.repeat(64)}`,
        generation: request.expectedVault.generation,
        path: request.path,
        revision: secondRevision,
        snapshotId: '2026-08-22T22-00-00-000Z-deadbeef',
        status: 'saved',
      }
      return success(result)
    },
    trashEntry: (request: { expectedRevision: string; expectedVault: VaultReference; path: string }, signal?: AbortSignal) => {
      this.calls.push({ method: 'trashEntry', parameters: [request, signal] })
      return success({ generation: request.expectedVault.generation, status: 'trashed' })
    },
  }

  $on(event: 'note-vault/change', listener: (change: NoteVaultChangeEvent) => void): () => void {
    assert.equal(event, 'note-vault/change')
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  emit(event: NoteVaultChangeEvent): void {
    for (const listener of this.listeners) listener(event)
  }
}

test('dirty-gates protocol open and exclusive create dispatch', async () => {
  const remote = new FakeRemote()
  const navigation: string[] = []
  const controller = new WorkbenchRouteController(remote, path => { navigation.push(path) })
  await controller.syncLocation('/tocktutor')
  assert.equal(await controller.select('Folder/Note.md'), true)
  controller.edit('# Dirty\n')

  assert.equal(await controller.handleDispatch({
    kind: 'protocol',
    operationId: 'open-second',
    request: { action: 'open', file: 'Second.md' },
  }), 'handled')
  assert.deepEqual(
    remote.calls.filter(call => call.method === 'saveDocument' || call.method === 'openDocument')
      .map(call => call.method),
    ['openDocument', 'saveDocument', 'openDocument'],
  )
  assert.equal(controller.getSnapshot().path, 'Second.md')

  controller.edit('# Still dirty\n')
  remote.saveFailure = { code: 'conflict', message: 'changed' }
  assert.equal(await controller.handleDispatch({
    kind: 'protocol',
    operationId: 'blocked-create',
    request: { action: 'new', content: '# Blocked\n', file: 'Blocked.md' },
  }), 'failed')
  assert.equal(remote.calls.some(call => call.method === 'createDocument'), false)

  remote.saveFailure = null
  assert.equal(await controller.handleDispatch({
    kind: 'protocol',
    operationId: 'create-note',
    request: { action: 'new', content: '# Created\n', file: 'Created.md' },
  }), 'handled')
  const create = remote.calls.find(call => call.method === 'createDocument')
  assert.deepEqual(create?.parameters[0], {
    content: '# Created\n',
    expectedVault: firstVault,
    path: 'Created.md',
  })
  assert.equal(controller.getSnapshot().path, 'Created.md')
  assert.equal(navigation.at(-1), '/tocktutor/Created.md')
  controller.dispose()
})

test('does not let a delayed native create steal newer same-vault navigation', async () => {
  const remote = new FakeRemote()
  const controller = new WorkbenchRouteController(remote, () => {})
  await controller.syncLocation('/tocktutor')
  const create = deferred<{ ok: true; value: WriteDocumentResult }>()
  remote.createOverride = () => create.promise
  const pending = controller.handleDispatch({
    kind: 'protocol',
    operationId: 'delayed-create',
    request: { action: 'new', file: 'Delayed.md' },
  })
  assert.equal(await controller.select('Second.md'), true)
  create.resolve({
    ok: true,
    value: {
      digest: `sha256:${'e'.repeat(64)}`,
      generation: firstVault.generation,
      path: 'Delayed.md',
      revision: secondRevision,
      status: 'created',
    },
  })
  assert.equal(await pending, 'stale')
  assert.equal(controller.getSnapshot().path, 'Second.md')
  controller.dispose()
})

test('does not let a delayed native create erase a newer edit', async () => {
  const remote = new FakeRemote()
  const controller = new WorkbenchRouteController(remote, () => {})
  await controller.syncLocation('/tocktutor')
  assert.equal(await controller.select('Folder/Note.md'), true)
  const create = deferred<{ ok: true; value: WriteDocumentResult }>()
  remote.createOverride = () => create.promise
  const pending = controller.handleDispatch({
    kind: 'protocol',
    operationId: 'delayed-create-after-edit',
    request: { action: 'new', file: 'Delayed.md' },
  })
  controller.edit('# Newer edit\n')
  create.resolve({
    ok: true,
    value: {
      digest: `sha256:${'e'.repeat(64)}`,
      generation: firstVault.generation,
      path: 'Delayed.md',
      revision: secondRevision,
      status: 'created',
    },
  })
  assert.equal(await pending, 'stale')
  assert.equal(controller.getSnapshot().path, 'Folder/Note.md')
  assert.equal(controller.getSnapshot().source, '# Newer edit\n')
  controller.dispose()
})

test('rejects protocol requests targeting an unverified vault name', async () => {
  const remote = new FakeRemote()
  const controller = new WorkbenchRouteController(remote, () => {})
  await controller.syncLocation('/tocktutor')
  assert.equal(await controller.handleDispatch({
    kind: 'protocol',
    operationId: 'foreign-vault',
    request: { action: 'new', file: 'Wrong.md', vault: 'Other Notes' },
  }), 'failed')
  assert.equal(remote.calls.some(call => call.method === 'createDocument'), false)
  controller.dispose()
})

test('dispatches approved daily and unique note defaults without inventing settings', async () => {
  const remote = new FakeRemote()
  const controller = new WorkbenchRouteController(
    remote,
    () => {},
    () => new Date(2026, 7, 24, 14, 5),
  )
  await controller.syncLocation('/tocktutor')

  assert.equal(await controller.handleDispatch({
    action: 'daily',
    kind: 'quick-action',
    operationId: 'daily',
  }), 'handled')
  assert.deepEqual(
    remote.calls.find(call => call.method === 'createDocument')?.parameters[0],
    {
      content: '---\njournal-date: 2026-08-24\n---\n# 2026-08-24\n',
      expectedVault: firstVault,
      path: 'Journals/2026-08-24.md',
    },
  )

  assert.equal(await controller.handleDispatch({
    kind: 'protocol',
    operationId: 'unique',
    request: { action: 'unique' },
  }), 'handled')
  const firstUnique = remote.calls.filter(call => call.method === 'createDocument').at(-1)?.parameters[0] as CreateDocumentRequest
  assert.match(firstUnique.path, /^202608241405-[0-9a-f-]{36}\.md$/u)
  assert.equal(await controller.handleDispatch({
    kind: 'protocol',
    operationId: 'unique-again',
    request: { action: 'unique' },
  }), 'handled')
  const secondUnique = remote.calls.filter(call => call.method === 'createDocument').at(-1)?.parameters[0] as CreateDocumentRequest
  assert.match(secondUnique.path, /^202608241405-[0-9a-f-]{36}\.md$/u)
  assert.notEqual(secondUnique.path, firstUnique.path)
  assert.equal(await controller.handleDispatch({
    kind: 'protocol',
    operationId: 'choose',
    request: { action: 'choose-vault' },
  }), 'failed')
  assert.equal(await controller.handleDispatch({
    kind: 'protocol',
    operationId: 'window',
    request: { action: 'open', file: 'Second.md', paneType: 'window' },
  }), 'failed')
  controller.dispose()
})

test('owns bounded quick New, Capture, and Search route interactions', async () => {
  const remote = new FakeRemote()
  const controller = new WorkbenchRouteController(
    remote,
    () => {},
    () => new Date(2026, 7, 24, 14, 5),
  )
  await controller.syncLocation('/tocktutor')

  const pendingNew = controller.handleDispatch({
    action: 'new',
    kind: 'quick-action',
    operationId: 'quick-new',
  })
  assert.equal(controller.getSnapshot().dispatchDialog, 'new')
  await controller.submitDispatchDialog({ path: 'Notes/Quick.md' })
  assert.equal(await pendingNew, 'handled')
  assert.deepEqual(
    remote.calls.find(call => call.method === 'createDocument')?.parameters[0],
    { content: '', expectedVault: firstVault, path: 'Notes/Quick.md' },
  )

  const pendingCapture = controller.handleDispatch({
    action: 'capture',
    kind: 'quick-action',
    operationId: 'quick-capture',
  })
  assert.equal(controller.getSnapshot().dispatchDialog, 'capture')
  const captureDraft = { title: 'Plan Today!', text: 'Review the migration.' }
  await Promise.all([
    controller.submitDispatchDialog(captureDraft),
    controller.submitDispatchDialog(captureDraft),
  ])
  assert.equal(await pendingCapture, 'handled')
  assert.equal(remote.calls.filter(call => call.method === 'createDocument').length, 2)
  assert.deepEqual(
    remote.calls.filter(call => call.method === 'createDocument').at(-1)?.parameters[0],
    {
      content: '# Plan Today!\n\nReview the migration.',
      expectedVault: firstVault,
      path: 'Inbox/2026-08-24-plan-today.md',
    },
  )

  assert.equal(await controller.handleDispatch({
    kind: 'protocol',
    operationId: 'search',
    request: { action: 'search', query: 'second' },
  }), 'handled')
  assert.equal(controller.getSnapshot().searchOpen, true)
  assert.equal(controller.getSnapshot().searchQuery, 'second')

  const html = renderToStaticMarkup(createElement(TockTutorRouteView, {
    onActivateTab() {},
    onAddPane() {},
    onEdit() {},
    onFocusPane() {},
    onMode() {},
    onMoveCanvas() {},
    onSave() {},
    onSelect() {},
    onToggleTask() {},
    snapshot: controller.getSnapshot(),
  }))
  assert.match(html, /<section[^>]+aria-label="Search Notes"/u)
  assert.match(html, /<input[^>]+aria-label="Search Notes Query"[^>]+value="second"/u)
  assert.match(html, />Second\.md</u)
  assert.doesNotMatch(html, />Folder\/Note\.md</u)
  controller.dispose()
})

test('returns stale or failed honestly across vault changes, reload, and unload', async () => {
  const remote = new FakeRemote()
  const controller = new WorkbenchRouteController(remote, () => {})
  await controller.syncLocation('/tocktutor')

  const pendingDialog = controller.handleDispatch({
    action: 'new',
    kind: 'quick-action',
    operationId: 'pending-dialog',
  })
  await controller.reload()
  assert.equal(await pendingDialog, 'stale')
  assert.equal(controller.getSnapshot().dispatchDialog, null)

  const create = deferred<{ ok: true; value: WriteDocumentResult }>()
  remote.createOverride = () => create.promise
  const pendingCreate = controller.handleDispatch({
    kind: 'protocol',
    operationId: 'stale-create',
    request: { action: 'new', file: 'Stale.md' },
  })
  remote.vault = secondVault
  await controller.reload()
  create.resolve({
    ok: true,
    value: {
      digest: `sha256:${'f'.repeat(64)}`,
      generation: firstVault.generation,
      path: 'Stale.md',
      revision: secondRevision,
      status: 'created',
    },
  })
  assert.equal(await pendingCreate, 'stale')
  assert.notEqual(controller.getSnapshot().path, 'Stale.md')

  assert.equal(await controller.handleDispatch({
    kind: 'protocol',
    operationId: 'unsafe',
    request: { action: 'new', file: '../Unsafe.md' },
  }), 'failed')

  const pendingUnload = controller.handleDispatch({
    action: 'capture',
    kind: 'quick-action',
    operationId: 'pending-unload',
  })
  controller.dispose()
  assert.equal(await pendingUnload, 'stale')
})

test('decodes only supported bounded document paths from the Desktop route', () => {
  assert.equal(pathFromTockTutorLocation('/tocktutor'), null)
  assert.equal(pathFromTockTutorLocation('/tocktutor/Folder/Plan%20One.md'), 'Folder/Plan One.md')
  assert.equal(pathFromTockTutorLocation('/tocktutor/%2E%2E/escape.md'), null)
  assert.equal(pathFromTockTutorLocation('/other/Note.md'), null)
  assert.equal(pathFromTockTutorLocation('/tocktutor/Board.canvas'), 'Board.canvas')
  assert.equal(pathFromTockTutorLocation('/tocktutor/Tasks.base'), 'Tasks.base')
  assert.equal(pathFromTockTutorLocation('/tocktutor/Note.txt'), null)
})

test('loads, edits, reads, toggles, and snapshot-saves one exact note', async () => {
  const remote = new FakeRemote()
  const navigation: Array<[string, 'push' | 'replace' | undefined]> = []
  const controller = new WorkbenchRouteController(remote, (path, mode) => { navigation.push([path, mode]) })
  await controller.syncLocation('/tocktutor')
  assert.equal(controller.getSnapshot().phase, 'ready')
  assert.deepEqual(controller.getSnapshot().entries.map(entry => entry.path), [
    'Board.canvas',
    'Folder/Note.md',
    'Second.md',
    'Tasks.base',
  ])

  assert.equal(await controller.select('Folder/Note.md'), true)
  assert.deepEqual(navigation, [['/tocktutor/Folder/Note.md', undefined]])
  assert.equal(controller.getSnapshot().source, '# Before\n- [ ] Verify route\n')
  controller.edit('x'.repeat(MAX_ROUTE_SOURCE_BYTES + 1))
  assert.equal(controller.getSnapshot().source, '# Before\n- [ ] Verify route\n')
  assert.match(controller.getSnapshot().message, /bounded source limit/u)

  controller.edit('# After\n- [ ] Verify route\n<script>unsafe()</script>\n')
  assert.equal(controller.getSnapshot().saveStatus, 'unsaved')
  controller.setMode('reading')
  controller.toggleTask(0)
  assert.match(controller.getSnapshot().source, /- \[x\] Verify route/u)
  assert.equal(await controller.save(), true)
  assert.equal(controller.getSnapshot().saveStatus, 'saved')
  assert.equal(controller.getSnapshot().revision, secondRevision)

  const saveCall = remote.calls.find(call => call.method === 'saveDocument')
  assert.deepEqual(saveCall?.parameters[0], {
    content: '# After\n- [x] Verify route\n<script>unsafe()</script>\n',
    expectedRevision: firstRevision,
    expectedVault: firstVault,
    path: 'Folder/Note.md',
  })

  const markup = renderToStaticMarkup(createElement(TockTutorRouteView, {
    assistantPanel: createElement('p', null, 'Assistant Surface'),
    onActivateTab() {},
    onAddPane() {},
    onEdit() {},
    onFocusPane() {},
    onMode() {},
    onMoveCanvas() {},
    onSave() {},
    onSelect() {},
    onToggleTask() {},
    snapshot: controller.getSnapshot(),
  }))
  const html = markup
  assert.match(html, /aria-label="TockTutor Workbench"/u)
  assert.match(html, /<section[^>]+aria-label="TockTutor Title Bar"/u)
  assert.match(html, /<button[^>]+aria-label="Search Notes"/u)
  assert.match(html, /<button[^>]+aria-label="New Note"/u)
  assert.doesNotMatch(html, /TockLauncher/u)
  assert.match(html, /pt-0/u)
  assert.match(html, /h-\[var\(--tockteam-titlebar-height,40px\)\]/u)
  assert.match(html, /tocktutor-titlebar absolute top-0/u)
  assert.match(html, /<button[^>]+aria-label="Resize Files Sidebar, 280 Pixels"/u)
  assert.match(html, /title="Drag or Use Left and Right Arrow Keys"/u)
  assert.match(html, /grid-template-columns:280px minmax\(0, 1fr\) auto auto/u)
  assert.match(html, /transition-\[grid-template-columns\] duration-300 ease-out/u)
  assert.match(html, /\[&amp;_svg\]:size-\[18px\]/u)
  assert.match(html, /<button[^>]+aria-expanded="true"[^>]+aria-label="Toggle Files Sidebar"/u)
  assert.match(html, /<button[^>]+aria-expanded="false"[^>]+aria-label="Toggle Assistant Panel"/u)
  assert.match(html, /class="lucide lucide-panel-left"/u)
  assert.match(html, /class="lucide lucide-panel-right"/u)
  assert.match(html, /tocktutor-panel-icon ml-auto/u)
  assert.match(html, /tocktutor-sidebar[^>]+bg-\[var\(--tockteam-shell-chrome,var\(--tt-panel\)\)\]/u)
  assert.doesNotMatch(html, /tocktutor-sidebar-resize[^>]+hover:after:bg-\[var\(--tt-accent\)\]/u)
  const sidebarHeader = html.match(/<header class="tocktutor-sidebar-header[^>]*>(?<content>.*?)<\/header>/u)?.groups?.content
  assert.ok(sidebarHeader)
  assert.doesNotMatch(sidebarHeader, /M15 3v18/u)
  assert.match(html, /\[--tt-footer-height:28px\]/u)
  assert.match(html, /grid-rows-\[40px_minmax\(0,1fr\)_var\(--tt-footer-height\)\]/u)
  assert.match(html, /\[--tt-tab-border:#d1d5db\]/u)
  assert.match(html, /\[--tt-tab-curve:10px\]/u)
  assert.match(html, /box-shadow:inset_0_0_0_1px_var\(--tt-tab-border\)/u)
  assert.match(html, /<aside[^>]+aria-hidden="false"[^>]+aria-label="Files"[^>]+data-open="true"/u)
  assert.match(html, /<aside[^>]+aria-hidden="true"[^>]+aria-label="Assistant Panel"[^>]+class="tocktutor-right-panel tocktutor-right-panel-assistant[^>]+data-open="false"[^>]+inert=""/u)
  assert.doesNotMatch(html, /aria-label="Close Assistant"/u)
  assert.match(html, /tocktutor-right-panel[^>]+border-l[^>]+shadow-none/u)
  assert.match(html, /transition-\[width,opacity,transform,visibility\]/u)
  assert.match(html, /tocktutor-right-panel-assistant[^>]+overflow-hidden/u)
  assert.match(html, /tocktutor-right-panel-assistant[^>]+border-l-0/u)
  assert.match(html, /data-\[open=true\]:overflow-visible/u)
  assert.match(html, /tocktutor-assistant-content[^>]+border-\[color-mix\(in_srgb,var\(--tt-text\)_8%,var\(--tt-border\)_92%\)\]/u)
  assert.match(html, /data-\[open=true\]:w-\[min\(360px,calc\(100vw-262px\)\)\]/u)
  assert.match(html, /Assistant Surface/u)
  assert.match(html, /aria-label="Vault Notes"/u)
  assert.match(html, /aria-label="Reading View"/u)
  assert.match(html, /<section[^>]+aria-label="Note Editor"[^>]+role="tabpanel"/u)
  assert.match(html, /<footer[^>]+aria-label="TockTutor Status Bar"/u)
  assert.match(html, /motion-reduce:/u)
  assert.doesNotMatch(html, /<script>unsafe\(\)<\/script>/u)
  assert.match(html, /Unsafe HTML is inert in Reading view\./u)

  controller.dispose()
  assert.equal(remote.listeners.size, 0)
})

test('deduplicates bounded note tabs and dirty-gates pane transitions', async () => {
  const remote = new FakeRemote()
  const controller = new WorkbenchRouteController(remote, () => {})
  await controller.syncLocation('/tocktutor')
  assert.deepEqual(controller.getSnapshot().panes, [{ activePath: null, id: 'pane-1', tabs: [] }])

  await controller.select('Folder/Note.md')
  await controller.select('Second.md')
  await controller.activateTab('pane-1', 'Folder/Note.md')
  assert.deepEqual(controller.getSnapshot().panes[0]?.tabs.map(tab => tab.path), [
    'Folder/Note.md',
    'Second.md',
  ])
  assert.equal(controller.getSnapshot().panes[0]?.activePath, 'Folder/Note.md')

  assert.equal(await controller.addPane(), true)
  assert.equal(controller.getSnapshot().focusedPaneId, 'pane-2')
  assert.equal(controller.getSnapshot().path, null)
  assert.equal(await controller.focusPane('pane-1'), true)
  assert.equal(controller.getSnapshot().path, 'Folder/Note.md')

  await controller.addPane()
  await controller.addPane()
  await controller.addPane()
  await controller.addPane()
  await controller.addPane()
  await controller.addPane()
  assert.equal(await controller.addPane(), false)
  assert.equal(controller.getSnapshot().panes.length, 8)

  await controller.focusPane('pane-1')
  controller.edit('# Dirty pane\n')
  remote.saveFailure = { code: 'conflict', message: 'revision changed' }
  assert.equal(await controller.focusPane('pane-2'), false)
  assert.equal(controller.getSnapshot().focusedPaneId, 'pane-1')
  assert.equal(controller.getSnapshot().source, '# Dirty pane\n')

  const html = renderToStaticMarkup(createElement(TockTutorRouteView, {
    onActivateTab() {},
    onAddPane() {},
    onEdit() {},
    onFocusPane() {},
    onMode() {},
    onMoveCanvas() {},
    onSave() {},
    onSelect() {},
    onToggleTask() {},
    snapshot: controller.getSnapshot(),
  }))
  assert.match(html, /aria-label="Pane Groups"/u)
  assert.match(html, /role="tablist"/u)
  assert.match(html, /Pane 1/u)
  controller.dispose()
})

test('enforces the route tab bound before dispatching another open', async () => {
  const remote = new FakeRemote()
  const controller = new WorkbenchRouteController(remote, () => {})
  await controller.syncLocation('/tocktutor')
  for (let index = 0; index < 20; index += 1) {
    assert.equal(await controller.select(`Note-${String(index)}.md`), true)
  }
  const opens = remote.calls.filter(call => call.method === 'openDocument').length
  assert.equal(await controller.select('Overflow.md'), false)
  assert.equal(controller.getSnapshot().panes[0]?.tabs.length, 20)
  assert.equal(remote.calls.filter(call => call.method === 'openDocument').length, opens)
  assert.match(controller.getSnapshot().message, /limited to 20 note tabs/u)
  controller.dispose()
})

test('Canvas board preserves unknown fields while Base projection remains inert', async () => {
  const remote = new FakeRemote()
  const controller = new WorkbenchRouteController(remote, () => {})
  await controller.syncLocation('/tocktutor')

  assert.equal(await controller.select('Board.canvas'), true)
  assert.equal(controller.getSnapshot().documentKind, 'canvas')
  controller.setMode('reading')
  controller.moveCanvasNode('node-1', 20, 0)
  const changed = JSON.parse(controller.getSnapshot().source) as {
    customRoot: { preserve: boolean }
    nodes: Array<{ customNode: string; x: number; y: number }>
  }
  assert.deepEqual(changed.customRoot, { preserve: true })
  assert.equal(changed.nodes[0]?.customNode, 'keep')
  assert.deepEqual([changed.nodes[0]?.x, changed.nodes[0]?.y], [30, 20])
  assert.equal(await controller.save(), true)

  let html = renderToStaticMarkup(createElement(TockTutorRouteView, {
    onActivateTab() {},
    onAddPane() {},
    onEdit() {},
    onFocusPane() {},
    onMode() {},
    onMoveCanvas() {},
    onSave() {},
    onSelect() {},
    onToggleTask() {},
    snapshot: controller.getSnapshot(),
  }))
  assert.match(html, /aria-label="Canvas Board"/u)
  assert.match(html, /aria-label="Canvas Card Plan"/u)
  assert.match(html, /Right Connection Handle for Plan/u)

  assert.equal(await controller.select('Tasks.base'), true)
  assert.equal(controller.getSnapshot().documentKind, 'base')
  controller.setMode('reading')
  html = renderToStaticMarkup(createElement(TockTutorRouteView, {
    onActivateTab() {},
    onAddPane() {},
    onEdit() {},
    onFocusPane() {},
    onMode() {},
    onMoveCanvas() {},
    onSave() {},
    onSelect() {},
    onToggleTask() {},
    snapshot: controller.getSnapshot(),
  }))
  assert.match(html, /aria-label="Base View"/u)
  assert.match(html, /Base formula is inert and is not evaluated\./u)
  assert.match(html, /status == &quot;open&quot;/u)
  controller.dispose()
})

test('applies Canvas changes through the canonical save gate and restores failed previews', async () => {
  const remote = new FakeRemote()
  const controller = new WorkbenchRouteController(remote, () => {})
  await controller.syncLocation('/tocktutor')
  assert.equal(await controller.select('Board.canvas'), true)
  const previous = controller.getSnapshot().source
  const revision = controller.getSnapshot().revision!
  const moved = createCanvasChange(previous, revision, 'move-node', source => updateCanvasNodeGeometry(source, 'node-1', { x: 30, y: 20, width: 120, height: 80 }))
  assert.equal(await controller.applyCanvasChange(moved), true)
  assert.match(controller.getSnapshot().source, /"x": 30/u)

  const beforeFailure = controller.getSnapshot().source
  const failed = createCanvasChange(beforeFailure, controller.getSnapshot().revision!, 'move-node', source => updateCanvasNodeGeometry(source, 'node-1', { x: 50, y: 20, width: 120, height: 80 }))
  remote.saveFailure = { code: 'conflict', message: 'changed' }
  assert.equal(await controller.applyCanvasChange(failed), false)
  assert.equal(controller.getSnapshot().source, beforeFailure)
  assert.match(controller.getSnapshot().message, /previous preview was restored/u)
  controller.dispose()
})

test('dirty navigation fails closed on conflict and preserves the current source', async () => {
  const remote = new FakeRemote()
  const navigation: string[] = []
  const controller = new WorkbenchRouteController(remote, path => { navigation.push(path) })
  await controller.syncLocation('/tocktutor')
  await controller.select('Folder/Note.md')
  controller.edit('# Local draft\n')
  remote.saveFailure = { code: 'conflict', message: 'revision changed' }

  assert.equal(await controller.select('Second.md'), false)
  assert.equal(controller.getSnapshot().path, 'Folder/Note.md')
  assert.equal(controller.getSnapshot().source, '# Local draft\n')
  assert.equal(controller.getSnapshot().saveStatus, 'save-failed')
  assert.match(controller.getSnapshot().message, /Save Conflict/u)
  assert.equal(remote.calls.filter(call => call.method === 'openDocument').length, 1)
  assert.equal(navigation.at(-1), '/tocktutor/Folder/Note.md')
  controller.dispose()
})

test('a late save advances the revision without erasing newer editor input', async () => {
  const remote = new FakeRemote()
  const pending = deferred<{ ok: true; value: WriteDocumentResult }>()
  remote.saveOverride = () => pending.promise
  const controller = new WorkbenchRouteController(remote, () => {})
  await controller.syncLocation('/tocktutor')
  await controller.select('Folder/Note.md')
  controller.edit('# First edit\n')
  const saving = controller.save()
  controller.edit('# Newer edit\n')
  pending.resolve({
    ok: true,
    value: {
      digest: `sha256:${'9'.repeat(64)}`,
      generation: firstVault.generation,
      path: 'Folder/Note.md',
      revision: secondRevision,
      snapshotId: '2026-08-22T22-00-00-000Z-feedface',
      status: 'saved',
    },
  })
  assert.equal(await saving, false)
  assert.equal(controller.getSnapshot().source, '# Newer edit\n')
  assert.equal(controller.getSnapshot().saveStatus, 'unsaved')
  assert.equal(controller.getSnapshot().revision, secondRevision)
  controller.dispose()
})

test('clears a selected note moved to an unsupported entry type', async () => {
  const remote = new FakeRemote()
  const navigation: string[] = []
  const controller = new WorkbenchRouteController(remote, path => { navigation.push(path) })
  await controller.syncLocation('/tocktutor')
  assert.equal(await controller.select('Folder/Note.md'), true)
  remote.emit({
    action: 'moved',
    fromPath: 'Folder/Note.md',
    kind: 'entry',
    path: 'Folder/Note.png',
    vault: firstVault,
  })
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(controller.getSnapshot().path, null)
  assert.equal(navigation.at(-1), '/tocktutor')
  controller.dispose()
})

test('recovers, persists, and clears one generation-bound local draft', async () => {
  const remote = new FakeRemote()
  remote.draftContent = '# Recovered draft\n'
  const controller = new WorkbenchRouteController(remote, () => {})
  await controller.syncLocation('/tocktutor')
  assert.equal(await controller.select('Folder/Note.md'), true)
  assert.equal(controller.getSnapshot().source, '# Recovered draft\n')
  assert.equal(controller.getSnapshot().draftRecovered, true)
  assert.equal(controller.getSnapshot().saveStatus, 'unsaved')

  controller.edit('# New local draft\n')
  remote.emit({ action: 'external-change', kind: 'entry', path: 'Folder/Note.md', vault: firstVault })
  await new Promise(resolve => setImmediate(resolve))
  assert.match(controller.getSnapshot().message, /External Change/u)
  assert.equal(controller.getSnapshot().source, '# New local draft\n')
  await new Promise(resolve => setTimeout(resolve, 450))
  const draftCall = remote.calls.findLast(call => call.method === 'saveDraft')
  assert.deepEqual(draftCall?.parameters[0], {
    content: '# New local draft\n',
    expectedVault: firstVault,
    path: 'Folder/Note.md',
    revision: firstRevision,
  })
  assert.equal(await controller.save(), true)
  assert.equal(remote.calls.some(call => call.method === 'clearDraft'), true)
  assert.equal(controller.getSnapshot().draftRecovered, false)
  controller.dispose()
})

test('loads bounded recovery state and drives preview, restore, trash, and recovery refresh', async () => {
  const remote = new FakeRemote()
  const snapshotId = '2026-08-22T18-00-00-000Z-deadbeef'
  const trashId = 'trash-123e4567-e89b-42d3-a456-426614174000'
  remote.snapshots = [{
    createdAt: 1,
    digest: `sha256:${'a'.repeat(64)}`,
    id: snapshotId,
    path: 'Folder/Note.md',
    reason: 'save',
    size: 11,
  }]
  remote.trashEntries = [{ createdAt: 2, id: trashId, kind: 'document', originalPath: 'Deleted.md' }]
  const controller = new WorkbenchRouteController(remote, () => {})
  await controller.syncLocation('/tocktutor')
  assert.equal(await controller.select('Folder/Note.md'), true)
  await controller.setRecoveryOpen(true)
  assert.equal(controller.getSnapshot().snapshots?.[0]?.id, snapshotId)
  assert.equal(controller.getSnapshot().trash?.[0]?.id, trashId)
  assert.equal(await controller.readRecoverySnapshot(snapshotId), true)
  assert.equal(controller.getSnapshot().selectedSnapshot?.content, '# Snapshot\n')
  assert.equal(await controller.restoreRecoverySnapshot(snapshotId), true)
  assert.equal(remote.calls.some(call => call.method === 'restoreSnapshotAsNew'), true)
  assert.equal(await controller.restoreTrashEntry(trashId), true)
  assert.equal(remote.calls.some(call => call.method === 'restoreTrash'), true)
  assert.equal(await controller.trashCurrent(), true)
  assert.equal(controller.getSnapshot().path, null)
  assert.equal(remote.calls.some(call => call.method === 'trashEntry'), true)
  controller.dispose()
})

test('dirty-gates opaque recent and sandbox vault transitions without browser paths', async () => {
  const remote = new FakeRemote()
  const controller = new WorkbenchRouteController(remote, () => {})
  await controller.syncLocation('/tocktutor')
  assert.equal(controller.getSnapshot().recentVaults?.length, 2)
  assert.equal(await controller.select('Folder/Note.md'), true)
  controller.edit('# Dirty vault switch\n')
  remote.saveFailure = { code: 'conflict', message: 'changed' }
  assert.equal(await controller.activateRecentVault(secondVault.id), false)
  assert.equal(remote.calls.some(call => call.method === 'activateRecentVault'), false)

  remote.saveFailure = null
  assert.equal(await controller.activateRecentVault(secondVault.id), true)
  assert.deepEqual(controller.getSnapshot().vault, secondVault)
  assert.equal(await controller.removeRecentVault(firstVault.id), true)
  assert.deepEqual(controller.getSnapshot().recentVaults?.map(vault => vault.id), [secondVault.id])
  assert.equal(await controller.openSandboxVault(), true)
  assert.deepEqual(controller.getSnapshot().vault, sandboxVault)
  const requests = remote.calls
    .filter(call => call.method === 'activateRecentVault' || call.method === 'removeRecentVault' || call.method === 'openSandboxVault')
    .map(call => call.parameters[0])
  assert.deepEqual(requests, [
    { expectedGeneration: firstVault.generation, id: secondVault.id },
    { expectedGeneration: secondVault.generation, id: firstVault.id },
    { expectedGeneration: secondVault.generation },
  ])
  controller.dispose()
})

test('pins, reorders, dirty-gates closes, and restores bounded route tabs', async () => {
  const remote = new FakeRemote()
  const controller = new WorkbenchRouteController(remote, () => {})
  await controller.syncLocation('/tocktutor')
  assert.equal(await controller.select('Folder/Note.md'), true)
  assert.equal(await controller.select('Second.md'), true)

  controller.togglePinTab('pane-1', 'Folder/Note.md')
  controller.moveTab('pane-1', 'Second.md', -1)
  let pane = controller.getSnapshot().panes[0]!
  assert.deepEqual(pane.tabs.map(tab => [tab.path, tab.pinned]), [
    ['Second.md', false],
    ['Folder/Note.md', true],
  ])

  controller.edit('# Dirty close\n')
  remote.saveFailure = { code: 'conflict', message: 'changed' }
  assert.equal(await controller.closeTab('pane-1', 'Second.md'), false)
  assert.equal(controller.getSnapshot().path, 'Second.md')

  remote.saveFailure = null
  assert.equal(await controller.closeTab('pane-1', 'Second.md'), true)
  assert.equal(controller.getSnapshot().path, 'Folder/Note.md')
  assert.equal(await controller.reopenClosedTab(), true)
  pane = controller.getSnapshot().panes[0]!
  assert.equal(pane.activePath, 'Second.md')
  assert.equal(pane.tabs.at(-1)?.path, 'Second.md')
  controller.dispose()
})

test('navigates note history and exposes command-palette and focus-mode shell state', async () => {
  const remote = new FakeRemote()
  const controller = new WorkbenchRouteController(remote, () => {})
  await controller.syncLocation('/tocktutor')
  assert.equal(await controller.select('Folder/Note.md'), true)
  assert.equal(await controller.select('Second.md'), true)
  assert.equal(controller.getSnapshot().canGoBack, true)

  assert.equal(await controller.goBack(), true)
  assert.equal(controller.getSnapshot().path, 'Folder/Note.md')
  assert.equal(controller.getSnapshot().canGoForward, true)
  assert.equal(await controller.goForward(), true)
  assert.equal(controller.getSnapshot().path, 'Second.md')

  controller.setCommandPaletteOpen(true)
  assert.equal(controller.getSnapshot().commandPaletteOpen, true)
  controller.toggleFocusMode()
  assert.equal(controller.getSnapshot().focusMode, true)
  controller.setCommandPaletteOpen(false)
  assert.equal(controller.getSnapshot().commandPaletteOpen, false)
  controller.dispose()
})

test('persists Reading, Live Preview, and Source mode independently per tab', async () => {
  const remote = new FakeRemote()
  const controller = new WorkbenchRouteController(remote, () => {})
  await controller.syncLocation('/tocktutor')
  assert.equal(await controller.select('Folder/Note.md'), true)
  controller.setMode('live-preview')
  assert.equal(controller.getSnapshot().mode, 'live-preview')
  assert.equal(await controller.select('Second.md'), true)
  controller.setMode('source')
  assert.equal(await controller.activateTab('pane-1', 'Folder/Note.md'), true)
  assert.equal(controller.getSnapshot().mode, 'live-preview')
  assert.equal(await controller.activateTab('pane-1', 'Second.md'), true)
  assert.equal(controller.getSnapshot().mode, 'source')
  controller.setMode('reading')
  assert.equal(controller.getSnapshot().mode, 'reading')
  controller.dispose()
})

test('runs editor commands against the captured Source selection', async () => {
  const remote = new FakeRemote()
  const controller = new WorkbenchRouteController(remote, () => {})
  await controller.syncLocation('/tocktutor')
  assert.equal(await controller.select('Folder/Note.md'), true)
  controller.setSelection(2, 8)
  controller.runEditorCommand('bold')
  assert.match(controller.getSnapshot().source, /^# \*\*Before\*\*/u)
  const end = controller.getSnapshot().source.length
  controller.setSelection(end, end)
  controller.runEditorCommand('insert-table')
  assert.match(controller.getSnapshot().source, /\| Column 1 \| Column 2 \|/u)
  controller.setMode('reading')
  const unchanged = controller.getSnapshot().source
  controller.runEditorCommand('delete-line')
  assert.equal(controller.getSnapshot().source, unchanged)
  controller.dispose()
})

test('loads deterministic bounded Global and Local Graph projections', async () => {
  const remote = new FakeRemote()
  const controller = new WorkbenchRouteController(remote, () => {})
  await controller.syncLocation('/tocktutor')
  assert.equal(await controller.loadGraph('global'), true)
  assert.equal(controller.getSnapshot().graphLayout?.length, 2)
  assert.equal(controller.getSnapshot().graphMode, 'global')
  assert.equal(await controller.select('Folder/Note.md'), true)
  assert.equal(await controller.loadGraph('local'), true)
  assert.equal(controller.getSnapshot().graph?.path, 'Folder/Note.md')
  assert.equal(controller.getSnapshot().graphMode, 'local')
  controller.dispose()
})

test('projects bounded Smart Views and Tags over shared tree, search, and facets owners', async () => {
  const remote = new FakeRemote()
  const controller = new WorkbenchRouteController(remote, () => {})
  await controller.syncLocation('/tocktutor')
  assert.equal(await controller.openSmartView('recent'), true)
  assert.deepEqual(controller.getSnapshot().searchMatches?.map(match => match.path), ['Folder/Note.md', 'Second.md'])
  assert.equal(await controller.openSmartView('tasks'), true)
  assert.equal(controller.getSnapshot().searchQuery, 'task:todo')
  assert.equal(await controller.openSmartView('tags'), true)
  assert.equal(controller.getSnapshot().facets?.tags[0]?.tag, 'lesson/intro')
  assert.equal(controller.getSnapshot().facets?.properties[0]?.key, 'status')
  controller.dispose()
})

test('loads generation-bound outline, footnotes, backlinks, and outgoing links', async () => {
  const remote = new FakeRemote()
  const controller = new WorkbenchRouteController(remote, () => {})
  await controller.syncLocation('/tocktutor')
  assert.equal(await controller.select('Folder/Note.md'), true)
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(controller.getSnapshot().outline?.headings[0]?.text, 'Before')
  assert.equal(controller.getSnapshot().outline?.footnotes?.[0]?.content, 'Footnote')
  assert.equal(controller.getSnapshot().links?.backlinkDetails[0]?.sourcePath, 'Second.md')
  assert.equal(controller.getSnapshot().links?.outgoingDetails[0]?.resolvedPath, 'Second.md')
  assert.equal(controller.jumpToLine(2), true)
  assert.equal(controller.getSnapshot().mode, 'source')
  assert.equal(controller.getSnapshot().selectionStart, '# Before\n'.length)
  controller.dispose()
})

test('runs bounded vault search and Related results against the captured generation', async () => {
  const remote = new FakeRemote()
  const controller = new WorkbenchRouteController(remote, () => {})
  await controller.syncLocation('/tocktutor')
  controller.openSearch('lesson')
  controller.setSearchMode('related')
  assert.equal(await controller.runSearch(), true)
  assert.equal(controller.getSnapshot().searchMatches?.[0]?.path, 'Folder/Note.md')
  assert.equal(controller.getSnapshot().searchMatches?.[0]?.line, 2)
  assert.deepEqual(remote.calls.findLast(call => call.method === 'search')?.parameters[0], {
    expectedVault: firstVault,
    limit: 100,
    mode: 'related',
    query: 'lesson',
  })
  controller.closeSearch()
  assert.equal(controller.getSnapshot().searchMatches?.length, 0)
  controller.dispose()
})

test('persists bounded settings, tabs, focus mode, and named workspaces per vault', async () => {
  const storage = new MemoryStorage()
  const firstRemote = new FakeRemote()
  const first = new WorkbenchRouteController(firstRemote, () => {}, () => new Date(10), storage)
  await first.syncLocation('/tocktutor')
  assert.equal(await first.select('Folder/Note.md'), true)
  first.setMode('live-preview')
  first.togglePinTab('pane-1', 'Folder/Note.md')
  first.toggleFocusMode()
  assert.equal(first.updateSettings({ backlinksInDocument: true, defaultEditingMode: 'source' }), true)
  assert.equal(first.saveCurrentWorkspace('Class Layout'), true)
  first.dispose()

  const secondRemote = new FakeRemote()
  const second = new WorkbenchRouteController(secondRemote, () => {}, () => new Date(11), storage)
  await second.syncLocation('/tocktutor')
  assert.equal(second.getSnapshot().path, 'Folder/Note.md')
  assert.equal(second.getSnapshot().mode, 'live-preview')
  assert.equal(second.getSnapshot().panes[0]?.tabs[0]?.pinned, true)
  assert.equal(second.getSnapshot().focusMode, true)
  assert.equal(second.getSnapshot().settings?.defaultEditingMode, 'source')
  assert.equal(second.getSnapshot().settings?.backlinksInDocument, true)
  assert.equal(second.getSnapshot().workspaces?.[0]?.id, 'class-layout')
  second.toggleFocusMode()
  assert.equal(await second.loadWorkspace('class-layout'), true)
  assert.equal(second.getSnapshot().focusMode, true)
  second.dispose()
})

test('stores and reopens one bounded per-vault active-note bookmark', async () => {
  const storage = new MemoryStorage()
  const remote = new FakeRemote()
  const controller = new WorkbenchRouteController(remote, () => {}, () => new Date(20), storage)
  await controller.syncLocation('/tocktutor')
  assert.equal(await controller.select('Folder/Note.md'), true)
  assert.equal(controller.addActiveBookmark(), true)
  const id = controller.getSnapshot().bookmarks?.[0]?.id
  assert.equal(id, 'note-k')
  assert.equal(await controller.select('Second.md'), true)
  assert.equal(await controller.openBookmark(id!), true)
  assert.equal(controller.getSnapshot().path, 'Folder/Note.md')
  assert.equal(controller.removeBookmark(id!), true)
  assert.equal(controller.getSnapshot().bookmarks?.length, 0)
  controller.dispose()
})

test('late note and vault completions cannot replace the active route identity', async () => {
  const remote = new FakeRemote()
  const first = deferred<{ ok: true; value: OpenDocumentResult }>()
  const second = deferred<{ ok: true; value: OpenDocumentResult }>()
  remote.openOverride = path => path === 'Folder/Note.md' ? first.promise : second.promise
  const controller = new WorkbenchRouteController(remote, () => {})
  await controller.syncLocation('/tocktutor')

  const openFirst = controller.select('Folder/Note.md')
  const openSecond = controller.select('Second.md')
  second.resolve({
    ok: true,
    value: {
      content: '# Current\n',
      digest: `sha256:${'e'.repeat(64)}`,
      generation: firstVault.generation,
      path: 'Second.md',
      revision: secondRevision,
    },
  })
  assert.equal(await openSecond, true)
  first.resolve({
    ok: true,
    value: {
      content: '# Stale\n',
      digest: `sha256:${'f'.repeat(64)}`,
      generation: firstVault.generation,
      path: 'Folder/Note.md',
      revision: firstRevision,
    },
  })
  assert.equal(await openFirst, false)
  assert.equal(controller.getSnapshot().path, 'Second.md')
  assert.equal(controller.getSnapshot().source, '# Current\n')

  remote.vault = secondVault
  remote.emit({ action: 'activated', kind: 'vault', vault: secondVault })
  await new Promise(resolve => setTimeout(resolve, 0))
  assert.deepEqual(controller.getSnapshot().vault, secondVault)
  assert.equal(controller.getSnapshot().path, null)
  controller.dispose()
})
