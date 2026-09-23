import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { NoteVaultError } from 'tockbot-note-runtime'
import { createVaultInspection } from 'tockbot-note-vault/inspection'
import { createExecutableBaseFrontmatterEdit } from '../dist/base-edit.js'
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
  RestoreTrashResult,
  TrashMutationResult,
  VaultLinksResult,
  VaultReference,
  VaultSearchMatch,
  VaultSearchResult,
  VaultTreePage,
  WriteDocumentResult,
} from '../dist/types.js'

const firstVault = Object.freeze({ generation: 3, id: `vault:${'1'.repeat(64)}` })
const secondVault = Object.freeze({ generation: 4, id: `vault:${'2'.repeat(64)}` })
const sandboxVault = Object.freeze({ generation: 5, id: `vault:${'3'.repeat(64)}` })
const firstRevision = `file:${'a'.repeat(64)}`
const secondRevision = `file:${'b'.repeat(64)}`
const aliasRevision = `entry:${'c'.repeat(64)}`
function success<T>(value: T) {
  return Promise.resolve({ ok: true as const, value })
}

function failure(code: 'conflict' | 'exists', message: string) {
  return Promise.resolve({
    error: new NoteVaultError(code, message),
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

function tree(vault: VaultReference, notePath = 'Folder/Note.md'): VaultTreePage {
  return {
    complete: true,
    cursor: null,
    entries: [
      {
        kind: 'directory',
        modifiedAt: 2,
        path: 'Folder',
        revision: firstRevision,
      },
      {
        createdAt: 1,
        kind: 'document',
        modifiedAt: 2,
        path: notePath,
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
      {
        createdAt: 1,
        kind: 'attachment',
        mediaKind: 'image',
        modifiedAt: 2,
        path: 'Attachments/existing.png',
        revision: firstRevision,
        size: 3,
      },
    ],
    generation: vault.generation,
    scan: { entries: 6 },
    truncated: false,
    truncationReason: null,
    warnings: [],
  }
}

class FakeRemote implements WorkbenchRouteRemote {
  vault: VaultReference | null = firstVault
  vaultDisplayPath = '~/Documents/Research Vault'
  vaultName = 'Research Vault'
  saveFailure: { code: 'conflict'; message: string } | null = null
  draftContent: string | null = null
  draftFailure: { code: 'unavailable'; message: string } | null = null
  draftReject: Error | null = null
  draftFailureReads = 0
  draftFailuresBeforeSuccess = 0
  snapshots: Array<{ createdAt: number; digest: string; id: string; path: string; reason: string; size: number }> = []
  trashEntries: Array<{ createdAt: number; id: string; kind: 'document'; originalPath: string }> = []
  trashEntryResult: TrashMutationResult | unknown | null = null
  restoreTrashResult: RestoreTrashResult | unknown | null = null
  readonly calls: Array<{ method: string; parameters: unknown[] }> = []
  readonly listeners = new Set<(event: NoteVaultChangeEvent) => void>()
  createFailure: { code: 'exists'; message: string } | null = null
  createOverride: ((request: CreateDocumentRequest) => Promise<{
    ok: true
    value: WriteDocumentResult
  }>) | null = null
  treeFailure: Error | null = null
  treeGate: { promise: Promise<void> } | null = null
  treePageOverride: ((request: { cursor?: string | null; expectedVault: VaultReference; limit?: number }, signal?: AbortSignal) => Promise<{ ok: true; value: VaultTreePage }>) | null = null
  openOverride: ((path: string) => Promise<{ ok: true; value: OpenDocumentResult } | { ok: false; error: NoteVaultError }>) | null = null
  renameFailure: { code: 'conflict'; message: string } | null = null
  renameRewriteError: string | undefined
  renamedPath: string | null = null
  aliasPath: string | null = null
  saveOverride: (() => Promise<{ ok: true; value: WriteDocumentResult }>) | null = null
  linksGate: Promise<void> | null = null
  linksOverride: ((request: { expectedVault: VaultReference; includeUnlinked?: boolean; path: string }, signal?: AbortSignal) => Promise<{ ok: true; value: VaultLinksResult }>) | null = null
  searchContinuation: VaultSearchResult | null = null
  searchRevision: string | undefined
  searchOverride: ((request: unknown, signal?: AbortSignal) => Promise<{ ok: true; value: VaultSearchResult }>) | null = null
  tocktutorAssistant?: NonNullable<WorkbenchRouteRemote['tocktutorAssistant']>

  private readonly createdPaths: Set<string>

  constructor(createdPaths: Set<string> = new Set()) {
    this.createdPaths = createdPaths
  }

  readonly tocktutorWorkbench = {
    createManagedVault: (request: { expectedGeneration: number; name: string }, signal?: AbortSignal) => {
      this.calls.push({ method: 'createManagedVault', parameters: [request, signal] })
      this.vault = sandboxVault
      return success(sandboxVault)
    },
    createDocument: (request: CreateDocumentRequest, signal?: AbortSignal) => {
      this.calls.push({ method: 'createDocument', parameters: [request, signal] })
      if (this.createFailure !== null) return failure(this.createFailure.code, this.createFailure.message)
      if (this.createOverride !== null) return this.createOverride(request)
      this.createdPaths.add(request.path)
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
      return success({
        displayPath: this.vault === null ? null : this.vaultDisplayPath,
        generation: this.vault?.generation ?? 0,
        name: this.vault === null ? null : this.vaultName,
        vault: this.vault,
      })
    },
    captureSnapshot: (request: { content: string; expectedVault: VaultReference; path: string; reason?: string }, signal?: AbortSignal) => {
      this.calls.push({ method: 'captureSnapshot', parameters: [request, signal] })
      const snapshot = { createdAt: 3, digest: `sha256:${'c'.repeat(64)}`, id: '2026-08-26T00-00-00-000Z-deadbeef', path: request.path, reason: request.reason ?? 'manual', size: request.content.length }
      this.snapshots = [snapshot]
      return success({ generation: request.expectedVault.generation, snapshot })
    },
    clearDraft: (request: { expectedVault: VaultReference; path: string }, signal?: AbortSignal) => {
      this.calls.push({ method: 'clearDraft', parameters: [request, signal] })
      this.draftContent = null
      return success({ generation: request.expectedVault.generation, ok: true as const })
    },
    clearSnapshots: (request: { expectedVault: VaultReference; path: string }, signal?: AbortSignal) => {
      this.calls.push({ method: 'clearSnapshots', parameters: [request, signal] })
      const removed = this.snapshots.length
      this.snapshots = []
      return success({ generation: request.expectedVault.generation, removed })
    },
    listSnapshots: (request: { expectedVault: VaultReference; path: string }, signal?: AbortSignal) => {
      this.calls.push({ method: 'listSnapshots', parameters: [request, signal] })
      return success({ generation: request.expectedVault.generation, snapshots: this.snapshots })
    },
    listTrash: (request: { expectedVault: VaultReference }, signal?: AbortSignal) => {
      this.calls.push({ method: 'listTrash', parameters: [request, signal] })
      return success({ entries: this.trashEntries, generation: request.expectedVault.generation })
    },
    listTree: async (request: { expectedVault: VaultReference; cursor?: string | null; limit?: number }, signal?: AbortSignal) => {
      this.calls.push({ method: 'listTree', parameters: [request, signal] })
      if (this.treeFailure !== null) {
        const error = this.treeFailure
        this.treeFailure = null
        throw error
      }
      if (this.treeGate !== null) {
        const gate = this.treeGate
        this.treeGate = null
        await gate.promise
      }
      if (this.treePageOverride !== null) return this.treePageOverride(request, signal)
      const page = tree(request.expectedVault, this.renamedPath ?? undefined)
      const extra = [...this.createdPaths]
        .filter(path => !page.entries.some(entry => entry.path === path))
        .map(path => ({
          createdAt: 1,
          kind: 'document' as const,
          modifiedAt: 2,
          path,
          revision: secondRevision,
          size: 0,
        }))
      return success({
        ...page,
        entries: [...page.entries, ...extra],
        scan: { ...page.scan, entries: page.scan.entries + extra.length },
      })
    },
    openSandboxVault: (request: { expectedGeneration: number }, signal?: AbortSignal) => {
      this.calls.push({ method: 'openSandboxVault', parameters: [request, signal] })
      this.vault = sandboxVault
      return success(sandboxVault)
    },
    previewAttachment: (path: string, expectedVault: VaultReference, signal?: AbortSignal) => {
      this.calls.push({ method: 'previewAttachment', parameters: [path, expectedVault, signal] })
      return success({ dataBase64: 'AQID', digest: `sha256:${'a'.repeat(64)}`, generation: expectedVault.generation, mediaKind: 'image' as const, mimeType: 'image/png', path, revision: firstRevision, size: 3 })
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
        content: path === 'Folder/Note.md' || path === this.renamedPath
          ? '# Before\n- [ ] Verify route\nParagraph ^route-block\n'
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
              ? 'views:\n  - type: table\n    name: Tasks\n    order:\n      - file.name\n      - note.status\n'
              : '---\nstatus: open\n---\n# Second\n',
        digest: `sha256:${'c'.repeat(64)}`,
        generation: expectedVault.generation,
        path,
        revision: path === this.aliasPath ? aliasRevision : firstRevision,
      })
    },
    restoreSnapshot: (request: { expectedRevision: string; expectedVault: VaultReference; path: string; snapshotId: string }, signal?: AbortSignal) => {
      this.calls.push({ method: 'restoreSnapshot', parameters: [request, signal] })
      return success({ digest: `sha256:${'a'.repeat(64)}`, generation: request.expectedVault.generation, path: request.path, revision: secondRevision, snapshotId: request.snapshotId, status: 'saved' as const })
    },
    restoreSnapshotAsNew: (request: { expectedVault: VaultReference; path: string; snapshotId: string; toPath: string }, signal?: AbortSignal) => {
      this.calls.push({ method: 'restoreSnapshotAsNew', parameters: [request, signal] })
      return success({ digest: `sha256:${'a'.repeat(64)}`, generation: request.expectedVault.generation, path: request.toPath, revision: secondRevision, status: 'created' as const })
    },
    restoreTrash: (request: { expectedVault: VaultReference; id: string; toPath?: string }, signal?: AbortSignal) => {
      this.calls.push({ method: 'restoreTrash', parameters: [request, signal] })
      if (this.restoreTrashResult !== null) return success(this.restoreTrashResult as RestoreTrashResult)
      return success({ createdAt: 1, generation: request.expectedVault.generation, id: request.id, kind: 'document' as const, originalPath: 'Deleted.md', path: request.toPath ?? 'Deleted.md', revision: secondRevision, status: 'restored' as const })
    },
    renameDocument: (request: { expectedRevision: string; expectedVault: VaultReference; fromPath: string; toPath: string }, signal?: AbortSignal) => {
      this.calls.push({ method: 'renameDocument', parameters: [request, signal] })
      if (this.renameFailure !== null) return failure(this.renameFailure.code, this.renameFailure.message)
      this.renamedPath = request.toPath
      this.emit({ action: 'moved', fromPath: request.fromPath, kind: 'entry', path: request.toPath, vault: request.expectedVault })
      return success({
        fromPath: request.fromPath,
        generation: request.expectedVault.generation,
        path: request.toPath,
        ...(this.renameRewriteError === undefined ? {} : { rewriteError: this.renameRewriteError }),
        rewriteSnapshots: [],
        rewrittenPaths: [],
        revision: secondRevision,
        status: 'moved' as const,
      })
    },
    saveDraft: (request: { content: string; expectedVault: VaultReference; path: string; revision?: string }, signal?: AbortSignal) => {
      this.calls.push({ method: 'saveDraft', parameters: [request, signal] })
      if (this.draftReject !== null) return Promise.reject(this.draftReject)
      if (this.draftFailure !== null && this.draftFailuresBeforeSuccess > 0) {
        this.draftFailuresBeforeSuccess -= 1
        const owner = this
        return Promise.resolve({
          get error() {
            owner.draftFailureReads += 1
            return new NoteVaultError(owner.draftFailure!.code, owner.draftFailure!.message)
          },
          ok: false as const,
        })
      }
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
      if (this.linksOverride !== null) return this.linksOverride(request, signal)
      if (this.linksGate !== null) return this.linksGate.then(() => success({
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
      }))
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
    search: (request: { cursor?: string; directory?: string; expectedVault: VaultReference; limit?: number; mode?: string; modifiedFrom?: number; modifiedTo?: number; query: string; titleOnly?: boolean }, signal?: AbortSignal) => {
      this.calls.push({ method: 'search', parameters: [request, signal] })
      if (this.searchOverride !== null) return this.searchOverride(request, signal)
      if (request.cursor !== undefined && this.searchContinuation !== null) return success(this.searchContinuation)
      return success({
        cursor: this.searchContinuation === null ? null : 'search-next',
        generation: request.expectedVault.generation,
        matches: [{ ...(this.searchRevision === undefined ? {} : { revision: this.searchRevision }), kind: 'content' as const, line: 2, path: 'Folder/Note.md', preview: `Match ${request.query}` }],
        query: request.query,
        scan: { bytes: 30, entries: 4, files: 2 },
        truncated: this.searchContinuation !== null,
        truncationReason: this.searchContinuation === null ? null : 'result-limit' as const,
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
    storeAttachment: (request: { dataBase64: string; expectedVault: VaultReference; path: string }, signal?: AbortSignal) => {
      this.calls.push({ method: 'storeAttachment', parameters: [request, signal] })
      return success({ digest: `sha256:${'b'.repeat(64)}`, generation: request.expectedVault.generation, mediaKind: 'image' as const, mimeType: 'image/png', path: request.path, revision: secondRevision, size: 3, status: 'stored' as const })
    },
    trashEntry: (request: { expectedRevision: string; expectedVault: VaultReference; path: string }, signal?: AbortSignal) => {
      this.calls.push({ method: 'trashEntry', parameters: [request, signal] })
      if (this.trashEntryResult !== null) return success(this.trashEntryResult as TrashMutationResult)
      return success({ createdAt: 1, generation: request.expectedVault.generation, id: 'trash-12345678-1234-4123-8123-123456789abc', kind: 'document' as const, originalPath: request.path, revision: secondRevision, status: 'trashed' as const })
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

function mergeReviewRemote() {
  const remote = new FakeRemote()
  const notes = new Map(['Folder/Note.md', 'Second.md', 'Ref.md'].map(path => [path, {
    path, content: path === 'Ref.md' ? '[[Folder/Note]]\n' : path === 'Second.md' ? '# Destination\n' : '# Source\n',
    revision: firstRevision, digest: `sha256:${'c'.repeat(64)}`, generation: firstVault.generation,
  }]))
  remote.openOverride = path => {
    if (!notes.has(path)) return Promise.resolve({ ok: false as const, error: new NoteVaultError('not-found', 'The note no longer exists.') })
    return success({ ...notes.get(path)! })
  }
  remote.searchOverride = async request => ({ ok: true, value: {
    generation: firstVault.generation, query: (request as { query: string }).query, cursor: null,
    matches: [...notes.values()].map(note => ({ kind: 'content' as const, path: note.path, line: 1, preview: note.content })),
    scan: { bytes: 100, entries: notes.size, files: notes.size }, truncated: false, truncationReason: null, warnings: [],
  } })
  const originalTree = remote.tocktutorWorkbench.listTree
  remote.tocktutorWorkbench.listTree = async (request, signal) => {
    const result = await originalTree(request, signal)
    if (!result.ok) return result
    return { ...result, value: { ...result.value, entries: result.value.entries.filter(entry => entry.kind !== 'document' || notes.has(entry.path)).map(entry => ({ ...entry, revision: notes.get(entry.path)?.revision ?? entry.revision })) } }
  }
  const inspection = createVaultInspection({
    async list() { return { entries: [...notes.values()].sort((a, b) => a.path.localeCompare(b.path)).map(note => ({ path: note.path, kind: 'document' as const, revision: note.revision, size: Buffer.byteLength(note.content), createdMs: 1, modifiedMs: 1 })), complete: true, cursor: null, truncated: false, truncationReason: null, warnings: [] } },
    async read(path) { return { ...notes.get(path)! } },
  }, { maxReadBytes: 2_000_000, maxSearchFileBytes: 2_000_000, maxSearchBytes: 64 * 1024 * 1024, maxSearchEntries: 100, maxSearchResults: 1 })
  Object.assign(remote.tocktutorWorkbench, { previewMergeLinks: async (request: import('../dist/types.js').MergeLinkPreviewRequest, signal?: AbortSignal) => success({ ...await inspection.planMergeLinks(request, signal), generation: firstVault.generation }) })
  return { remote, notes }
}

test('revealing a file exits Focus Mode without discarding its draft', async () => {
  const controller = new WorkbenchRouteController(new FakeRemote(), () => {})
  try {
    await controller.syncLocation('/tocktutor/Folder/Note.md')
    controller.edit('# Draft')
    controller.toggleFocusMode()
    assert.equal(controller.getSnapshot().focusMode, true)
    assert.equal(await controller.revealActiveFile(), true)
    assert.equal(controller.getSnapshot().focusMode, false)
    assert.equal(controller.getSnapshot().source, '# Draft')
  } finally { await controller.dispose() }
})

test('merge confirmation consumes only the latest review and reconciles every source pane with an existing destination', async () => {
  const { remote, notes } = mergeReviewRemote()
  let calls = 0, preparedRequest: import('../dist/types.js').PrepareMergeRequest | undefined
  Object.assign(remote.tocktutorWorkbench, {
    prepareMerge: async (request: import('../dist/types.js').PrepareMergeRequest) => { preparedRequest = request; return success({ id: 'merge-00000000-0000-4000-8000-000000000000', generation: firstVault.generation }) },
    applyMerge: async (request: import('../dist/types.js').ApplyMergeRequest, signal: AbortSignal) => {
      assert.equal(request.confirmed, true); calls++
      notes.set('Second.md', { ...notes.get('Second.md')!, content: preparedRequest!.mergedContent, revision: secondRevision })
      notes.set('Ref.md', { ...notes.get('Ref.md')!, content: '[[Second]]\n', revision: secondRevision })
      notes.delete('Folder/Note.md')
      remote.emit({ kind: 'entry', action: 'updated', path: 'Second.md', vault: firstVault })
      remote.emit({ kind: 'entry', action: 'trashed', path: 'Folder/Note.md', fromPath: 'Folder/Note.md', vault: firstVault })
      assert.equal(signal.aborted, false, 'owned publications do not cancel their own apply')
      return success({ ...request, generation: firstVault.generation, status: 'applied', sourcePath: 'Folder/Note.md', destinationPath: 'Second.md', sourceDisposition: 'trash', paths: ['Second.md', 'Folder/Note.md', 'Ref.md'], recoveryPath: 'Recovered Merge test' })
    },
  })
  const controller = new WorkbenchRouteController(remote, () => {})
  try {
    await controller.syncLocation('/tocktutor/Folder/Note.md')
    const left = controller.getSnapshot().focusedPaneId
    await controller.splitPane(left, 'horizontal')
    await controller.select('Second.md')
    await controller.focusPane(left)
    await controller.splitPane(left, 'vertical')
    controller.openSidebarSearch()
    controller.setSearchQuery('note')
    assert.equal(await controller.runSearch(), true)
    assert.equal(controller.getSnapshot().searchMatches?.length, 3)
    const prepared = await controller.prepareNoteMerge('Second.md', new AbortController().signal)
    const old = await prepared.preview({ placement: 'append', sourceDisposition: 'trash' }, new AbortController().signal)
    const latest = await prepared.preview({ placement: 'prepend', sourceDisposition: 'trash' }, new AbortController().signal)
    await assert.rejects(prepared.apply!(old, new AbortController().signal), /new merge preview/iu)
    assert.equal(calls, 0)
    assert.equal((await prepared.apply!(latest, new AbortController().signal)).status, 'applied')
    assert.equal(calls, 1)
    assert.equal(controller.getSnapshot().path, 'Second.md')
    assert.equal(controller.getSnapshot().source, '# Source\n\n# Destination\n')
    assert.equal(controller.getSnapshot().panes.flatMap(pane => pane.tabs).some(tab => tab.path === 'Folder/Note.md'), false)
    await new Promise(resolve => setTimeout(resolve, 250))
    assert.deepEqual(controller.getSnapshot().searchMatches?.map(match => [match.path, match.preview]), [
      ['Second.md', '# Source\n\n# Destination\n'], ['Ref.md', '[[Second]]\n'],
    ])
    await assert.rejects(prepared.apply!(latest, new AbortController().signal))
    assert.equal(calls, 1)
  } finally { await controller.dispose() }
})

for (const dirty of [false, true]) for (const rejected of [false, true]) for (const truncated of [false, true]) test(`interrupted merge retirement reconciles missing source and retains drafts: dirty=${dirty}, rejected=${rejected}, truncated=${truncated}`, async () => {
  const { remote, notes } = mergeReviewRemote()
  const controller = new WorkbenchRouteController(remote, () => {})
  Object.assign(remote.tocktutorWorkbench, {
    prepareMerge: async () => success({ id: 'merge-00000000-0000-4000-8000-000000000000', generation: firstVault.generation }),
    applyMerge: async (request: import('../dist/types.js').ApplyMergeRequest) => {
      if (dirty) controller.edit('# Local draft\n')
      notes.delete('Folder/Note.md')
      if (truncated) remote.treePageOverride = async () => success({ ...tree(firstVault), complete: false, truncated: true, truncationReason: 'depth-limit' })
      if (!rejected) remote.emit({ kind: 'entry', action: 'trashed', path: 'Folder/Note.md', fromPath: 'Folder/Note.md', vault: firstVault })
      if (rejected) throw new Error('The completion response was lost.')
      return success({ ...request, generation: firstVault.generation, status: 'recovery-required', sourcePath: 'Folder/Note.md', destinationPath: 'Second.md', sourceDisposition: 'trash', paths: [], recoveryPath: 'Recovered Merge test' })
    },
  })
  try {
    await controller.syncLocation('/tocktutor/Folder/Note.md')
    const prepared = await controller.prepareNoteMerge('Second.md', new AbortController().signal)
    const preview = await prepared.preview({ placement: 'append', sourceDisposition: 'trash' }, new AbortController().signal)
    const applying = prepared.apply!(preview, new AbortController().signal)
    if (rejected) await assert.rejects(applying, /completion response/)
    else assert.equal((await applying).status, 'recovery-required')
    await new Promise(resolve => setTimeout(resolve, 0))
    assert.equal(controller.getSnapshot().path, 'Folder/Note.md')
    assert.equal(controller.getSnapshot().documentUnavailable, true)
    assert.equal(controller.getSnapshot().source, dirty ? '# Local draft\n' : '# Source\n')
    assert.equal(controller.getSnapshot().saveStatus, dirty ? 'unsaved' : 'saved')
  } finally { await controller.dispose() }
})

test('vault reload detects interrupted merges and offers recovery without changing notes', async () => {
  const { remote } = mergeReviewRemote()
  Object.assign(remote.tocktutorWorkbench, { listMerges: async () => success({ generation: firstVault.generation, merges: [{ status: 'recovery-required' }] }) })
  const controller = new WorkbenchRouteController(remote, () => {})
  try {
    await controller.syncLocation('/tocktutor/Folder/Note.md')
    assert.equal(controller.getSnapshot().mergeRecoveryPending, true)
    assert.equal(controller.getSnapshot().source, '# Source\n')
    assert.equal(remote.calls.some(call => call.method === 'saveDocument'), false)
  } finally { await controller.dispose() }
})

for (const target of ['Second.md', 'Ref.md', 'New Alias.md', 'tree'] as const) test(`merge review invalidates on external inventory changes: ${target}`, async () => {
  const { remote, notes } = mergeReviewRemote()
  const controller = new WorkbenchRouteController(remote, () => {})
  try {
    await controller.syncLocation('/tocktutor/Folder/Note.md')
    const prepared = await controller.prepareNoteMerge('Second.md', new AbortController().signal)
    const preview = await prepared.preview({ placement: 'append', sourceDisposition: 'trash' }, new AbortController().signal)
    assert.equal(preview.destinationContent, '# Destination\n\n# Source\n')
    assert.deepEqual(preview.plan.updates.map(update => update.path), ['Ref.md'])
    assert.equal(remote.calls.some(call => ['saveDocument', 'trashEntry', 'renameDocument', 'createDocument'].includes(call.method)), false)
    remote.emit({ kind: 'entry', action: 'updated', path: 'Second.md', vault: secondVault })
    assert.equal(prepared.signal.aborted, false, 'other vault events do not invalidate this review')
    if (notes.has(target)) notes.set(target, { ...notes.get(target)!, revision: secondRevision, content: '# External revision\n' })
    remote.emit(target === 'tree' ? { kind: 'tree', action: 'changed', vault: firstVault } : { kind: 'entry', action: target === 'New Alias.md' ? 'created' : 'updated', path: target, vault: firstVault })
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(prepared.signal.aborted, true, 'even unopened files and inventory-only changes invalidate the completed review')
  } finally { await controller.dispose() }
})

test('merge preview rejects a late plan after an unopened destination changes', async () => {
  const { remote } = mergeReviewRemote()
  const read = (remote as WorkbenchRouteRemote).tocktutorWorkbench.previewMergeLinks!
  Object.assign(remote.tocktutorWorkbench, { previewMergeLinks: async (request: import('../dist/types.js').MergeLinkPreviewRequest, signal?: AbortSignal) => {
    const result = await read(request, signal)
    remote.emit({ kind: 'entry', action: 'updated', path: 'Second.md', vault: firstVault })
    return result
  } })
  const controller = new WorkbenchRouteController(remote, () => {})
  try {
    await controller.syncLocation('/tocktutor/Folder/Note.md')
    const prepared = await controller.prepareNoteMerge('Second.md', new AbortController().signal)
    await assert.rejects(prepared.preview({ placement: 'append', sourceDisposition: 'trash' }, new AbortController().signal), /vault changed/u)
    assert.equal(prepared.signal.aborted, true)
  } finally { await controller.dispose() }
})

for (const change of ['dirty', 'revision', 'later-edit'] as const) test(`merge preview protects affected open referrers: ${change}`, async () => {
  const { remote, notes } = mergeReviewRemote()
  const controller = new WorkbenchRouteController(remote, () => {})
  try {
    await controller.syncLocation('/tocktutor/Folder/Note.md')
    const left = controller.getSnapshot().focusedPaneId
    await controller.splitPane(left, 'horizontal')
    const right = controller.getSnapshot().focusedPaneId
    await controller.select('Ref.md')
    await controller.focusPane(left)
    if (change === 'dirty') controller.bindPaneEdit(right)('# Local referrer draft\n')
    if (change === 'revision') notes.set('Ref.md', { ...notes.get('Ref.md')!, revision: secondRevision })
    const prepared = await controller.prepareNoteMerge('Second.md', new AbortController().signal)
    const preview = prepared.preview({ placement: 'append', sourceDisposition: 'trash' }, new AbortController().signal)
    if (change !== 'later-edit') await assert.rejects(preview, /Save or reload Ref.md/u)
    else {
      assert.deepEqual((await preview).plan.updates.map(update => update.path), ['Ref.md'])
      controller.bindPaneEdit(right)('# Later referrer draft\n')
      assert.equal(prepared.signal.aborted, true)
    }
  } finally { await controller.dispose() }
})

test('prepares saved merge documents without writes and invalidates the review on a later edit', async () => {
  const remote = new FakeRemote()
  Object.assign(remote.tocktutorWorkbench, { previewMergeLinks: async () => { throw new Error('Not reached for a stale review') } })
  const controller = new WorkbenchRouteController(remote, () => {})
  try {
    await controller.syncLocation('/tocktutor/Folder/Note.md')
    for (const path of ['Folder/NOTE.md', '../Outside.md', 'Board.canvas']) {
      await assert.rejects(controller.prepareNoteMerge(path, new AbortController().signal), /distinct Markdown/u)
    }
    const prepared = await controller.prepareNoteMerge('Second.md', new AbortController().signal)
    assert.equal(prepared.source.path, 'Folder/Note.md')
    assert.equal(prepared.destination.path, 'Second.md')
    assert.equal(prepared.source.content, controller.getSnapshot().source)
    assert.equal(remote.calls.some(call => ['saveDocument', 'trashEntry', 'renameDocument', 'createDocument'].includes(call.method)), false)
    controller.edit('# Changed after preparation\n')
    assert.equal(prepared.signal.aborted, true)
    await assert.rejects(prepared.preview({ placement: 'append', sourceDisposition: 'trash' }, new AbortController().signal))
  } finally { await controller.dispose() }
})

test('merge preparation saves drafts before reading and stops on save conflicts or late cancellation', async () => {
  const remote = new FakeRemote()
  Object.assign(remote.tocktutorWorkbench, { previewMergeLinks: async () => { throw new Error('Not used by preparation') } })
  const controller = new WorkbenchRouteController(remote, () => {})
  try {
    await controller.syncLocation('/tocktutor/Folder/Note.md')
    controller.edit('# Local draft\n')
    remote.saveFailure = { code: 'conflict', message: 'Changed externally' }
    const reads = remote.calls.filter(call => call.method === 'openDocument').length
    await assert.rejects(controller.prepareNoteMerge('Second.md', new AbortController().signal), /Save both notes/u)
    assert.equal(remote.calls.filter(call => call.method === 'openDocument').length, reads)
    assert.equal(controller.getSnapshot().source, '# Local draft\n')
    remote.saveFailure = null
    const source: OpenDocumentResult = { content: '# Local draft\n', path: 'Folder/Note.md', generation: firstVault.generation, revision: secondRevision, digest: `sha256:${'c'.repeat(64)}` }
    remote.openOverride = path => success({ ...source, path, content: path === source.path ? source.content : '# Destination\n' })
    const save = remote.tocktutorWorkbench.saveDocument
    remote.tocktutorWorkbench.saveDocument = (request, signal) => {
      const result = save(request, signal)
      remote.emit({ kind: 'entry', action: 'updated', path: request.path, vault: firstVault })
      return result
    }
    const prepared = await controller.prepareNoteMerge('Second.md', new AbortController().signal)
    assert.equal(prepared.signal.aborted, false, 'owned draft-save events precede the review inventory guard')
    assert.equal(prepared.source.content, '# Local draft\n')
    assert.equal(controller.getSnapshot().saveStatus, 'saved')
    const started = deferred<void>(), late = deferred<{ ok: true; value: OpenDocumentResult }>()
    remote.openOverride = path => {
      if (path === source.path) { started.resolve(); return late.promise }
      return success({ ...source, path })
    }
    const abort = new AbortController()
    const next = controller.prepareNoteMerge('Second.md', abort.signal)
    await started.promise
    assert.equal(prepared.signal.aborted, true, 'a new preparation invalidates the older review')
    abort.abort()
    late.resolve({ ok: true, value: source })
    await assert.rejects(next)
  } finally { await controller.dispose() }
})

test('saves an edited note before renaming every open pane reference and refreshing the tree', async () => {
  const navigations: string[] = []
  const remote = new FakeRemote()
  const storage = new MemoryStorage()
  const controller = new WorkbenchRouteController(remote, path => { navigations.push(path) }, () => new Date(0), storage)

  await controller.syncLocation('/tocktutor/Folder/Note.md')
  assert.equal(controller.addActiveBookmark(), true)
  const original = controller.getSnapshot().source
  assert.equal(await controller.addPane(), true)
  await controller.select('Folder/Note.md')
  await controller.focusPane('pane-1')
  controller.edit(`${original}Edited locally\n`)
  const edited = controller.getSnapshot().source
  const renamed = await controller.renameActiveTitle('Renamed Note')

  assert.equal(renamed, true)
  assert.equal(controller.getSnapshot().path, 'Folder/Renamed Note.md')
  assert.equal(controller.getSnapshot().source, edited)
  assert.equal(controller.getSnapshot().saveStatus, 'saved')
  assert.deepEqual(controller.getSnapshot().panes.flatMap(pane => pane.tabs.map(tab => tab.path)), [
    'Folder/Renamed Note.md',
    'Folder/Renamed Note.md',
  ])
  assert.equal(controller.getSnapshot().panes.every(pane => {
    const active = pane.tabs.find(tab => tab.path === pane.activePath)
    return pane.activePath === 'Folder/Renamed Note.md' && active?.path === 'Folder/Renamed Note.md'
  }), true)
  const noteBookmark = controller.getSnapshot().bookmarks?.find(bookmark => bookmark.kind === 'note')
  assert.equal(noteBookmark !== undefined && 'path' in noteBookmark ? noteBookmark.path : undefined, 'Folder/Renamed Note.md')
  assert.deepEqual(controller.getSnapshot().entries.filter(entry => entry.kind === 'document').map(entry => entry.path).toSorted(), [
    'Board.canvas',
    'Folder/Renamed Note.md',
    'Second.md',
    'Tasks.base',
  ])
  const saveIndex = remote.calls.findIndex(call => call.method === 'saveDocument')
  const renameIndex = remote.calls.findIndex(call => call.method === 'renameDocument')
  assert.ok(saveIndex >= 0 && saveIndex < renameIndex)
  assert.equal((remote.calls[renameIndex]?.parameters[0] as { expectedRevision: string }).expectedRevision, secondRevision)
  assert.deepEqual(remote.calls[renameIndex]?.parameters[0], {
    expectedRevision: secondRevision,
    expectedVault: firstVault,
    fromPath: 'Folder/Note.md',
    toPath: 'Folder/Renamed Note.md',
  })
  assert.equal(navigations.at(-1), '/tocktutor/Folder/Renamed%20Note.md')
  controller.dispose()
})

test('rename preserves edits made while the filesystem move is pending', async () => {
  const remote = new FakeRemote()
  const controller = new WorkbenchRouteController(remote, () => {})
  await controller.syncLocation('/tocktutor/Folder/Note.md')
  const rename = remote.tocktutorWorkbench.renameDocument
  const gate = deferred<void>()
  ;(remote as WorkbenchRouteRemote).tocktutorWorkbench.renameDocument = async (...args) => { await gate.promise; return rename(...args) }
  const pending = controller.renameActiveTitle('Renamed')
  controller.edit('Newer unsaved content')
  gate.resolve()
  assert.equal(await pending, true)
  assert.equal(controller.getSnapshot().source, 'Newer unsaved content')
  assert.equal(controller.getSnapshot().saveStatus, 'unsaved')
  assert.equal(controller.getSnapshot().path, 'Folder/Renamed.md')
  await controller.dispose()
  assert.ok(remote.calls.some(call => call.method === 'saveDraft'
    && (call.parameters[0] as { path: string }).path === 'Folder/Renamed.md'))
  controller.dispose()
})

test('clean external changes reload the active document without replacing later local edits', async () => {
  const remote = new FakeRemote()
  const controller = new WorkbenchRouteController(remote, () => {})
  await controller.syncLocation('/tocktutor/Folder/Note.md')
  remote.openOverride = path => success({ content: '# External', digest: `sha256:${'d'.repeat(64)}`, generation: firstVault.generation, path, revision: secondRevision })
  remote.emit({ action: 'updated', kind: 'entry', path: 'Folder/Note.md', vault: firstVault })
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(controller.getSnapshot().source, '# External')
  assert.equal(controller.getSnapshot().revision, secondRevision)
  controller.edit('Local draft')
  remote.emit({ action: 'updated', kind: 'entry', path: 'Folder/Note.md', vault: firstVault })
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(controller.getSnapshot().source, 'Local draft')
  controller.dispose()
})

test('does not rename an edited note when saving its source fails', async () => {
  const remote = new FakeRemote()
  remote.saveFailure = { code: 'conflict', message: 'source changed' }
  const controller = new WorkbenchRouteController(remote, () => {})

  await controller.syncLocation('/tocktutor/Folder/Note.md')
  controller.edit(`${controller.getSnapshot().source}Edited locally\n`)
  assert.equal(await controller.renameActiveTitle('Renamed Note'), false)
  assert.equal(remote.calls.some(call => call.method === 'renameDocument'), false)
  assert.equal(controller.getSnapshot().path, 'Folder/Note.md')
  controller.dispose()
})

test('keeps the active note authoritative when a title rename fails', async () => {
  const remote = new FakeRemote()
  remote.renameFailure = { code: 'conflict', message: 'destination changed' }
  const controller = new WorkbenchRouteController(remote, () => {})

  await controller.syncLocation('/tocktutor/Folder/Note.md')
  assert.equal(await controller.renameActiveTitle('Renamed Note'), false)
  assert.equal(controller.getSnapshot().path, 'Folder/Note.md')
  assert.match(controller.getSnapshot().message, /destination changed|Save Conflict/u)
  controller.dispose()
})

test('reports incomplete link rewrites without hiding a committed note rename', async () => {
  const remote = new FakeRemote()
  remote.renameRewriteError = 'Referrer Second.md changed after the move'
  const controller = new WorkbenchRouteController(remote, () => {})

  await controller.syncLocation('/tocktutor/Folder/Note.md')
  assert.equal(await controller.renameActiveTitle('Renamed Note'), true)
  assert.equal(controller.getSnapshot().path, 'Folder/Renamed Note.md')
  assert.match(controller.getSnapshot().message, /renamed; Some note links could not be updated: Referrer Second\.md/u)
  assert.ok(controller.getSnapshot().warnings.some(warning => warning.includes('Some note links could not be updated')))
  controller.dispose()
})

test('moves the active note through the same revision-aware Host contract', async () => {
  const remote = new FakeRemote()
  const navigations: string[] = []
  const controller = new WorkbenchRouteController(remote, path => { navigations.push(path) })

  await controller.syncLocation('/tocktutor/Folder/Note.md')
  assert.equal(await controller.moveActiveNote('Archive/2026'), true)
  assert.equal(controller.getSnapshot().path, 'Archive/2026/Note.md')
  assert.equal(controller.getSnapshot().message, 'Archive/2026/Note.md moved.')
  const move = remote.calls.findLast(call => call.method === 'renameDocument')
  assert.deepEqual(move?.parameters[0], {
    expectedRevision: firstRevision,
    expectedVault: firstVault,
    fromPath: 'Folder/Note.md',
    toPath: 'Archive/2026/Note.md',
  })
  assert.equal(navigations.at(-1), '/tocktutor/Archive/2026/Note.md')
  assert.equal(await controller.moveActiveNote('../outside'), false)
  assert.equal(controller.getSnapshot().path, 'Archive/2026/Note.md')
  controller.dispose()
})

test('opens a Reading View wikilink only through Host-resolved path and fragment metadata', async () => {
  const remote = new FakeRemote()
  remote.linksOverride = request => success({
    backlinkDetails: [],
    backlinks: [],
    cursor: null,
    generation: request.expectedVault.generation,
    outgoing: ['Notes/Alias Target.md'],
    outgoingDetails: [{
      authoredTarget: 'Alias Target#Details',
      displayText: 'the alias note',
      fragment: 'Details',
      kind: 'wiki',
      line: 2,
      normalizedTarget: 'Alias Target',
      resolvedPath: 'Notes/Alias Target.md',
      sourcePath: request.path,
      status: 'resolved',
    }],
    path: request.path,
    scan: { bytes: 30, entries: 2, files: 2 },
    tagRelations: [],
    truncated: false,
    truncationReason: null,
    unlinkedMentions: [],
    warnings: [],
  })
  const navigations: string[] = []
  const controller = new WorkbenchRouteController(remote, path => { navigations.push(path) })

  await controller.syncLocation('/tocktutor/Folder/Note.md')
  assert.deepEqual(await controller.openInternalLink('Alias Target#Details'), { fragment: 'Details' })
  assert.equal(controller.getSnapshot().path, 'Notes/Alias Target.md')
  assert.equal(controller.getSnapshot().mode, 'reading')
  assert.equal(navigations.at(-1), '/tocktutor/Notes/Alias%20Target.md')
  assert.equal(await controller.openInternalLink('Unresolved'), null)
  assert.equal(controller.getSnapshot().path, 'Notes/Alias Target.md')
  controller.dispose()
})

test('loads the active vault name, display path, and generation without fetching recent vaults', async () => {
  const remote = new FakeRemote()
  const controller = new WorkbenchRouteController(remote, () => {})

  await controller.syncLocation('/tocktutor')

  assert.equal(controller.getSnapshot().phase, 'ready')
  assert.equal(controller.getSnapshot().vaultDisplayPath, '~/Documents/Research Vault')
  assert.equal(controller.getSnapshot().vaultName, 'Research Vault')
  assert.equal(remote.calls.some(call => call.method === 'listRecentVaults'), false)
  controller.dispose()
})

test('an initially inactive route observes the next vault activation', async () => {
  const remote = new FakeRemote()
  remote.vault = null
  const controller = new WorkbenchRouteController(remote, () => {})
  await controller.syncLocation('/tocktutor')
  assert.equal(controller.getSnapshot().phase, 'inactive')

  remote.vault = firstVault
  remote.emit({ action: 'activated', kind: 'vault', vault: firstVault })
  await new Promise(resolve => setTimeout(resolve, 0))
  assert.deepEqual(controller.getSnapshot().vault, firstVault)
  assert.equal(controller.getSnapshot().phase, 'ready')
  controller.dispose()
})

test('dispose flushes a draft scheduled immediately before true disposal', async () => {
  const remote = new FakeRemote()
  const controller = new WorkbenchRouteController(remote, () => {})
  await controller.syncLocation('/tocktutor')
  assert.equal(await controller.select('Folder/Note.md'), true)
  controller.edit('# Draft must survive disposal\n')
  controller.dispose()
  await new Promise<void>(resolve => { setImmediate(resolve) })
  assert.equal(remote.draftContent, '# Draft must survive disposal\n')
  assert.equal(remote.calls.filter(call => call.method === 'saveDraft').length, 1)
})

test('dispose rejects a failed final draft result after bounded retries', async () => {
  const remote = new FakeRemote()
  remote.draftFailure = { code: 'unavailable', message: 'transport closed' }
  remote.draftFailuresBeforeSuccess = 99
  const controller = new WorkbenchRouteController(remote, () => {})
  await controller.syncLocation('/tocktutor')
  assert.equal(await controller.select('Folder/Note.md'), true)
  controller.edit('# Draft failure\n')
  await assert.rejects(controller.dispose(), /transport closed/u)
  assert.equal(remote.calls.filter(call => call.method === 'saveDraft').length, 3)
  assert.ok(remote.draftFailureReads >= 2)
})

test('dispose retries a failed final draft result and preserves the latest content', async () => {
  const remote = new FakeRemote()
  remote.draftFailure = { code: 'unavailable', message: 'try again' }
  remote.draftFailuresBeforeSuccess = 1
  const controller = new WorkbenchRouteController(remote, () => {})
  await controller.syncLocation('/tocktutor')
  assert.equal(await controller.select('Folder/Note.md'), true)
  controller.edit('# Draft retry\n')
  await controller.dispose()
  assert.equal(remote.draftContent, '# Draft retry\n')
  assert.equal(remote.calls.filter(call => call.method === 'saveDraft').length, 2)
})

test('dispose rejects a thrown final draft transport failure', async () => {
  const remote = new FakeRemote()
  remote.draftReject = new Error('transport closed')
  const controller = new WorkbenchRouteController(remote, () => {})
  await controller.syncLocation('/tocktutor')
  assert.equal(await controller.select('Folder/Note.md'), true)
  controller.edit('# Draft rejection\n')
  await assert.rejects(controller.dispose(), /transport closed/u)
  assert.equal(remote.calls.filter(call => call.method === 'saveDraft').length, 3)
})

test('browser location sync selects without recording a second navigation', async () => {
  const remote = new FakeRemote()
  const navigation: string[] = []
  const controller = new WorkbenchRouteController(remote, path => { navigation.push(path) })
  await controller.syncLocation('/tocktutor')
  assert.equal(await controller.select('Folder/Note.md', false), true)
  const before = navigation.length
  await controller.syncLocation('/tocktutor/Second.md')
  assert.equal(controller.getSnapshot().path, 'Second.md')
  assert.equal(navigation.length, before)
  controller.dispose()
})

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
  assert.equal(controller.getSnapshot().mode, 'live-preview')
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
  assert.equal(firstUnique.path, '202608241405.md')
  assert.equal(await controller.handleDispatch({
    kind: 'protocol',
    operationId: 'unique-again',
    request: { action: 'unique' },
  }), 'handled')
  const secondUnique = remote.calls.filter(call => call.method === 'createDocument').at(-1)?.parameters[0] as CreateDocumentRequest
  assert.equal(secondUnique.path, '202608241406.md')
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

test('routes split panes, heading targets, and existing-file policies through the save gate', async () => {
  const remote = new FakeRemote()
  const controller = new WorkbenchRouteController(remote, () => {})
  await controller.syncLocation('/tocktutor')
  assert.equal(await controller.handleDispatch({
    kind: 'protocol',
    operationId: 'split-open',
    request: { action: 'open', file: 'Folder/Note.md', paneType: 'split' },
  }), 'handled')
  assert.equal(controller.getSnapshot().panes.length, 2)
  assert.equal(controller.getSnapshot().path, 'Folder/Note.md')
  assert.equal(await controller.handleDispatch({
    kind: 'protocol',
    operationId: 'heading-open-decoded',
    request: { action: 'open', file: 'Folder/Note.md#Before' },
  }), 'handled')
  assert.equal(controller.getSnapshot().selectionStart, 0)
  assert.equal(await controller.handleDispatch({
    kind: 'protocol',
    operationId: 'block-open',
    request: { action: 'open', file: 'Folder/Note.md#^route-block' },
  }), 'handled')
  assert.equal(controller.getSnapshot().selectionStart, '# Before\n- [ ] Verify route\n'.length)
  assert.equal(await controller.handleDispatch({
    kind: 'protocol',
    operationId: 'append-existing',
    request: { action: 'new', file: 'Existing.md', content: 'Added', ifExists: 'append', silent: true },
  }), 'handled')
  const save = remote.calls.filter(call => call.method === 'saveDocument').at(-1)?.parameters[0] as { content: string }
  assert.equal(save.content, '---\nstatus: open\n---\n# Second\nAdded')
  controller.dispose()
})

test('creates built-in template notes and inserts current date/time at the active selection', async () => {
  const remote = new FakeRemote()
  const controller = new WorkbenchRouteController(remote, () => {}, () => new Date(2026, 7, 26, 15, 4))
  await controller.syncLocation('/tocktutor')
  assert.equal(await controller.select('Folder/Note.md'), true)
  controller.setMode('source')
  controller.setSelection(2, 2)
  assert.equal(controller.insertCurrentDateTime('date'), true)
  assert.match(controller.getSnapshot().source, /^# 2026-08-26Before/u)
  assert.equal(await controller.save(), true)
  assert.equal(await controller.createBuiltinTemplateNote('Cornell Notes'), true)
  const create = remote.calls.findLast(call => call.method === 'createDocument')?.parameters[0] as CreateDocumentRequest
  assert.equal(create.path, 'Templates/Cornell Notes.md')
  assert.match(create.content, /^# Cornell Notes/u)
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
  assert.equal(controller.getSnapshot().path, 'Notes/Quick.md')
  assert.equal(controller.getSnapshot().documentKind, 'markdown')
  assert.equal(controller.getSnapshot().saveStatus, 'saved')
  assert.equal(controller.getSnapshot().panes.find(pane => pane.id === controller.getSnapshot().focusedPaneId)?.activePath, 'Notes/Quick.md')
  assert.equal(controller.getSnapshot().source, '')
  assert.equal(controller.getSnapshot().entries.some(entry => entry.path === 'Notes/Quick.md'), true)
  assert.equal(remote.calls.filter(call => call.method === 'listTree').length, 2)

  remote.createFailure = { code: 'exists', message: 'Notes/Quick.md already exists.' }
  const pendingCollision = controller.handleDispatch({
    action: 'new',
    kind: 'quick-action',
    operationId: 'quick-new-collision',
  })
  await controller.submitDispatchDialog({ path: 'Notes/Quick.md' })
  assert.equal(await pendingCollision, 'failed')
  assert.equal(controller.getSnapshot().path, 'Notes/Quick.md')
  assert.equal(controller.getSnapshot().message, 'Notes/Quick.md already exists.')
  remote.createFailure = null

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
  assert.equal(remote.calls.filter(call => call.method === 'createDocument').length, 3)
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

  controller.dispose()
})

test('does not record a new note when the post-create tree refresh fails', async () => {
  const remote = new FakeRemote()
  const controller = new WorkbenchRouteController(remote, () => {})
  await controller.syncLocation('/tocktutor')
  remote.treeFailure = new Error('tree unavailable')

  const pendingNew = controller.handleDispatch({
    action: 'new',
    kind: 'quick-action',
    operationId: 'tree-refresh-failure',
  })
  await controller.submitDispatchDialog({ path: 'Notes/Quick.md' })

  assert.equal(await pendingNew, 'failed')
  assert.equal(controller.getSnapshot().path, null)
  assert.deepEqual(controller.getSnapshot().panes.flatMap(pane => pane.tabs), [])
  assert.equal(controller.getSnapshot().entries.some(entry => entry.path === 'Notes/Quick.md'), false)
  assert.equal(controller.getSnapshot().message, 'tree unavailable')
  controller.dispose()
})

test('does not record a new note after the post-create tree refresh goes stale', async () => {
  const remote = new FakeRemote()
  const controller = new WorkbenchRouteController(remote, () => {})
  await controller.syncLocation('/tocktutor')
  const gate = deferred<void>()
  remote.treeGate = gate

  const pendingNew = controller.handleDispatch({
    action: 'new',
    kind: 'quick-action',
    operationId: 'tree-refresh-stale',
  })
  const submitting = controller.submitDispatchDialog({ path: 'Notes/Quick.md' })
  for (let attempt = 0; attempt < 20 && remote.calls.filter(call => call.method === 'listTree').length < 2; attempt += 1) {
    await new Promise(resolve => setTimeout(resolve, 0))
  }
  assert.equal(remote.calls.filter(call => call.method === 'listTree').length, 2)

  remote.vault = secondVault
  remote.emit({ action: 'activated', kind: 'vault', vault: secondVault })
  gate.resolve()

  assert.equal(await pendingNew, 'stale')
  await submitting
  assert.equal(controller.getSnapshot().path, null)
  assert.deepEqual(controller.getSnapshot().panes.flatMap(pane => pane.tabs), [])
  controller.dispose()
})

test('newly created notes remain visible and restore through a named workspace', async () => {
  const storage = new MemoryStorage()
  const createdPaths = new Set<string>()
  const firstRemote = new FakeRemote(createdPaths)
  const first = new WorkbenchRouteController(firstRemote, () => {}, () => new Date(20), storage)
  await first.syncLocation('/tocktutor')
  const pendingNew = first.handleDispatch({
    action: 'new',
    kind: 'quick-action',
    operationId: 'persist-created-note',
  })
  await first.submitDispatchDialog({ path: 'Notes/Quick.md' })
  assert.equal(await pendingNew, 'handled')
  assert.equal(first.getSnapshot().entries.some(entry => entry.path === 'Notes/Quick.md'), true)
  assert.equal(await first.addPane(), true)
  assert.equal(await first.focusPane('pane-1'), true)
  assert.equal(first.saveCurrentWorkspace('Quick Layout'), true)
  first.dispose()

  const secondRemote = new FakeRemote(createdPaths)
  const second = new WorkbenchRouteController(secondRemote, () => {}, () => new Date(21), storage)
  await second.syncLocation('/tocktutor')
  assert.equal(second.getSnapshot().entries.some(entry => entry.path === 'Notes/Quick.md'), true)
  assert.equal(second.getSnapshot().path, 'Notes/Quick.md')
  assert.equal(second.getSnapshot().panes.length, 2)
  assert.equal(await second.select('Second.md'), true)
  assert.equal(await second.loadWorkspace('quick-layout'), true)
  assert.equal(second.getSnapshot().path, 'Notes/Quick.md')
  assert.equal(second.getSnapshot().panes.length, 2)
  second.dispose()
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

test('publishes one-shot Source selection requests for line navigation', async () => {
  const controller = new WorkbenchRouteController(new FakeRemote(), () => {})
  await controller.syncLocation('/tocktutor')
  assert.equal(await controller.select('Folder/Note.md'), true)
  assert.equal(controller.jumpToLine(2), true)
  const request = controller.getSnapshot().selectionRequest
  assert.deepEqual(request, { from: 9, id: 1, to: 27 })
  controller.setSelection(9, 27)
  assert.equal(controller.getSnapshot().selectionRequest, null)
  assert.equal(controller.jumpToLine(3), true)
  assert.deepEqual(controller.getSnapshot().selectionRequest, { from: 28, id: 2, to: 50 })
  assert.equal(controller.jumpToLine(2), true)
  assert.deepEqual(controller.getSnapshot().selectionRequest, { from: 9, id: 3, to: 27 })
  controller.dispose()
})

test('loads, edits, reads, toggles, and snapshot-saves one exact note', async () => {
  const remote = new FakeRemote()
  const navigation: Array<[string, 'push' | 'replace' | undefined]> = []
  const controller = new WorkbenchRouteController(remote, (path, mode) => { navigation.push([path, mode]) })
  await controller.syncLocation('/tocktutor')
  assert.equal(controller.getSnapshot().phase, 'ready')
  assert.deepEqual(controller.getSnapshot().entries.map(entry => entry.path), [
    'Attachments/existing.png',
    'Board.canvas',
    'Folder',
    'Folder/Note.md',
    'Second.md',
    'Tasks.base',
  ])

  assert.equal(await controller.select('Folder/Note.md'), true)
  assert.deepEqual(navigation, [['/tocktutor/Folder/Note.md', undefined]])
  assert.equal(controller.getSnapshot().mode, 'live-preview')
  assert.equal(controller.getSnapshot().source, '# Before\n- [ ] Verify route\nParagraph ^route-block\n')
  controller.edit('x'.repeat(MAX_ROUTE_SOURCE_BYTES + 1))
  assert.equal(controller.getSnapshot().source, '# Before\n- [ ] Verify route\nParagraph ^route-block\n')
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
  const inactiveMarkup = renderToStaticMarkup(createElement(TockTutorRouteView, {
    active: false,
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
  assert.doesNotMatch(inactiveMarkup, /TockTutor Title Bar/u)
  assert.match(html, /pt-0/u)
  assert.match(html, /h-\[var\(--tockteam-titlebar-height,40px\)\]/u)
  assert.match(html, /tocktutor-titlebar absolute top-0[^"\n]+border-b border-\[var\(--tt-border\)\]/u)
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
  assert.doesNotMatch(sidebarHeader, /<span/u)
  assert.doesNotMatch(sidebarHeader, /M15 3v18/u)
  assert.match(html, /\[--tt-footer-height:28px\]/u)
  assert.match(html, /grid-rows-\[40px_minmax\(0,1fr\)_var\(--tt-footer-height\)\]/u)
  assert.doesNotMatch(html, /--tt-tab-border/u)
  assert.match(html, /\[--tt-tab-curve:16px\]/u)
  assert.match(html, /border-transparent/u)
  assert.match(html, /before:rounded-br-\[var\(--tt-tab-curve\)\]/u)
  assert.match(html, /after:rounded-bl-\[var\(--tt-tab-curve\)\]/u)
  assert.doesNotMatch(html, /before:\[clip-path/u)
  assert.match(html, /<aside[^>]+aria-hidden="false"[^>]+aria-label="Files"[^>]+data-open="true"/u)
  assert.match(html, /<aside[^>]+aria-hidden="true"[^>]+aria-label="Assistant Panel"[^>]+class="tocktutor-right-panel tocktutor-right-panel-assistant[^>]+data-open="false"[^>]+inert=""/u)
  assert.doesNotMatch(html, /aria-label="Close Assistant"/u)
  assert.match(html, /tocktutor-right-panel[^>]+border-l[^>]+shadow-none/u)
  assert.match(html, /tocktutor-right-panel[^>]+data-\[open=false\]:border-l-0/u)
  assert.match(html, /transition-\[width,opacity,transform,visibility\]/u)
  assert.match(html, /tocktutor-right-panel-assistant[^>]+overflow-hidden/u)
  assert.match(html, /tocktutor-right-panel-assistant[^>]+border-l-0/u)
  assert.match(html, /data-\[open=true\]:overflow-visible/u)
  assert.match(html, /tocktutor-assistant-content[^>]+border-\[color-mix\(in_srgb,var\(--tt-text\)_8%,var\(--tt-border\)_92%\)\]/u)
  assert.match(html, /data-\[open=true\]:w-\[min\(300px,calc\(100vw-262px\)\)\]/u)
  assert.match(html, /Assistant Surface/u)
  assert.match(html, /aria-label="Vault Notes"/u)
  assert.match(html, /<details[^>]+open=""/u)
  assert.match(html, /<summary[^>]+tocktutor-tree-row/u)
  assert.doesNotMatch(html, /tocktutor-tree-directory[^>]+aria-expanded/u)
  assert.match(html, /aria-label="Reading View"/u)
  assert.match(html, /<section[^>]+aria-label="Note Editor"[^>]+role="tabpanel"/u)
  assert.match(html, /<footer[^>]+aria-label="TockTutor Status Bar"/u)
  assert.match(html, /motion-reduce:/u)
  assert.doesNotMatch(html, /<script>unsafe\(\)<\/script>/u)
  assert.doesNotMatch(html, /Unsafe HTML is inert in Reading view\./u)

  controller.dispose()
  assert.equal(remote.listeners.size, 0)
})

test('reuses the active note tab and preserves dirty drafts across pane focus', async () => {
  const remote = new FakeRemote()
  const controller = new WorkbenchRouteController(remote, () => {})
  await controller.syncLocation('/tocktutor')
  assert.deepEqual(controller.getSnapshot().panes, [{ activePath: null, id: 'pane-1', tabs: [] }])

  await controller.select('Folder/Note.md')
  await controller.select('Second.md')
  assert.deepEqual(controller.getSnapshot().panes[0]?.tabs.map(tab => tab.path), ['Second.md'])
  assert.equal(controller.getSnapshot().panes[0]?.activePath, 'Second.md')
  assert.equal(await controller.goBack(), true)
  assert.deepEqual(controller.getSnapshot().panes[0]?.tabs.map(tab => tab.path), ['Folder/Note.md'])

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
  assert.equal(await controller.focusPane('pane-2'), true)
  assert.equal(controller.getSnapshot().focusedPaneId, 'pane-2')
  assert.equal(controller.getPaneSnapshot('pane-1').source, '# Dirty pane\n')
  await controller.focusPane('pane-1')

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

test('closes panes through the save gate and keeps one focused pane', async () => {
  const remote = new FakeRemote()
  const controller = new WorkbenchRouteController(remote, () => {})
  await controller.syncLocation('/tocktutor')
  assert.equal(await controller.select('Folder/Note.md'), true)
  assert.equal(await controller.addPane(), true)
  assert.equal(await controller.select('Second.md'), true)

  controller.edit('# Dirty pane\n')
  remote.saveFailure = { code: 'conflict', message: 'revision changed' }
  assert.equal(await controller.closePane('pane-2'), false)
  assert.equal(controller.getSnapshot().focusedPaneId, 'pane-2')
  assert.equal(controller.getSnapshot().panes.length, 2)
  assert.equal(controller.getSnapshot().message, 'Save Conflict: The note changed outside this editor. Your source remains unsaved.')

  remote.saveFailure = null
  assert.equal(await controller.closePane('pane-2'), true)
  assert.equal(controller.getSnapshot().focusedPaneId, 'pane-1')
  assert.equal(controller.getSnapshot().path, 'Folder/Note.md')
  assert.equal(controller.getSnapshot().panes.length, 1)
  assert.equal(await controller.closePane('pane-1'), false)
  assert.equal(controller.getSnapshot().panes.length, 1)
  controller.dispose()
})

test('keeps ordinary note switching in one reusable tab', async () => {
  const remote = new FakeRemote()
  const controller = new WorkbenchRouteController(remote, () => {})
  await controller.syncLocation('/tocktutor')
  for (let index = 0; index <= 20; index += 1) {
    assert.equal(await controller.select(`Note-${String(index)}.md`), true)
  }
  assert.deepEqual(controller.getSnapshot().panes[0]?.tabs.map(tab => tab.path), ['Note-20.md'])
  controller.dispose()
})

test('Canvas board and executable Base preserve bounded source identities', async () => {
  const remote = new FakeRemote()
  const controller = new WorkbenchRouteController(remote, () => {})
  await controller.syncLocation('/tocktutor')

  assert.equal(await controller.select('Board.canvas'), true)
  assert.equal(controller.getSnapshot().documentKind, 'canvas')
  assert.equal(controller.getSnapshot().mode, 'reading')
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
  assert.equal(controller.getSnapshot().mode, 'reading')
  controller.setMode('reading')
  await new Promise(resolve => setImmediate(resolve))
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
  assert.match(html, /aria-label="Executable Base"/u)
  assert.match(html, /aria-label="Tasks Results"/u)
  assert.match(html, /Second/u)
  const row = controller.getSnapshot().baseFiles?.find(file => file.path === 'Second.md')
  assert.ok(row)
  const edit = createExecutableBaseFrontmatterEdit(row, 'note.status', 'done')
  assert.ok(edit)
  assert.equal(await controller.applyBaseEdit(edit), true)
  assert.match(controller.getSnapshot().baseFiles?.find(file => file.path === 'Second.md')?.source ?? '', /status: done/u)
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
  assert.equal(await controller.restoreRecoverySnapshotOverwrite(snapshotId), true)
  assert.equal(remote.calls.some(call => call.method === 'restoreSnapshot'), true)
  await controller.setRecoveryOpen(false)
  assert.equal(controller.getSnapshot().selectedSnapshot, null)
  assert.equal(await controller.captureRecoverySnapshot(), true)
  assert.equal(remote.calls.some(call => call.method === 'captureSnapshot'), true)
  assert.equal(remote.calls.some(call => call.method === 'readSnapshot'), true)
  assert.equal(controller.getSnapshot().selectedSnapshot?.content, '# Snapshot\n')
  assert.equal(await controller.clearRecoverySnapshots(), true)
  assert.equal(controller.getSnapshot().snapshots?.length, 0)
  assert.equal(await controller.restoreTrashEntry(trashId), true)
  assert.equal(remote.calls.some(call => call.method === 'restoreTrash'), true)
  assert.equal(await controller.trashCurrent(), true)
  assert.equal(controller.getSnapshot().path, null)
  assert.equal(remote.calls.some(call => call.method === 'trashEntry'), true)
  controller.dispose()
})

test('trashes an aliased active document when the runtime returns an entry revision', async () => {
  const remote = new FakeRemote()
  const aliasPath = 'Aliases/Note.md'
  remote.aliasPath = aliasPath
  remote.trashEntryResult = {
    createdAt: 1,
    generation: firstVault.generation,
    id: 'trash-12345678-1234-4123-8123-123456789abc',
    kind: 'document',
    originalPath: aliasPath,
    revision: aliasRevision,
    status: 'trashed',
  }
  const navigations: string[] = []
  const controller = new WorkbenchRouteController(remote, path => { navigations.push(path) })
  await controller.syncLocation('/tocktutor')
  assert.equal(await controller.select(aliasPath), true)
  assert.equal(controller.getSnapshot().revision, aliasRevision)

  assert.equal(await controller.trashCurrent(), true)
  assert.equal(controller.getSnapshot().path, null)
  assert.equal(navigations.at(-1), '/tocktutor')
  assert.deepEqual(remote.calls.findLast(call => call.method === 'trashEntry')?.parameters[0], {
    expectedRevision: aliasRevision,
    expectedVault: firstVault,
    path: aliasPath,
  })
  controller.dispose()
})

test('restores an aliased trash entry when the runtime returns an entry revision', async () => {
  const remote = new FakeRemote()
  const aliasPath = 'Aliases/Note.md'
  const trashId = 'trash-123e4567-e89b-42d3-a456-426614174000'
  remote.aliasPath = aliasPath
  remote.trashEntries = [{ createdAt: 2, id: trashId, kind: 'document', originalPath: aliasPath }]
  remote.restoreTrashResult = {
    createdAt: 2,
    generation: firstVault.generation,
    id: trashId,
    kind: 'document',
    originalPath: aliasPath,
    path: aliasPath,
    revision: aliasRevision,
    status: 'restored',
  }
  const controller = new WorkbenchRouteController(remote, () => {})
  await controller.syncLocation('/tocktutor')
  assert.equal(await controller.select(aliasPath), true)
  await controller.setRecoveryOpen(true)

  assert.equal(await controller.restoreTrashEntry(trashId), true)
  assert.equal(controller.getSnapshot().path, aliasPath)
  assert.equal(controller.getSnapshot().recoveryOpen, true)
  assert.equal(remote.calls.some(call => call.method === 'listTree'), true)
  controller.dispose()
})

test('rejects malformed trash mutation results without changing the active note', async () => {
  const remote = new FakeRemote()
  const trashId = 'trash-123e4567-e89b-42d3-a456-426614174000'
  remote.trashEntries = [{ createdAt: 2, id: trashId, kind: 'document', originalPath: 'Deleted.md' }]
  const controller = new WorkbenchRouteController(remote, () => {})
  await controller.syncLocation('/tocktutor')
  assert.equal(await controller.select('Folder/Note.md'), true)

  remote.trashEntryResult = {
    createdAt: 1,
    generation: firstVault.generation,
    id: 'trash-12345678-1234-4123-8123-123456789abc',
    kind: 'document',
    originalPath: 'Other.md',
    revision: secondRevision,
    status: 'trashed',
  }
  assert.equal(await controller.trashCurrent(), false)
  assert.equal(controller.getSnapshot().path, 'Folder/Note.md')

  await controller.setRecoveryOpen(true)
  remote.restoreTrashResult = {
    createdAt: 2,
    generation: firstVault.generation,
    id: trashId,
    kind: 'document',
    originalPath: 'Deleted.md',
    path: 'Other.md',
    revision: secondRevision,
    status: 'restored',
  }
  assert.equal(await controller.restoreTrashEntry(trashId), false)
  assert.equal(controller.getSnapshot().path, 'Folder/Note.md')
  controller.dispose()
})

test('drops delayed recovery previews when the active note changes', async () => {
  const remote = new FakeRemote()
  const snapshotId = '2026-08-22T18-00-00-000Z-deadbeef'
  remote.snapshots = [{ createdAt: 1, digest: `sha256:${'a'.repeat(64)}`, id: snapshotId, path: 'Folder/Note.md', reason: 'save', size: 11 }]
  const controller = new WorkbenchRouteController(remote, () => {})
  await controller.syncLocation('/tocktutor')
  assert.equal(await controller.select('Folder/Note.md'), true)
  await controller.setRecoveryOpen(true)
  const gate = deferred<Awaited<ReturnType<typeof remote.tocktutorWorkbench.readSnapshot>>>()
  const readSnapshot = remote.tocktutorWorkbench.readSnapshot
  remote.tocktutorWorkbench.readSnapshot = request => gate.promise
  const pending = controller.readRecoverySnapshot(snapshotId)
  await controller.select('Second.md')
  gate.resolve(await readSnapshot({ expectedVault: firstVault, path: 'Folder/Note.md', snapshotId }))
  assert.equal(await pending, false)
  assert.equal(controller.getSnapshot().path, 'Second.md')
  assert.equal(controller.getSnapshot().selectedSnapshot, null)
  remote.tocktutorWorkbench.readSnapshot = readSnapshot
  controller.dispose()
})

test('does not let delayed recovery mutations clear or close a newer note', async () => {
  const remote = new FakeRemote()
  const snapshotId = '2026-08-22T18-00-00-000Z-deadbeef'
  remote.snapshots = [{ createdAt: 1, digest: `sha256:${'a'.repeat(64)}`, id: snapshotId, path: 'Folder/Note.md', reason: 'save', size: 11 }]
  const controller = new WorkbenchRouteController(remote, () => {})
  await controller.syncLocation('/tocktutor')
  assert.equal(await controller.select('Folder/Note.md'), true)
  await controller.setRecoveryOpen(true)
  const restoreGate = deferred<Awaited<ReturnType<typeof remote.tocktutorWorkbench.restoreSnapshot>>>()
  const restoreSnapshot = remote.tocktutorWorkbench.restoreSnapshot
  remote.tocktutorWorkbench.restoreSnapshot = request => restoreGate.promise
  const pendingRestore = controller.restoreRecoverySnapshotOverwrite(snapshotId)
  await controller.select('Second.md')
  restoreGate.resolve(await restoreSnapshot({ expectedRevision: firstRevision, expectedVault: firstVault, path: 'Folder/Note.md', snapshotId }))
  assert.equal(await pendingRestore, false)
  assert.equal(controller.getSnapshot().path, 'Second.md')

  await controller.select('Folder/Note.md')
  const trashGate = deferred<Awaited<ReturnType<typeof remote.tocktutorWorkbench.trashEntry>>>()
  const trashEntry = remote.tocktutorWorkbench.trashEntry
  remote.tocktutorWorkbench.trashEntry = request => trashGate.promise
  const pendingTrash = controller.trashCurrent()
  await controller.select('Second.md')
  trashGate.resolve(await trashEntry({ expectedRevision: firstRevision, expectedVault: firstVault, path: 'Folder/Note.md' }))
  assert.equal(await pendingTrash, false)
  assert.equal(controller.getSnapshot().path, 'Second.md')
  remote.tocktutorWorkbench.restoreSnapshot = restoreSnapshot
  remote.tocktutorWorkbench.trashEntry = trashEntry
  controller.dispose()
})

test('rejects delayed capture, restore, and trash completions after identity changes', async () => {
  const remote = new FakeRemote()
  const snapshotId = '2026-08-22T18-00-00-000Z-deadbeef'
  remote.snapshots = [{ createdAt: 1, digest: `sha256:${'a'.repeat(64)}`, id: snapshotId, path: 'Folder/Note.md', reason: 'save', size: 11 }]
  remote.trashEntries = [{ createdAt: 2, id: 'trash-123e4567-e89b-42d3-a456-426614174000', kind: 'document', originalPath: 'Deleted.md' }]
  const controller = new WorkbenchRouteController(remote, () => {})
  await controller.syncLocation('/tocktutor')
  assert.equal(await controller.select('Folder/Note.md'), true)
  await controller.setRecoveryOpen(true)

  const captureGate = deferred<Awaited<ReturnType<typeof remote.tocktutorWorkbench.captureSnapshot>>>()
  const captureSnapshot = remote.tocktutorWorkbench.captureSnapshot
  remote.tocktutorWorkbench.captureSnapshot = request => captureGate.promise
  const pendingCapture = controller.captureRecoverySnapshot()
  await controller.select('Second.md')
  captureGate.resolve(await captureSnapshot({ content: '# Before\n', expectedVault: firstVault, path: 'Folder/Note.md', reason: 'manual' }))
  assert.equal(await pendingCapture, false)
  assert.equal(controller.getSnapshot().path, 'Second.md')
  remote.tocktutorWorkbench.captureSnapshot = captureSnapshot

  await controller.select('Folder/Note.md')
  await controller.setRecoveryOpen(true)
  const clearGate = deferred<Awaited<ReturnType<typeof remote.tocktutorWorkbench.clearSnapshots>>>()
  const clearSnapshots = remote.tocktutorWorkbench.clearSnapshots
  remote.tocktutorWorkbench.clearSnapshots = request => clearGate.promise
  const pendingClear = controller.clearRecoverySnapshots()
  await controller.select('Second.md')
  clearGate.resolve(await clearSnapshots({ expectedVault: firstVault, path: 'Folder/Note.md' }))
  assert.equal(await pendingClear, false)
  assert.equal(controller.getSnapshot().path, 'Second.md')
  remote.tocktutorWorkbench.clearSnapshots = clearSnapshots

  await controller.select('Folder/Note.md')
  await controller.setRecoveryOpen(true)
  const restoreGate = deferred<Awaited<ReturnType<typeof remote.tocktutorWorkbench.restoreSnapshotAsNew>>>()
  const restoreSnapshotAsNew = remote.tocktutorWorkbench.restoreSnapshotAsNew
  remote.tocktutorWorkbench.restoreSnapshotAsNew = request => restoreGate.promise
  const pendingRestore = controller.restoreRecoverySnapshot(snapshotId)
  await controller.select('Second.md')
  restoreGate.resolve(await restoreSnapshotAsNew({ expectedVault: firstVault, path: 'Folder/Note.md', snapshotId, toPath: 'Recovered/Note Recovery.md' }))
  assert.equal(await pendingRestore, false)
  assert.equal(controller.getSnapshot().path, 'Second.md')
  remote.tocktutorWorkbench.restoreSnapshotAsNew = restoreSnapshotAsNew

  await controller.setRecoveryOpen(true)
  const trashId = remote.trashEntries[0]!.id
  const restoreTrashGate = deferred<Awaited<ReturnType<typeof remote.tocktutorWorkbench.restoreTrash>>>()
  const restoreTrash = remote.tocktutorWorkbench.restoreTrash
  remote.tocktutorWorkbench.restoreTrash = request => restoreTrashGate.promise
  const pendingTrashRestore = controller.restoreTrashEntry(trashId)
  remote.vault = secondVault
  await controller.reload()
  restoreTrashGate.resolve(await restoreTrash({ expectedVault: firstVault, id: trashId }))
  assert.equal(await pendingTrashRestore, false)
  assert.deepEqual(controller.getSnapshot().vault, secondVault)
  assert.equal(controller.getSnapshot().path, null)
  remote.tocktutorWorkbench.restoreTrash = restoreTrash
  controller.dispose()
})

test('dirty-gates managed and sandbox vault transitions without browser paths', async () => {
  const remote = new FakeRemote()
  const controller = new WorkbenchRouteController(remote, () => {})
  await controller.syncLocation('/tocktutor')
  assert.equal(await controller.select('Folder/Note.md'), true)
  controller.edit('# Dirty vault switch\n')
  remote.saveFailure = { code: 'conflict', message: 'changed' }
  assert.equal(await controller.createManagedVault('Class Notes'), false)
  assert.equal(remote.calls.some(call => call.method === 'createManagedVault'), false)

  remote.saveFailure = null
  assert.equal(await controller.createManagedVault('Class Notes'), true)
  assert.deepEqual(controller.getSnapshot().vault, sandboxVault)
  assert.equal(await controller.openSandboxVault(), true)
  assert.deepEqual(controller.getSnapshot().vault, sandboxVault)
  const requests = remote.calls
    .filter(call => call.method === 'createManagedVault' || call.method === 'openSandboxVault')
    .map(call => call.parameters[0])
  assert.deepEqual(requests, [
    { expectedGeneration: firstVault.generation, name: 'Class Notes' },
    { expectedGeneration: sandboxVault.generation },
  ])
  controller.dispose()
})

test('pins, reorders, dirty-gates closes, and restores bounded route tabs', async () => {
  const remote = new FakeRemote()
  const controller = new WorkbenchRouteController(remote, () => {})
  await controller.syncLocation('/tocktutor')
  assert.equal(await controller.select('Folder/Note.md'), true)
  controller.togglePinTab('pane-1', 'Folder/Note.md')
  assert.equal(await controller.select('Second.md'), true)

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

test('persists Reading, Live Preview, and Source mode independently per explicit tab', async () => {
  const remote = new FakeRemote()
  const controller = new WorkbenchRouteController(remote, () => {})
  await controller.syncLocation('/tocktutor')
  assert.equal(await controller.select('Folder/Note.md'), true)
  controller.setMode('live-preview')
  controller.togglePinTab('pane-1', 'Folder/Note.md')
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

test('adds a document property while Reading View is active', async () => {
  const remote = new FakeRemote()
  const controller = new WorkbenchRouteController(remote, () => {})
  await controller.syncLocation('/tocktutor')
  assert.equal(await controller.select('Second.md'), true)
  controller.setMode('reading')

  assert.equal(controller.setProperty('effort', ''), true)
  assert.match(controller.getSnapshot().source, /effort: ""/u)
  assert.equal(controller.getSnapshot().saveStatus, 'unsaved')
  controller.dispose()
})

test('runs editor commands against the captured Source selection', async () => {
  const remote = new FakeRemote()
  const controller = new WorkbenchRouteController(remote, () => {})
  await controller.syncLocation('/tocktutor')
  assert.equal(await controller.select('Folder/Note.md'), true)
  controller.setMode('source')
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
  const globalGraphRequest = remote.calls.find(call => call.method === 'graph')?.parameters[0] as Record<string, unknown>
  assert.deepEqual(globalGraphRequest, { expectedVault: firstVault, includeAttachments: false, includeTags: false, limit: 180, scope: 'global' })
  assert.equal(controller.getSnapshot().graphLayout?.length, 2)
  assert.equal(controller.getSnapshot().graphMode, 'global')
  assert.equal(await controller.select('Folder/Note.md'), true)
  assert.equal(await controller.loadGraph('local'), true)
  const localGraphRequest = remote.calls.findLast(call => call.method === 'graph')?.parameters[0] as Record<string, unknown>
  assert.deepEqual(localGraphRequest, { depth: 2, direction: 'both', expectedVault: firstVault, path: 'Folder/Note.md', scope: 'local' })
  assert.equal(controller.getSnapshot().graph?.path, 'Folder/Note.md')
  assert.equal(controller.getSnapshot().graphMode, 'local')
  assert.equal(await controller.openGraphNode('Second.md', 'local'), true)
  assert.equal(controller.getSnapshot().path, 'Second.md')
  assert.equal(controller.getSnapshot().graph?.path, 'Second.md')
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

test('clears stale relationship projections before refreshing the active note', async () => {
  const remote = new FakeRemote()
  const controller = new WorkbenchRouteController(remote, () => {})
  await controller.syncLocation('/tocktutor')
  assert.equal(await controller.select('Folder/Note.md'), true)
  await new Promise(resolve => setImmediate(resolve))
  assert.ok(controller.getSnapshot().links)

  const gate = deferred<void>()
  remote.linksGate = gate.promise
  const refresh = controller.loadRelationships()
  assert.equal(controller.getSnapshot().links, null)
  assert.equal(controller.getSnapshot().outline, null)
  gate.resolve()
  assert.equal(await refresh, true)
  controller.dispose()
})

test('refreshing document backlinks does not cancel an in-flight vault search', async () => {
  const remote = new FakeRemote()
  const controller = new WorkbenchRouteController(remote, () => {})
  await controller.syncLocation('/tocktutor')
  await controller.select('Folder/Note.md')
  await new Promise(resolve => setImmediate(resolve))
  const gate = deferred<void>()
  remote.searchOverride = async () => {
    await gate.promise
    return success({ cursor: null, generation: firstVault.generation, matches: [], query: 'lesson', scan: { bytes: 0, entries: 0, files: 0 }, truncated: false, truncationReason: null, warnings: [] })
  }
  controller.openSearch('lesson')
  const searching = controller.runSearch()
  assert.equal(await controller.loadRelationships(), true)
  gate.resolve()
  assert.equal(await searching, true)
  await controller.dispose()
})

test('document backlinks reload on enable and vault changes without accepting stale note results', async () => {
  const remote = new FakeRemote()
  const controller = new WorkbenchRouteController(remote, () => {}, () => new Date(10), new MemoryStorage())
  await controller.syncLocation('/tocktutor')
  await controller.select('Folder/Note.md')
  await new Promise(resolve => setImmediate(resolve))
  const before = remote.calls.filter(call => call.method === 'links').length
  assert.equal(controller.updateSettings({ backlinksInDocument: true }), true)
  assert.equal(controller.getSnapshot().linksLoading, true)
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(controller.getSnapshot().linksLoading, false)
  assert.equal(remote.calls.filter(call => call.method === 'links').length, before + 1)
  remote.emit({ action: 'updated', kind: 'entry', path: 'Second.md', vault: firstVault })
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(remote.calls.filter(call => call.method === 'links').length, before + 2)
  const gate = deferred<void>()
  remote.linksGate = gate.promise
  const pending = controller.loadRelationships()
  await controller.select('Second.md')
  gate.resolve()
  await pending
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(controller.getSnapshot().links?.path, 'Second.md')
  assert.equal(controller.getSnapshot().linksLoading, false)
  await controller.dispose()
})

test('uses optional bounded search intelligence without making local search depend on the assistant', async () => {
  const remote = new FakeRemote()
  remote.tocktutorAssistant = {
    searchIntelligence: async request => success({
      status: 'applied',
      matches: [{ kind: 'content', line: 1, path: 'Mobility.md', preview: `Related ${request.query}`, score: 4 }],
    }),
  }
  const controller = new WorkbenchRouteController(remote, () => {})
  await controller.syncLocation('/tocktutor')
  controller.openSearch('car')
  controller.setSearchMode('related')
  assert.equal(await controller.runSearch(), true)
  assert.equal(controller.getSnapshot().searchMatches?.some(match => match.path === 'Folder/Note.md'), true)
  assert.equal(controller.getSnapshot().searchMatches?.some(match => match.path === 'Mobility.md'), true)
  assert.equal(controller.getSnapshot().searchIntelligenceStatus, 'applied')
  controller.dispose()
})

test('ranks merged search matches before limiting Quick Answer candidates', async () => {
  const localMatches: VaultSearchMatch[] = [
    { id: 'local-shared', kind: 'content', line: 1, path: 'Shared.md', preview: 'Shared match', score: 20 },
    { id: 'local-tie-z', kind: 'content', line: 1, path: 'Tie-z.md', preview: 'Tie z', score: 7 },
    { id: 'local-tie-a', kind: 'content', line: 1, path: 'Tie-a.md', preview: 'Tie a', score: 7 },
    ...Array.from({ length: 18 }, (_, index) => ({
      id: `local-${String(index).padStart(2, '0')}`,
      kind: 'content' as const,
      line: index + 2,
      path: `Local-${String(index).padStart(2, '0')}.md`,
      preview: `Local ${String(index)}`,
      score: 1,
    })),
  ]
  const assistantMatches: VaultSearchMatch[] = [
    { id: 'assistant-expanded', kind: 'content', line: 1, path: 'Expanded.md', preview: 'Expanded evidence', score: 100 },
    { id: 'assistant-shared', kind: 'content', line: 1, path: 'Shared.md', preview: 'Shared match', score: 40 },
    { id: 'assistant-tie-z', kind: 'content', line: 1, path: 'Tie-z.md', preview: 'Tie z', score: 7 },
    { id: 'assistant-extra', kind: 'content', line: 1, path: 'Assistant.md', preview: 'Assistant evidence', score: 20 },
  ]
  const quickAnswerPaths: string[] = []
  const remote = new FakeRemote()
  remote.searchOverride = async () => success({
    cursor: null,
    generation: firstVault.generation,
    matches: localMatches,
    query: 'lesson',
    scan: { bytes: 30, entries: localMatches.length, files: localMatches.length },
    truncated: false,
    truncationReason: null,
    warnings: [],
  })
  remote.tocktutorAssistant = {
    searchIntelligence: async () => success({ status: 'applied', matches: assistantMatches }),
    quickAnswer: async request => {
      quickAnswerPaths.push(...request.candidates.map(candidate => candidate.path))
      return success({ status: 'no-evidence', answer: '', citations: [] })
    },
  }
  const controller = new WorkbenchRouteController(remote, () => {})
  await controller.syncLocation('/tocktutor')
  controller.openSearch('lesson')
  controller.setSearchMode('related')
  assert.equal(await controller.runSearch(), true)

  const matches = controller.getSnapshot().searchMatches ?? []
  assert.equal(matches.length, 23)
  assert.deepEqual(matches.slice(0, 5).map(match => [match.path, match.score]), [
    ['Expanded.md', 100],
    ['Shared.md', 40],
    ['Assistant.md', 20],
    ['Tie-a.md', 7],
    ['Tie-z.md', 7],
  ])
  assert.deepEqual(matches.map(match => match.score ?? 0), [...matches].map(match => match.score ?? 0).toSorted((left, right) => right - left))
  assert.equal(matches.find(match => match.path === 'Shared.md')?.id, 'assistant-shared')
  assert.equal(matches.find(match => match.path === 'Tie-z.md')?.id, 'local-tie-z')
  assert.equal(Object.isFrozen(matches), true)
  assert.equal(matches.every(match => Object.isFrozen(match)), true)
  assert.equal(matches.length > 20, true)

  assert.equal(await controller.runQuickAnswer(), false)
  assert.equal(quickAnswerPaths.length, 20)
  assert.deepEqual(quickAnswerPaths, matches.slice(0, 20).map(match => match.path))
  assert.equal(quickAnswerPaths.includes('Expanded.md'), true)
  controller.dispose()
})

test('cancels Quick Answer on query changes and drops late citations', async () => {
  const remote = new FakeRemote()
  const answer = deferred<{ ok: true; value: { status: 'completed'; answer: string; citations: [] } }>()
  remote.tocktutorAssistant = {
    quickAnswer: async () => answer.promise,
  }
  const controller = new WorkbenchRouteController(remote, () => {})
  await controller.syncLocation('/tocktutor')
  controller.openSearch('lesson')
  assert.equal(await controller.runSearch(), true)
  const pending = controller.runQuickAnswer()
  assert.equal(controller.getSnapshot().searchAnswer?.status, 'thinking')
  controller.setSearchQuery('new query')
  answer.resolve({ ok: true, value: { status: 'completed', answer: 'stale', citations: [] } })
  assert.equal(await pending, false)
  assert.equal(controller.getSnapshot().searchAnswer?.status, 'idle')
  assert.equal(controller.getSnapshot().searchAnswer?.answer, '')
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

test('binds local search filters to every request and cursor page', async () => {
  const remote = new FakeRemote()
  const controller = new WorkbenchRouteController(remote, () => {})
  await controller.syncLocation('/tocktutor')
  controller.openSearch('lesson')
  controller.setSearchFilters({ directory: 'Folder', modifiedFrom: 10, modifiedTo: 20, titleOnly: true })
  assert.equal(await controller.runSearch(), true)
  assert.deepEqual(remote.calls.findLast(call => call.method === 'search')?.parameters[0], {
    directory: 'Folder',
    expectedVault: firstVault,
    limit: 100,
    mode: 'query',
    modifiedFrom: 10,
    modifiedTo: 20,
    query: 'lesson',
    titleOnly: true,
  })
  controller.dispose()
})

test('navigates active search matches and rejects a stale local preview', async () => {
  const remote = new FakeRemote()
  const preview = deferred<{ ok: true; value: OpenDocumentResult }>()
  const controller = new WorkbenchRouteController(remote, () => {})
  remote.searchContinuation = {
    cursor: null,
    generation: firstVault.generation,
    matches: [{ id: 'second-hit', kind: 'content', line: 8, path: 'Second.md', preview: 'Second lesson match' }],
    query: 'lesson',
    scan: { bytes: 60, entries: 4, files: 3 },
    truncated: false,
    truncationReason: null,
    warnings: [],
  }
  await controller.syncLocation('/tocktutor')
  controller.openSearch('lesson')
  assert.equal(await controller.runSearch(), true)
  assert.equal(await controller.loadMoreSearch(), true)
  assert.equal(controller.getSnapshot().searchActiveIndex, 0)
  controller.moveSearchActive(1)
  assert.equal(controller.getSnapshot().searchActiveIndex, 1)
  const match = controller.getSnapshot().searchMatches?.[0]
  assert.ok(match)
  assert.equal(await controller.openSearchMatch(match), true)
  assert.equal(controller.getSnapshot().path, match.path)
  assert.equal(controller.getSnapshot().selectionStart, 9)
  const secondMatch = controller.getSnapshot().searchMatches?.[1]
  assert.ok(secondMatch)
  assert.equal(await controller.openSearchMatch(secondMatch, true), true)
  assert.equal(controller.getSnapshot().path, secondMatch.path)
  assert.equal(controller.getSnapshot().panes[0]?.tabs.length, 2)
  assert.equal(await controller.openSearchMatch(match), true)
  remote.openOverride = path => path === 'Folder/Note.md' ? preview.promise : success({
    content: '# Second\\n',
    digest: `sha256:${'d'.repeat(64)}`,
    generation: firstVault.generation,
    path,
    revision: secondRevision,
  })
  const pending = controller.previewSearchMatch(match)
  await new Promise(resolve => setImmediate(resolve))
  controller.setSearchQuery('new query')
  preview.resolve({
    ok: true,
    value: {
      content: '# Stale Preview\\n',
      digest: `sha256:${'e'.repeat(64)}`,
      generation: firstVault.generation,
      path: match.path,
      revision: firstRevision,
    },
  })
  assert.equal(await pending, false)
  assert.equal(controller.getSnapshot().searchPreview, null)
  controller.dispose()
})

test('reports a current preview revision mismatch and clears preview loading', async () => {
  const remote = new FakeRemote()
  remote.searchRevision = firstRevision
  remote.openOverride = async path => success({
    content: '# Changed\n',
    digest: `sha256:${'e'.repeat(64)}`,
    generation: firstVault.generation,
    path,
    revision: secondRevision,
  })
  const controller = new WorkbenchRouteController(remote, () => {})
  await controller.syncLocation('/tocktutor')
  controller.openSearch('lesson')
  assert.equal(await controller.runSearch(), true)
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(controller.getSnapshot().searchPreview, null)
  assert.equal(controller.getSnapshot().searchPreviewLoading, false)
  assert.equal(controller.getSnapshot().searchPreviewError, 'Preview is no longer current.')
  controller.dispose()
})

test('drops stale Load More results before publishing invalid-result errors', async () => {
  const remote = new FakeRemote()
  remote.searchContinuation = {
    cursor: null,
    generation: firstVault.generation,
    matches: [{ id: 'second-hit', kind: 'content', line: 8, path: 'Second.md', preview: 'Second lesson match' }],
    query: 'lesson',
    scan: { bytes: 60, entries: 4, files: 3 },
    truncated: false,
    truncationReason: null,
    warnings: [],
  }
  const pending = deferred<{ ok: true; value: VaultSearchResult }>()
  remote.searchOverride = (request) => {
    const searchRequest = request as { cursor?: string; query: string }
    return searchRequest.cursor === undefined
      ? success({
          cursor: 'search-next',
          generation: firstVault.generation,
          matches: [{ kind: 'content', line: 2, path: 'Folder/Note.md', preview: 'First lesson match' }],
          query: searchRequest.query,
          scan: { bytes: 30, entries: 4, files: 2 },
          truncated: true,
          truncationReason: 'result-limit',
          warnings: [],
        })
      : pending.promise
  }
  const controller = new WorkbenchRouteController(remote, () => {})
  await controller.syncLocation('/tocktutor')
  controller.openSearch('lesson')
  assert.equal(await controller.runSearch(), true)
  const loading = controller.loadMoreSearch()
  await new Promise(resolve => setImmediate(resolve))
  controller.setSearchFilters({ directory: 'Folder' })
  pending.resolve({
    ok: true,
    value: {
      cursor: null,
      generation: firstVault.generation,
      matches: [],
      query: 'lesson',
      scan: { bytes: 0, entries: 0, files: 0 },
      truncated: false,
      truncationReason: null,
      warnings: [],
    },
  })
  assert.equal(await loading, false)
  assert.equal(controller.getSnapshot().searchError, null)
  assert.equal(controller.getSnapshot().searchLoading, true)
  controller.dispose()
})

test('loads one cursor page, merges stable matches, and keeps the cursor bound to the query', async () => {
  const remote = new FakeRemote()
  remote.searchContinuation = {
    cursor: null,
    generation: firstVault.generation,
    matches: [{ id: 'second-hit', kind: 'content', line: 8, path: 'Folder/Note.md', preview: 'Second lesson match' }],
    query: 'lesson',
    scan: { bytes: 60, entries: 4, files: 3 },
    truncated: false,
    truncationReason: null,
    warnings: [],
  }
  const controller = new WorkbenchRouteController(remote, () => {})
  await controller.syncLocation('/tocktutor')
  controller.openSearch('lesson')
  assert.equal(await controller.runSearch(), true)
  assert.equal(controller.getSnapshot().searchCursor, 'search-next')
  assert.equal(await controller.loadMoreSearch(), true)
  assert.deepEqual(controller.getSnapshot().searchMatches?.map(match => match.line), [2, 8])
  assert.equal(controller.getSnapshot().searchCursor, null)
  assert.deepEqual(remote.calls.findLast(call => call.method === 'search')?.parameters[0], {
    cursor: 'search-next',
    expectedVault: firstVault,
    limit: 100,
    mode: 'query',
    query: 'lesson',
  })
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
  assert.equal(await second.select('Second.md'), true)
  assert.equal(second.getSnapshot().mode, 'source')
  second.toggleFocusMode()
  assert.equal(await second.loadWorkspace('class-layout'), true)
  assert.equal(second.getSnapshot().focusMode, true)
  second.dispose()
})

test('restores persisted tabs and workspaces from every resumable tree page', async () => {
  const storage = new MemoryStorage()
  const first = new WorkbenchRouteController(new FakeRemote(), () => {}, () => new Date(30), storage)
  await first.syncLocation('/tocktutor')
  assert.equal(await first.select('Late.markdown'), true)
  assert.equal(first.saveCurrentWorkspace('Late Layout'), true)
  first.dispose()

  const remote = new FakeRemote()
  const full = tree(firstVault)
  const late = {
    createdAt: 1,
    kind: 'document' as const,
    modifiedAt: 3,
    path: 'Late.markdown',
    revision: firstRevision,
    size: 12,
  }
  remote.treePageOverride = async request => {
    if (request.cursor === null || request.cursor === undefined) {
      return success({
        ...full,
        complete: false,
        cursor: 'tree-next',
        entries: full.entries,
        scan: { entries: full.scan.entries + 1 },
        truncated: true,
        truncationReason: 'result-limit',
      })
    }
    assert.equal(request.cursor, 'tree-next')
    return success({
      ...full,
      complete: true,
      cursor: null,
      entries: [late],
      scan: { entries: full.scan.entries + 1 },
      truncated: false,
      truncationReason: null,
    })
  }
  const second = new WorkbenchRouteController(remote, () => {}, () => new Date(31), storage)
  await second.syncLocation('/tocktutor')
  assert.equal(second.getSnapshot().path, 'Late.markdown')
  assert.equal(second.getSnapshot().entries.some(entry => entry.path === 'Late.markdown'), true)
  assert.equal(remote.calls.filter(call => call.method === 'listTree').length, 2)
  assert.equal(await second.select('Second.md'), true)
  assert.equal(await second.loadWorkspace('late-layout'), true)
  assert.equal(second.getSnapshot().path, 'Late.markdown')
  second.dispose()
})

for (const reason of ['depth-limit', 'entry-limit'] as const) {
  test(`consumes valid ${reason} cursors without discarding unseen stored tabs`, async () => {
    const storage = new MemoryStorage()
    const seed = new WorkbenchRouteController(new FakeRemote(), () => {}, () => new Date(30), storage)
    await seed.syncLocation('/tocktutor/Late.markdown')
    seed.togglePinTab('pane-1', 'Late.markdown')
    await seed.select('Folder/Note.md')
    seed.saveCurrentWorkspace('Bounded Layout')
    await seed.dispose()
    const remote = new FakeRemote()
    remote.treePageOverride = async request => success({
      ...tree(firstVault), complete: false, truncated: true, truncationReason: reason,
      cursor: request.cursor ? null : 'limited-page',
      entries: request.cursor ? [{ ...tree(firstVault).entries[2]!, path: 'Discovered.markdown' }] : tree(firstVault).entries,
    })
    const controller = new WorkbenchRouteController(remote, () => {}, () => new Date(31), storage)
    try {
      await controller.syncLocation('/tocktutor')
      assert.equal(controller.getSnapshot().phase, 'ready')
      assert.equal(controller.getSnapshot().entries.some(entry => entry.path === 'Discovered.markdown'), true)
      assert.equal(controller.getSnapshot().panes[0]?.tabs.some(tab => tab.path === 'Late.markdown'), true)
      assert.equal(await controller.loadWorkspace('bounded-layout'), true)
      assert.equal(controller.getSnapshot().panes[0]?.tabs.some(tab => tab.path === 'Late.markdown'), true)
      assert.match(storage.values.get(`tocktutor.workbench.v1.${firstVault.id}`)!, /Late\.markdown/u)
    } finally { await controller.dispose() }
  })
}

test('keeps unseen tabs and named workspaces at the bounded tree page cap', async () => {
  const storage = new MemoryStorage()
  const seed = new WorkbenchRouteController(new FakeRemote(), () => {}, () => new Date(30), storage)
  await seed.syncLocation('/tocktutor/Late.markdown')
  seed.togglePinTab('pane-1', 'Late.markdown')
  await seed.select('Folder/Note.md')
  seed.saveCurrentWorkspace('Capped Layout')
  await seed.dispose()
  const remote = new FakeRemote()
  let pages = 0
  remote.treePageOverride = async () => {
    pages += 1
    return success({ ...tree(firstVault), complete: false, cursor: `page-${pages}`, truncated: true, truncationReason: 'result-limit',
      entries: Array.from({ length: 200 }, (_, index) => ({ ...tree(firstVault).entries[1]!, path: pages === 1 && index === 0 ? 'Folder/Note.md' : `Page${pages}-${index}.md` })),
    })
  }
  const controller = new WorkbenchRouteController(remote, () => {}, () => new Date(31), storage)
  try {
    await controller.syncLocation('/tocktutor')
    assert.equal(pages, 100)
    assert.equal(controller.getSnapshot().path, 'Folder/Note.md')
    assert.equal(controller.getSnapshot().panes[0]?.tabs.some(tab => tab.path === 'Late.markdown'), true)
    assert.equal(await controller.loadWorkspace('capped-layout'), true)
    assert.equal(controller.getSnapshot().panes[0]?.tabs.some(tab => tab.path === 'Late.markdown'), true)
    const saved = JSON.parse(storage.values.get(`tocktutor.workbench.v1.${firstVault.id}`)!)
    assert.equal(saved.session.groups[0].tabs.some((tab: { path: string }) => tab.path === 'Late.markdown'), true)
  } finally { await controller.dispose() }
})

test('keeps persisted tabs and workspaces intact after malformed or repeated tree cursors', async () => {
  const storage = new MemoryStorage()
  const seed = new WorkbenchRouteController(new FakeRemote(), () => {}, () => new Date(40), storage)
  await seed.syncLocation('/tocktutor')
  assert.equal(await seed.select('Folder/Note.md'), true)
  assert.equal(seed.saveCurrentWorkspace('Persisted Layout'), true)
  seed.dispose()
  const key = `tocktutor.workbench.v1.${firstVault.id}`
  const persisted = storage.values.get(key)
  assert.ok(persisted)

  for (const kind of ['malformed', 'repeated'] as const) {
    const remote = new FakeRemote()
    remote.treePageOverride = async () => kind === 'malformed'
      ? success({ ...tree(firstVault), entries: [{ ...tree(firstVault).entries[0]!, path: '../escape' }] } as VaultTreePage)
      : success({ ...tree(firstVault), complete: false, cursor: 'same-cursor', truncated: true, truncationReason: 'result-limit' })
    const controller = new WorkbenchRouteController(remote, () => {}, () => new Date(41), storage)
    await controller.syncLocation('/tocktutor')
    assert.equal(controller.getSnapshot().phase, 'error')
    assert.equal(storage.values.get(key), persisted)
    remote.treePageOverride = null
    await controller.reload()
    assert.equal(controller.getSnapshot().path, 'Folder/Note.md')
    assert.equal(await controller.loadWorkspace('persisted-layout'), true)
    assert.equal(controller.getSnapshot().path, 'Folder/Note.md')
    controller.dispose()
  }
})

test('preserves persistence when a later tree page rejects or becomes stale', async () => {
  const storage = new MemoryStorage()
  const seed = new WorkbenchRouteController(new FakeRemote(), () => {}, () => new Date(40), storage)
  await seed.syncLocation('/tocktutor/Folder/Note.md')
  seed.saveCurrentWorkspace('Safe Layout')
  await seed.dispose()
  const key = `tocktutor.workbench.v1.${firstVault.id}`
  const persisted = storage.values.get(key)
  for (const scenario of ['reject', 'stale'] as const) {
    const remote = new FakeRemote()
    const requested = deferred<void>()
    const release = deferred<void>()
    remote.treePageOverride = async request => {
      if (request.expectedVault.id === secondVault.id) return success(tree(secondVault))
      if (!request.cursor) return success({ ...tree(firstVault), complete: false, cursor: 'next', truncated: true, truncationReason: 'result-limit' })
      requested.resolve()
      await release.promise
      if (scenario === 'reject') throw new Error('Second page unavailable')
      return success(tree(firstVault))
    }
    const controller = new WorkbenchRouteController(remote, () => {}, () => new Date(41), storage)
    const pending = controller.syncLocation('/tocktutor')
    try {
      await requested.promise
      if (scenario === 'stale') {
        remote.vault = secondVault
        await controller.reload()
      }
      release.resolve()
      await pending
      assert.equal(storage.values.get(key), persisted)
      if (scenario === 'reject') assert.equal(controller.getSnapshot().phase, 'error')
      else assert.deepEqual(controller.getSnapshot().vault, secondVault)
    } finally {
      release.resolve()
      await controller.dispose()
    }
  }
})

test('resolves note, media, Canvas, and Base embeds under source identity', async () => {
  const remote = new FakeRemote()
  const controller = new WorkbenchRouteController(remote, () => {})
  await controller.syncLocation('/tocktutor')
  assert.equal(await controller.select('Folder/Note.md'), true)
  controller.edit('![[Second.md]]\n![[../Attachments/existing.png|16x16]]\n![[Board.canvas]]\n![[Tasks.base]]\n')
  assert.equal(await controller.loadEmbeds(), true)
  assert.deepEqual(controller.getSnapshot().embeds?.map(embed => embed.target.kind), ['note', 'media', 'canvas', 'base'])
  assert.deepEqual(controller.getSnapshot().embeds?.find(embed => embed.target.kind === 'media')?.target, {
    display: '16x16',
    fragment: null,
    kind: 'media',
    path: 'Attachments/existing.png',
    source: '![[../Attachments/existing.png|16x16]]',
  })
  assert.equal(controller.getSnapshot().embeds?.find(embed => embed.target.kind === 'media')?.content, 'AQID')
  controller.dispose()
})

test('does not publish an embed result after its source target is removed', async () => {
  const remote = new FakeRemote()
  let release!: () => void
  const blocked = new Promise<void>(resolve => { release = resolve })
  remote.openOverride = async path => {
    if (path === 'Second.md') await blocked
    return success({
      content: '# Second\n',
      digest: `sha256:${'c'.repeat(64)}`,
      generation: firstVault.generation,
      path,
      revision: firstRevision,
    })
  }
  const controller = new WorkbenchRouteController(remote, () => {})
  await controller.syncLocation('/tocktutor')
  assert.equal(await controller.select('Folder/Note.md'), true)
  controller.edit('![[Second.md]]\n')
  const pending = controller.loadEmbeds()
  await new Promise(resolve => setImmediate(resolve))
  controller.edit('# Removed\n')
  release()
  await pending
  await new Promise(resolve => setImmediate(resolve))
  assert.deepEqual(controller.getSnapshot().embeds, [])
  controller.dispose()
})

test('stores, embeds, and previews bounded attachments under note identity', async () => {
  const remote = new FakeRemote()
  const controller = new WorkbenchRouteController(remote, () => {})
  await controller.syncLocation('/tocktutor')
  assert.equal(await controller.select('Folder/Note.md'), true)
  assert.equal(await controller.storeActiveAttachment('image.png', 'AQID'), true)
  const store = remote.calls.find(call => call.method === 'storeAttachment')?.parameters[0] as { path: string }
  assert.equal(store.path, 'Attachments/image.png')
  assert.match(controller.getSnapshot().source, /!\[\[Attachments\/image\.png\]\]/u)
  assert.equal(await controller.previewAttachment('Attachments/existing.png'), true)
  assert.equal(controller.getSnapshot().attachmentPreview?.dataBase64, 'AQID')
  controller.closeAttachmentPreview()
  assert.equal(controller.getSnapshot().attachmentPreview, null)
  controller.dispose()
})

test('binds picker, paste, and drop file reads to the initiating note source', async () => {
  const remote = new FakeRemote()
  const controller = new WorkbenchRouteController(remote, () => {})
  await controller.syncLocation('/tocktutor')
  assert.equal(await controller.select('Folder/Note.md'), true)
  assert.equal(await controller.attachFiles([{
    async arrayBuffer() { return Uint8Array.from([1, 2, 3]).buffer },
    name: 'Recording.weba',
    size: 3,
  } as File]), true)
  assert.match(controller.getSnapshot().source, /!\[\[Attachments\/Recording\.weba\]\]/u)

  let release!: (value: ArrayBuffer) => void
  const delayed = controller.attachFiles([{
    arrayBuffer: async () => await new Promise<ArrayBuffer>(resolve => { release = resolve }),
    name: 'late.wav',
    size: 3,
  } as File])
  controller.edit(`${controller.getSnapshot().source}Newer input\n`)
  release(Uint8Array.from([4, 5, 6]).buffer)
  assert.equal(await delayed, false)
  assert.equal(remote.calls.filter(call => call.method === 'storeAttachment').length, 1)
  controller.dispose()
})

test('extracts the active selection and converts active-note formats through reviewed boundaries', async () => {
  const remote = new FakeRemote()
  const controller = new WorkbenchRouteController(remote, () => {})
  await controller.syncLocation('/tocktutor')
  assert.equal(await controller.select('Folder/Note.md'), true)
  controller.setMode('source')
  controller.setSelection(2, 8)
  assert.equal(await controller.extractActiveSelection(), true)
  assert.match(controller.getSnapshot().source, /\[\[Extracted\/Note Extract\.md\|Before\]\]/u)
  const create = remote.calls.findLast(call => call.method === 'createDocument')?.parameters[0] as CreateDocumentRequest
  assert.equal(create.path, 'Extracted/Note Extract.md')
  assert.equal(create.content, 'Before\n')
  controller.edit('- TODO Review\n^^mark^^\n')
  assert.equal(controller.convertActiveNote(), true)
  assert.equal(controller.getSnapshot().source, '- [ ] Review\n==mark==\n')
  controller.dispose()
})

for (const change of ['navigate', 'edit'] as const) {
  test(`delayed extraction cannot overwrite a changed source (${change})`, async () => {
    const remote = new FakeRemote()
    const controller = new WorkbenchRouteController(remote, () => {})
    await controller.syncLocation('/tocktutor/Folder/Note.md')
    controller.setMode('source')
    controller.setSelection(2, 8)
    const gate = deferred<void>()
    const create = remote.tocktutorWorkbench.createDocument
    ;(remote as WorkbenchRouteRemote).tocktutorWorkbench.createDocument = async (...args) => { await gate.promise; return create(...args) }
    const pending = controller.extractActiveSelection()
    if (change === 'navigate') await controller.select('Second.md')
    else controller.edit('Newer source')
    const source = controller.getSnapshot().source
    gate.resolve()
    assert.equal(await pending, false)
    assert.equal(controller.getSnapshot().source, source)
    controller.dispose()
  })
}

test('Live Preview uses authored Markdown offsets for commands while Reading remains non-editable', async () => {
  const remote = new FakeRemote()
  const controller = new WorkbenchRouteController(remote, () => {}, () => new Date(2026, 7, 26, 10, 0))
  await controller.syncLocation('/tocktutor/Second.md')
  controller.setMode('live-preview')
  const source = controller.getSnapshot().source
  controller.setSourceEditorSelection(1, 6)
  controller.runEditorCommand('bold')
  assert.equal(controller.getSnapshot().source, source.slice(0, 1) + '**' + source.slice(1, 6) + '**' + source.slice(6))
  controller.edit(source)
  controller.setSourceEditorSelection(1, 6)
  assert.equal(await controller.extractActiveSelection(), true)
  assert.equal(controller.insertCurrentDateTime('date'), true)
  controller.setMode('reading')
  const readingSource = controller.getSnapshot().source
  controller.setSourceEditorSelection(1, 6)
  assert.equal(await controller.extractActiveSelection(), false)
  assert.equal(controller.insertCurrentDateTime('date'), false)
  controller.runEditorCommand('bold')
  assert.equal(controller.getSnapshot().source, readingSource)
  controller.dispose()
})

test('requires explicit review before creating an organized Inbox note', async () => {
  const remote = new FakeRemote()
  const controller = new WorkbenchRouteController(remote, () => {}, () => new Date(2026, 7, 26, 10, 0))
  await controller.syncLocation('/tocktutor')
  const pending = controller.handleDispatch({ action: 'capture', kind: 'quick-action', operationId: 'capture-review' })
  await controller.submitDispatchDialog({ text: 'Quadratic notes.', title: 'Algebra' })
  assert.equal(await pending, 'handled')
  assert.match(controller.getSnapshot().path ?? '', /^Inbox\//u)
  assert.equal(await controller.prepareOrganization(), true)
  const proposal = controller.getSnapshot().organizationProposal
  assert.match(proposal?.destination ?? '', /^Organized\//u)
  const createsBeforeApproval = remote.calls.filter(call => call.method === 'createDocument').length
  assert.equal(await controller.applyOrganization(), true)
  assert.equal(remote.calls.filter(call => call.method === 'createDocument').length, createsBeforeApproval + 1)
  assert.equal(controller.getSnapshot().organizationProposal, null)
  controller.dispose()
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
  remote.vaultDisplayPath = '~/Documents/Second Vault'
  remote.vaultName = 'Second Vault'
  remote.emit({ action: 'activated', kind: 'vault', vault: secondVault })
  await new Promise(resolve => setTimeout(resolve, 0))
  assert.deepEqual(controller.getSnapshot().vault, secondVault)
  assert.equal(controller.getSnapshot().vaultDisplayPath, '~/Documents/Second Vault')
  assert.equal(controller.getSnapshot().path, null)

  remote.vault = null
  remote.emit({ action: 'deactivated', kind: 'vault', vault: secondVault })
  await new Promise(resolve => setTimeout(resolve, 0))
  assert.equal(controller.getSnapshot().vault, null)

  remote.vault = firstVault
  remote.vaultDisplayPath = '~/Documents/Research Vault'
  remote.vaultName = 'Research Vault'
  remote.emit({ action: 'activated', kind: 'vault', vault: firstVault })
  await new Promise(resolve => setTimeout(resolve, 0))
  assert.deepEqual(controller.getSnapshot().vault, firstVault)
  remote.emit({ action: 'deactivated', kind: 'vault', vault: secondVault })
  await new Promise(resolve => setTimeout(resolve, 0))
  assert.deepEqual(controller.getSnapshot().vault, firstVault)
  controller.dispose()
})

test('sidebar search preserves results through navigation and does not cancel opening a note', async () => {
  const remote = new FakeRemote()
  const controller = new WorkbenchRouteController(remote, () => {})
  try {
    await controller.syncLocation('/tocktutor')
    controller.openSidebarSearch()
    controller.setSearchQuery('lesson')
    assert.equal(await controller.runSearch(), true)
    const matches = controller.getSnapshot().searchMatches
    assert.ok(matches?.[0])
    assert.equal(await controller.openSearchMatch(matches[0]), true)
    controller.openSidebarSearch()
    assert.equal(controller.getSnapshot().searchQuery, 'lesson')
    assert.equal(controller.getSnapshot().searchMatches, matches)
    assert.equal(controller.getSnapshot().searchPresentation, 'sidebar')

    const opening = deferred<{ ok: true; value: OpenDocumentResult }>()
    remote.openOverride = () => opening.promise
    const selected = controller.select('Second.md')
    controller.setSearchQuery('another')
    opening.resolve({ ok: true, value: {
      content: '# Second\n', digest: `sha256:${'d'.repeat(64)}`,
      generation: firstVault.generation, path: 'Second.md', revision: secondRevision,
    } })
    assert.equal(await selected, true)
    assert.equal(controller.getSnapshot().path, 'Second.md')
    controller.closeSearch()
  } finally { await controller.dispose() }
})

for (const action of ['query', 'close', 'reload', 'dialog'] as const) {
  test(`ignores late sidebar search results after ${action}`, async () => {
    const remote = new FakeRemote()
    const controller = new WorkbenchRouteController(remote, () => {})
    const pending = deferred<{ ok: true; value: VaultSearchResult }>()
    try {
      await controller.syncLocation('/tocktutor')
      remote.searchOverride = () => pending.promise
      controller.openSidebarSearch()
      controller.setSearchQuery('lesson')
      const searching = controller.runSearch()
      if (action === 'query') controller.setSearchQuery('new')
      else if (action === 'close') controller.closeSearch()
      else if (action === 'reload') await controller.reload()
      else controller.openSearch('new')
      pending.resolve({ ok: true, value: {
        cursor: null, generation: firstVault.generation, query: 'lesson',
        matches: [{ kind: 'content', line: 2, path: 'Folder/Note.md', preview: 'Old lesson' }],
        scan: { bytes: 30, entries: 4, files: 2 }, truncated: false, truncationReason: null, warnings: [],
      } })
      assert.equal(await searching, false)
      assert.equal(controller.getSnapshot().searchMatches?.some(match => match.preview === 'Old lesson'), false)
    } finally { await controller.dispose() }
  })
}

test('real splits share drafts, accept rapid owner edits and reject stale peer callbacks without saving on focus', async () => {
  const remote = new FakeRemote()
  const controller = new WorkbenchRouteController(remote, () => {})
  await controller.syncLocation('/tocktutor/Folder/Note.md')
  const left = controller.getSnapshot().focusedPaneId
  await controller.splitPane(left, 'horizontal')
  const right = controller.getSnapshot().focusedPaneId
  const leftEdit = controller.bindPaneEdit(left)
  const rightEdit = controller.bindPaneEdit(right)
  assert.equal(leftEdit('first'), true)
  assert.equal(leftEdit('second'), true)
  assert.equal(controller.getPaneSnapshot(right).source, 'second')
  assert.equal(rightEdit('stale'), false)
  assert.equal(controller.getPaneSnapshot(left).source, 'second')
  await controller.focusPane(left)
  assert.equal(remote.calls.filter(call => call.method === 'saveDocument').length, 0)
  await controller.select('Second.md')
  const editOther = controller.bindPaneEdit(left)
  const editNote = controller.bindPaneEdit(right)
  assert.equal(editOther('other draft'), true)
  assert.equal(editNote('note draft'), true)
  assert.equal(controller.getPaneSnapshot(left).source, 'other draft')
  assert.equal(controller.getPaneSnapshot(right).source, 'note draft')
  await controller.dispose()
  const drafts = remote.calls.filter(call => call.method === 'saveDraft').map(call => call.parameters[0] as { path: string; content: string })
  assert.ok(drafts.some(draft => draft.path === 'Second.md' && draft.content === 'other draft'))
  assert.ok(drafts.some(draft => draft.path === 'Folder/Note.md' && draft.content === 'note draft'))
})

test('a delayed save belongs to its document, not the focused pane, and cannot clean newer edits', async () => {
  const remote = new FakeRemote()
  const controller = new WorkbenchRouteController(remote, () => {})
  await controller.syncLocation('/tocktutor/Folder/Note.md')
  const left = controller.getSnapshot().focusedPaneId
  await controller.splitPane(left, 'horizontal')
  const right = controller.getSnapshot().focusedPaneId
  await controller.select('Second.md')
  controller.edit('second dirty')
  const pending = deferred<{ ok: true; value: WriteDocumentResult }>()
  remote.saveOverride = () => pending.promise
  const save = controller.save()
  await controller.focusPane(left)
  controller.bindPaneEdit(right)('newer second')
  controller.edit('first dirty')
  pending.resolve({ ok: true, value: { digest: `sha256:${'e'.repeat(64)}`, generation: firstVault.generation, path: 'Second.md', revision: secondRevision, snapshotId: 'saved', status: 'saved' } })
  assert.equal(await save, false)
  assert.equal(controller.getPaneSnapshot(right).source, 'newer second')
  assert.equal(controller.getPaneSnapshot(right).revision, secondRevision)
  assert.equal(controller.getPaneSnapshot(right).saveStatus, 'unsaved')
  assert.equal(controller.getPaneSnapshot(left).source, 'first dirty')
  await controller.dispose()
})

test('closing the last view of an inactive dirty document blocks on conflict and vault transition saves all documents', async () => {
  const remote = new FakeRemote()
  const controller = new WorkbenchRouteController(remote, () => {})
  await controller.syncLocation('/tocktutor/Folder/Note.md')
  const left = controller.getSnapshot().focusedPaneId
  await controller.splitPane(left, 'vertical')
  const right = controller.getSnapshot().focusedPaneId
  await controller.select('Second.md')
  controller.edit('keep me')
  await controller.focusPane(left)
  remote.saveFailure = { code: 'conflict', message: 'changed' }
  assert.equal(await controller.closePane(right), false)
  assert.equal(controller.getPaneSnapshot(right).source, 'keep me')
  assert.equal(await controller.createManagedVault('Blocked'), false)
  assert.equal(remote.calls.some(call => call.method === 'createManagedVault'), false)
  assert.equal(await controller.closePane(left), true)
  assert.equal(controller.getSnapshot().panes.length, 1)
  assert.equal(controller.getSnapshot().source, 'keep me')
  await controller.dispose()
})

test('inactive external changes refresh clean panes, preserve dirty panes, and old callbacks cannot cross tab lifetimes', async () => {
  const remote = new FakeRemote()
  const controller = new WorkbenchRouteController(remote, () => {})
  await controller.syncLocation('/tocktutor/Folder/Note.md')
  const left = controller.getSnapshot().focusedPaneId
  const stale = controller.bindPaneEdit(left)
  await controller.splitPane(left, 'horizontal')
  const right = controller.getSnapshot().focusedPaneId
  await controller.select('Second.md')
  remote.openOverride = path => success({ content: 'disk changed', digest: `sha256:${'e'.repeat(64)}`, generation: firstVault.generation, path, revision: secondRevision })
  remote.emit({ action: 'external-change', kind: 'entry', path: 'Folder/Note.md', vault: firstVault })
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(controller.getPaneSnapshot(left).source, 'disk changed')
  controller.bindPaneEdit(left)('local change')
  remote.emit({ action: 'external-change', kind: 'entry', path: 'Folder/Note.md', vault: firstVault })
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(controller.getPaneSnapshot(left).source, 'local change')
  assert.equal(controller.getPaneSnapshot(right).path, 'Second.md')
  await controller.focusPane(left)
  await controller.select('Second.md')
  await controller.select('Folder/Note.md')
  assert.equal(stale('late old text'), false)
  await controller.dispose()
})

test('publishes a saved revision before recovery cleanup awaits, retaining edits made during cleanup', async () => {
  const remote = new FakeRemote()
  const controller = new WorkbenchRouteController(remote, () => {})
  await controller.syncLocation('/tocktutor/Folder/Note.md')
  controller.edit('saving')
  const clear = deferred<void>()
  const original = remote.tocktutorWorkbench.clearDraft
  remote.tocktutorWorkbench.clearDraft = async (...args) => { await clear.promise; return original(...args) }
  const save = controller.save()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(controller.getSnapshot().revision, secondRevision)
  controller.edit('newer during clear')
  clear.resolve()
  assert.equal(await save, false)
  assert.equal(controller.getSnapshot().revision, secondRevision)
  assert.equal(controller.getSnapshot().source, 'newer during clear')
  assert.equal(controller.getSnapshot().saveStatus, 'unsaved')
  await controller.save()
  const request = remote.calls.filter(call => call.method === 'saveDocument').at(-1)?.parameters[0] as { expectedRevision: string }
  assert.equal(request.expectedRevision, secondRevision)
  await controller.dispose()
})

test('a close that waits for a save cannot clear the newly focused document', async () => {
  const remote = new FakeRemote()
  const controller = new WorkbenchRouteController(remote, () => {})
  await controller.syncLocation('/tocktutor/Folder/Note.md')
  const left = controller.getSnapshot().focusedPaneId
  await controller.splitPane(left, 'horizontal')
  const right = controller.getSnapshot().focusedPaneId
  await controller.select('Second.md')
  controller.edit('second dirty')
  const pending = deferred<{ ok: true; value: WriteDocumentResult }>()
  remote.saveOverride = () => pending.promise
  const close = controller.closeTab(right, 'Second.md')
  await controller.focusPane(left)
  pending.resolve({ ok: true, value: { digest: `sha256:${'e'.repeat(64)}`, generation: firstVault.generation, path: 'Second.md', revision: secondRevision, snapshotId: 'saved', status: 'saved' } })
  assert.equal(await close, true)
  assert.equal(controller.getSnapshot().focusedPaneId, left)
  assert.equal(controller.getSnapshot().path, 'Folder/Note.md')
  assert.notEqual(controller.getSnapshot().source, '')
  await controller.dispose()
})

test('location selection reuses the other pane authoritative dirty draft without disk refresh', async () => {
  const remote = new FakeRemote()
  const controller = new WorkbenchRouteController(remote, () => {})
  await controller.syncLocation('/tocktutor/Folder/Note.md')
  const left = controller.getSnapshot().focusedPaneId
  await controller.splitPane(left, 'horizontal')
  await controller.select('Second.md')
  controller.bindPaneEdit(left)('unsaved peer\r\n\r\n[[Keep]]')
  const reads = remote.calls.filter(call => call.method === 'openDocument').length
  await controller.syncLocation('/tocktutor/Folder/Note.md')
  assert.equal(controller.getSnapshot().source, 'unsaved peer\r\n\r\n[[Keep]]')
  assert.equal(controller.getPaneSnapshot(left).source, 'unsaved peer\r\n\r\n[[Keep]]')
  assert.equal(controller.getSnapshot().saveStatus, 'unsaved')
  assert.equal(remote.calls.filter(call => call.method === 'openDocument').length, reads)
  await controller.dispose()
})

test('aggregate save rejects edits to an initially clean document while a sibling save is delayed', async () => {
  const remote = new FakeRemote()
  const controller = new WorkbenchRouteController(remote, () => {})
  await controller.syncLocation('/tocktutor/Folder/Note.md')
  const left = controller.getSnapshot().focusedPaneId
  await controller.splitPane(left, 'horizontal')
  await controller.select('Second.md')
  controller.edit('dirty B')
  await controller.focusPane(left)
  const pending = deferred<{ ok: true; value: WriteDocumentResult }>()
  remote.saveOverride = () => pending.promise
  const transition = controller.createManagedVault('Must remain blocked')
  controller.edit('new unsaved A')
  pending.resolve({ ok: true, value: { digest: `sha256:${'e'.repeat(64)}`, generation: firstVault.generation, path: 'Second.md', revision: secondRevision, snapshotId: 'saved', status: 'saved' } })
  assert.equal(await transition, false)
  assert.equal(remote.calls.some(call => call.method === 'createManagedVault'), false)
  assert.equal(controller.getPaneSnapshot(left).source, 'new unsaved A')
  await controller.dispose()
})

async function storedSplitFixture(paths: string[], focusedIndex = 0) {
  const { createWorkbenchSession, openNoteTab, addPaneGroup, focusPaneGroup } = await import('../dist/session.js')
  const { saveWorkbenchState } = await import('../dist/settings.js')
  const storage = new MemoryStorage()
  let session = createWorkbenchSession('/tocktutor', firstVault, 'pane-1')
  session = openNoteTab(session, 'pane-1', paths[0]!, { mode: 'source' })
  for (const path of paths.slice(1)) {
    const added = addPaneGroup(session)
    session = openNoteTab(added.session, added.groupId, path, { mode: path.endsWith('.base') ? 'reading' : 'source' })
  }
  session = focusPaneGroup(session, session.groups[focusedIndex]!.id)
  saveWorkbenchState(storage, firstVault.id, { focusMode: false, session, workspaces: [] })
  return { storage, ids: session.groups.map(group => group.id) }
}

test('focusing a restoring inactive pane joins its pending load instead of creating an empty document', async () => {
  const { storage, ids } = await storedSplitFixture(['Folder/Note.md', 'Second.md'])
  const remote = new FakeRemote()
  const pending = deferred<{ ok: true; value: OpenDocumentResult }>()
  const started = deferred<void>()
  remote.openOverride = path => {
    if (path === 'Second.md') { started.resolve(); return pending.promise }
    return success({ content: 'first', digest: `sha256:${'e'.repeat(64)}`, generation: firstVault.generation, path, revision: firstRevision })
  }
  const controller = new WorkbenchRouteController(remote, () => {}, () => new Date(), storage)
  const restore = controller.syncLocation('/tocktutor')
  await started.promise
  const focus = controller.focusPane(ids[1]!)
  pending.resolve({ ok: true, value: { content: 'restored second', digest: `sha256:${'e'.repeat(64)}`, generation: firstVault.generation, path: 'Second.md', revision: firstRevision } })
  await Promise.all([restore, focus])
  assert.equal(controller.getSnapshot().source, 'restored second')
  assert.equal(controller.getSnapshot().revision, firstRevision)
  assert.equal(remote.calls.filter(call => call.method === 'openDocument' && call.parameters[0] === 'Second.md').length, 1)
  controller.edit('editable second')
  assert.equal(controller.getSnapshot().source, 'editable second')
  await controller.dispose()
})

test('restored inactive Markdown and Base panes hydrate their own normal content projections', async () => {
  const { storage, ids } = await storedSplitFixture(['Folder/Note.md', 'Second.md', 'Tasks.base'], 1)
  const remote = new FakeRemote()
  remote.openOverride = path => success({ content: path === 'Folder/Note.md' ? '# Before\n![[Second.md]]' : path === 'Tasks.base' ? 'views:\n  - type: table\n    name: Notes\n' : '# Target', digest: `sha256:${'e'.repeat(64)}`, generation: firstVault.generation, path, revision: firstRevision })
  const controller = new WorkbenchRouteController(remote, () => {}, () => new Date(), storage)
  await controller.syncLocation('/tocktutor')
  await new Promise(resolve => setImmediate(resolve))
  const markdown = controller.getPaneSnapshot(ids[0]!)
  assert.equal(markdown.links?.path, 'Folder/Note.md')
  assert.equal(markdown.outline?.path, 'Folder/Note.md')
  assert.equal(markdown.embeds?.[0]?.target.path, 'Second.md')
  assert.ok(controller.getPaneSnapshot(ids[2]!).baseFiles?.some(file => file.path === 'Folder/Note.md'))
  assert.equal(controller.getSnapshot().path, 'Second.md')
  await controller.focusPane(ids[0]!)
  assert.equal(controller.getSnapshot().embeds?.[0]?.target.path, 'Second.md')
  await controller.dispose()
})

test('aggregate save also rejects an additional dirty document loaded during its await', async () => {
  const remote = new FakeRemote()
  const controller = new WorkbenchRouteController(remote, () => {})
  await controller.syncLocation('/tocktutor/Folder/Note.md')
  const left = controller.getSnapshot().focusedPaneId
  await controller.splitPane(left, 'horizontal')
  await controller.select('Second.md')
  controller.edit('dirty B')
  await controller.focusPane(left)
  const pending = deferred<{ ok: true; value: WriteDocumentResult }>()
  remote.saveOverride = () => pending.promise
  const save = controller.saveAll()
  await controller.addPane()
  const third = controller.getSnapshot().focusedPaneId
  await controller.select('Third.md')
  controller.edit('new document C')
  await controller.focusPane(left)
  pending.resolve({ ok: true, value: { digest: `sha256:${'e'.repeat(64)}`, generation: firstVault.generation, path: 'Second.md', revision: secondRevision, snapshotId: 'saved', status: 'saved' } })
  assert.equal(await save, false)
  assert.equal(controller.getPaneSnapshot(third).source, 'new document C')
  remote.saveOverride = null
  assert.equal(await controller.saveAll(), true)
  await controller.dispose()
})

for (const deferredRead of ['open', 'draft'] as const) test(`explicit inactive refresh rejects a peer edit during the ${deferredRead} await`, async () => {
  const remote = new FakeRemote()
  const controller = new WorkbenchRouteController(remote, () => {})
  await controller.syncLocation('/tocktutor/Folder/Note.md')
  const left = controller.getSnapshot().focusedPaneId
  await controller.splitPane(left, 'horizontal')
  await controller.select('Second.md')
  const entered = deferred<void>()
  const gate = deferred<void>()
  const originalOpen = remote.tocktutorWorkbench.openDocument
  const originalDraft = remote.tocktutorWorkbench.readDraft
  remote.tocktutorWorkbench.openDocument = async (...args) => {
    if (args[0] === 'Folder/Note.md') {
      if (deferredRead === 'open') { entered.resolve(); await gate.promise }
      return success({ content: 'new disk', digest: `sha256:${'e'.repeat(64)}`, generation: firstVault.generation, path: args[0], revision: secondRevision })
    }
    return originalOpen(...args)
  }
  remote.tocktutorWorkbench.readDraft = async (...args) => {
    if (args[0].path === 'Folder/Note.md' && deferredRead === 'draft') { entered.resolve(); await gate.promise }
    return originalDraft(...args)
  }
  remote.emit({ action: 'external-change', kind: 'entry', path: 'Folder/Note.md', vault: firstVault })
  await entered.promise
  controller.bindPaneEdit(left)('newer peer source')
  gate.resolve()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(controller.getPaneSnapshot(left).source, 'newer peer source')
  assert.equal(controller.getPaneSnapshot(left).revision, firstRevision)
  assert.equal(controller.getPaneSnapshot(left).saveStatus, 'unsaved')
  await controller.dispose()
})

for (const completion of ['background', 'edited', 'vault', 'closed'] as const) test(`inactive relationship hydration is record-bound after ${completion}`, async () => {
  const { storage, ids } = await storedSplitFixture(['Folder/Note.md', 'Second.md'], 1)
  const remote = new FakeRemote()
  const gate = deferred<void>()
  const entered = deferred<void>()
  const original = remote.tocktutorWorkbench.links
  remote.tocktutorWorkbench.links = async (...args) => {
    if (args[0].path === 'Folder/Note.md') { entered.resolve(); await gate.promise }
    return original(...args)
  }
  const controller = new WorkbenchRouteController(remote, () => {}, () => new Date(), storage)
  await controller.syncLocation('/tocktutor')
  await entered.promise
  if (completion === 'edited') controller.bindPaneEdit(ids[0]!)('newer draft')
  if (completion === 'vault') { remote.vault = secondVault; await controller.reload() }
  if (completion === 'closed') assert.equal(await controller.closePane(ids[0]!), true)
  gate.resolve()
  await new Promise(resolve => setImmediate(resolve))
  if (completion === 'background') {
    assert.equal(controller.getPaneSnapshot(ids[0]!).links?.path, 'Folder/Note.md')
    assert.equal(controller.getPaneSnapshot(ids[0]!).outline?.path, 'Folder/Note.md')
    assert.equal(controller.getSnapshot().path, 'Second.md')
  } else if (completion === 'edited') {
    assert.equal(controller.getPaneSnapshot(ids[0]!).links, null)
    assert.equal(controller.getPaneSnapshot(ids[0]!).source, 'newer draft')
    await controller.focusPane(ids[0]!)
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(controller.getSnapshot().links?.path, 'Folder/Note.md')
  } else {
    assert.notEqual(controller.getSnapshot().links?.path, 'Folder/Note.md')
  }
  await controller.dispose()
})

for (const kind of ['markdown', 'base'] as const) for (const completion of ['background', 'edited', 'closed', 'vault', 'disposed'] as const) test(`inactive ${kind} content hydration rejects stale ${completion} completion`, async () => {
  const path = kind === 'markdown' ? 'Folder/Note.md' : 'Tasks.base'
  const { storage, ids } = await storedSplitFixture([path, 'Second.md'], 1)
  const remote = new FakeRemote()
  const gate = deferred<void>()
  const entered = deferred<void>()
  let secondReads = 0
  remote.tocktutorWorkbench.openDocument = async (requested, vault) => {
    const delayed = kind === 'markdown' ? requested === 'Second.md' && ++secondReads > 1 : requested === 'Folder/Note.md'
    if (delayed) { entered.resolve(); await gate.promise }
    return success({ content: requested === path ? kind === 'markdown' ? '# Source\n![[Second.md]]' : 'views:\n  - type: table\n    name: All\n' : '# Hydrated target', digest: `sha256:${'e'.repeat(64)}`, generation: vault.generation, path: requested, revision: firstRevision })
  }
  const controller = new WorkbenchRouteController(remote, () => {}, () => new Date(), storage)
  await controller.syncLocation('/tocktutor')
  await entered.promise
  if (completion === 'edited') controller.bindPaneEdit(ids[0]!)(kind === 'markdown' ? '# No embed anymore' : 'views:\n  - type: table\n    name: Changed\n')
  if (completion === 'closed') assert.equal(await controller.closePane(ids[0]!), true)
  if (completion === 'vault') { remote.vault = secondVault; await controller.reload() }
  if (completion === 'disposed') await controller.dispose()
  const before = controller.getSnapshot()
  gate.resolve()
  await new Promise(resolve => setImmediate(resolve))
  if (completion === 'background') {
    const pane = controller.getPaneSnapshot(ids[0]!)
    if (kind === 'markdown') assert.equal(pane.embeds?.[0]?.content, '# Hydrated target')
    else assert.ok(pane.baseFiles?.some(file => file.source === '# Hydrated target'))
    assert.equal(controller.getSnapshot().path, 'Second.md')
  } else if (completion === 'edited') {
    const pane = controller.getPaneSnapshot(ids[0]!)
    assert.equal((kind === 'markdown' ? pane.embeds : pane.baseFiles)?.length, 0)
    await controller.focusPane(ids[0]!)
    await new Promise(resolve => setImmediate(resolve))
    if (kind === 'base') assert.ok(controller.getSnapshot().baseFiles?.length)
    else assert.equal(controller.getSnapshot().embeds?.length, 0)
  } else if (completion === 'disposed') assert.equal(controller.getSnapshot(), before)
  else assert.equal(controller.getSnapshot().path, before.path)
  await controller.dispose()
})

test('explicit clean refresh supersedes older hydration even when document bytes and revision are unchanged', async () => {
  const { storage, ids } = await storedSplitFixture(['Folder/Note.md', 'Second.md'], 1)
  const remote = new FakeRemote()
  const gate = deferred<void>()
  let requests = 0
  const original = remote.tocktutorWorkbench.links
  remote.tocktutorWorkbench.links = async (...args) => {
    if (args[0].path !== 'Folder/Note.md') return original(...args)
    const index = ++requests
    if (index === 1) await gate.promise
    const result = await original(...args)
    return { ...result, value: { ...result.value, backlinks: [index === 1 ? 'Old.md' : 'Fresh.md'] } }
  }
  const controller = new WorkbenchRouteController(remote, () => {}, () => new Date(), storage)
  try {
    await controller.syncLocation('/tocktutor')
    remote.emit({ action: 'external-change', kind: 'entry', path: 'Folder/Note.md', vault: firstVault })
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(requests, 2)
    gate.resolve()
    await new Promise(resolve => setImmediate(resolve))
    assert.deepEqual(controller.getPaneSnapshot(ids[0]!).links?.backlinks, ['Fresh.md'])
  } finally { gate.resolve(); await controller.dispose() }
})

for (const pane of ['active', 'inactive'] as const) test(`new disk refresh supersedes a delayed draft read for the ${pane} document`, async () => {
  const remote = new FakeRemote()
  const controller = new WorkbenchRouteController(remote, () => {})
  await controller.syncLocation('/tocktutor/Folder/Note.md')
  const owner = controller.getSnapshot().focusedPaneId
  if (pane === 'inactive') { await controller.splitPane(owner, 'horizontal'); await controller.select('Second.md') }
  const started = deferred<void>()
  const oldDraft = deferred<void>()
  const newestDraft = deferred<void>()
  let reads = 0
  let drafts = 0
  const signals: AbortSignal[] = []
  const originalOpen = remote.tocktutorWorkbench.openDocument
  const originalDraft = remote.tocktutorWorkbench.readDraft
  remote.tocktutorWorkbench.openDocument = async (...args) => {
    if (args[0] !== 'Folder/Note.md') return originalOpen(...args)
    reads += 1
    signals.push(args[2]!)
    return success({ content: `disk R${reads + 1}`, digest: `sha256:${'e'.repeat(64)}`, generation: firstVault.generation, path: args[0], revision: `file:${String(reads + 1).repeat(64)}` })
  }
  remote.tocktutorWorkbench.readDraft = async (...args) => {
    if (args[0].path !== 'Folder/Note.md') return originalDraft(...args)
    const index = ++drafts
    if (index === 1) { started.resolve(); await oldDraft.promise }
    if (index === 2) await newestDraft.promise
    return success({ draft: null, generation: firstVault.generation })
  }
  try {
    remote.emit({ action: 'external-change', kind: 'entry', path: 'Folder/Note.md', vault: firstVault })
    await started.promise
    remote.emit({ action: 'external-change', kind: 'entry', path: 'Folder/Note.md', vault: firstVault })
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(reads, 2)
    assert.equal(signals[0]?.aborted, true)
    oldDraft.resolve()
    await new Promise(resolve => setImmediate(resolve))
    // The obsolete finalizer must leave R3 registered so R4 can cancel it.
    remote.emit({ action: 'external-change', kind: 'entry', path: 'Folder/Note.md', vault: firstVault })
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(reads, 3)
    assert.equal(signals[1]?.aborted, true)
    newestDraft.resolve()
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(controller.getPaneSnapshot(owner).source, 'disk R4')
    assert.equal(controller.getPaneSnapshot(owner).revision, `file:${'4'.repeat(64)}`)
  } finally { oldDraft.resolve(); newestDraft.resolve(); await controller.dispose() }
})

test('unrelated typing coalesces a fresh embed read after invalidating pending hydration without navigation', async () => {
  const remote = new FakeRemote()
  const controller = new WorkbenchRouteController(remote, () => {})
  await controller.syncLocation('/tocktutor/Folder/Note.md')
  const pending = deferred<void>()
  const entered = deferred<void>()
  let reads = 0
  const original = remote.tocktutorWorkbench.openDocument
  remote.tocktutorWorkbench.openDocument = async (...args) => {
    if (args[0] !== 'Second.md') return original(...args)
    reads += 1
    if (reads === 1) { entered.resolve(); await pending.promise }
    return success({ content: '# Valid embed body', digest: `sha256:${'e'.repeat(64)}`, generation: firstVault.generation, path: args[0], revision: firstRevision })
  }
  controller.edit('![[Second.md]]\n')
  await entered.promise
  for (let index = 0; index < 12; index += 1) controller.edit(`![[Second.md]]\n\nAppended prose ${index}`)
  assert.equal(reads, 1)
  pending.resolve()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(controller.getSnapshot().embeds?.[0]?.content, '# Valid embed body')
  assert.equal(reads, 2)
  assert.equal(controller.getSnapshot().source, '![[Second.md]]\n\nAppended prose 11')
  assert.equal(controller.getSnapshot().path, 'Folder/Note.md')
  await controller.dispose()
})

test('abandoned recovered draft loads are reclaimed without participating in aggregate save and recover on reopen', async () => {
  const remote = new FakeRemote()
  const controller = new WorkbenchRouteController(remote, () => {})
  await controller.syncLocation('/tocktutor/Folder/Note.md')
  const originalDraft = remote.tocktutorWorkbench.readDraft
  let gate: ReturnType<typeof deferred<void>> | null = null
  let entered: ReturnType<typeof deferred<void>> | null = null
  remote.tocktutorWorkbench.readDraft = async (...args) => {
    if (!args[0].path.startsWith('Recovered')) return originalDraft(...args)
    entered?.resolve()
    if (gate) await gate.promise
    return success({ draft: { content: `persisted ${args[0].path}\r\n`, path: args[0].path, revision: firstRevision, updatedAt: 1 }, generation: firstVault.generation })
  }
  for (let index = 0; index < 12; index += 1) {
    gate = deferred<void>(); entered = deferred<void>()
    const abandoned = controller.select(`Recovered${index}.md`)
    await entered.promise
    await controller.select(index % 2 ? 'Folder/Note.md' : 'Second.md')
    gate.resolve()
    assert.equal(await abandoned, false)
  }
  const saves = remote.calls.filter(call => call.method === 'saveDocument').length
  assert.equal(await controller.saveAll(), true)
  assert.equal(remote.calls.filter(call => call.method === 'saveDocument').length, saves)
  gate = null
  assert.equal(await controller.select('Recovered0.md'), true)
  assert.equal(controller.getSnapshot().source, 'persisted Recovered0.md\r\n')
  assert.equal(controller.getSnapshot().saveStatus, 'unsaved')
  controller.edit('later edited draft')
  await controller.splitPane(controller.getSnapshot().focusedPaneId, 'horizontal')
  assert.equal(controller.getSnapshot().source, 'later edited draft')
  await controller.dispose()
  assert.ok(remote.calls.some(call => call.method === 'saveDraft' && (call.parameters[0] as { content: string }).content === 'later edited draft'))
})

test('a stale selection consumer cannot prune the recovered record needed by a newer joined selection', async () => {
  const remote = new FakeRemote()
  const controller = new WorkbenchRouteController(remote, () => {})
  await controller.syncLocation('/tocktutor/Folder/Note.md')
  const entered = deferred<void>()
  const pending = deferred<void>()
  const original = remote.tocktutorWorkbench.readDraft
  let draftReads = 0
  remote.tocktutorWorkbench.readDraft = async (...args) => {
    if (args[0].path !== 'Second.md') return original(...args)
    draftReads += 1
    entered.resolve()
    await pending.promise
    return success({ draft: { content: 'joined recovered draft', path: 'Second.md', revision: firstRevision, updatedAt: 1 }, generation: firstVault.generation })
  }
  const stale = controller.select('Second.md')
  await entered.promise
  const latest = controller.select('Second.md')
  pending.resolve()
  assert.equal(await stale, false)
  assert.equal(await latest, true)
  assert.equal(draftReads, 1)
  assert.equal(controller.getSnapshot().source, 'joined recovered draft')
  assert.equal(controller.getSnapshot().saveStatus, 'unsaved')
  await controller.dispose()
})

test('evicting an abandoned durable recovery record aborts its pending hydration', async () => {
  const remote = new FakeRemote()
  const controller = new WorkbenchRouteController(remote, () => {})
  await controller.syncLocation('/tocktutor/Folder/Note.md')
  const entered = deferred<void>()
  const draftGate = deferred<void>()
  const linksGate = deferred<void>()
  let signal: AbortSignal | undefined
  const originalDraft = remote.tocktutorWorkbench.readDraft
  const originalLinks = remote.tocktutorWorkbench.links
  remote.tocktutorWorkbench.readDraft = async (...args) => {
    if (args[0].path !== 'Recovered.md') return originalDraft(...args)
    entered.resolve(); await draftGate.promise
    return success({ draft: { content: 'durably stored', path: 'Recovered.md', revision: firstRevision, updatedAt: 1 }, generation: firstVault.generation })
  }
  remote.tocktutorWorkbench.links = async (...args) => {
    if (args[0].path === 'Recovered.md') { signal = args[1]; await linksGate.promise }
    return originalLinks(...args)
  }
  const stale = controller.select('Recovered.md')
  await entered.promise
  await controller.select('Second.md')
  draftGate.resolve()
  assert.equal(await stale, false)
  assert.equal(signal?.aborted, true)
  linksGate.resolve()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(controller.getSnapshot().path, 'Second.md')
  assert.equal(controller.getSnapshot().links?.path, 'Second.md')
  await controller.dispose()
  assert.equal(remote.calls.some(call => call.method === 'saveDraft' && (call.parameters[0] as { path: string }).path === 'Recovered.md'), false)
})

for (const saved of [false, true]) test(`navigation respects a same-byte draft after background refresh (saved=${saved})`, async () => {
  const remote = new FakeRemote()
  const controller = new WorkbenchRouteController(remote, () => {}, () => new Date(), null)
  const entered = deferred<void>()
  const release = deferred<void>()
  try {
    await controller.syncLocation('/tocktutor/Folder/Note.md')
    const originalSource = controller.getSnapshot().source
    remote.openOverride = async path => {
      if (path === 'Second.md') { entered.resolve(); await release.promise }
      return success({ content: path === 'Second.md' ? '# Second\n' : '# External version\n', digest: `sha256:${'e'.repeat(64)}`, generation: firstVault.generation, path, revision: secondRevision })
    }
    const pending = controller.select('Second.md')
    await entered.promise
    remote.emit({ action: 'external-change', kind: 'entry', path: 'Folder/Note.md', vault: firstVault })
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(controller.getSnapshot().source, '# External version\n')
    controller.edit(originalSource)
    assert.equal(controller.getSnapshot().saveStatus, 'unsaved')
    if (saved) assert.equal(await controller.save(), true)
    release.resolve()
    assert.equal(await pending, saved)
    assert.equal(controller.getSnapshot().path, saved ? 'Second.md' : 'Folder/Note.md')
    if (!saved) {
      assert.equal(controller.getSnapshot().source, originalSource)
      assert.equal(controller.getSnapshot().saveStatus, 'unsaved')
    }
  } finally { release.resolve(); await controller.dispose() }
})

test('a background active refresh error cannot replace pending navigation status', async () => {
  const remote = new FakeRemote()
  const controller = new WorkbenchRouteController(remote, () => {}, () => new Date(), null)
  const navigationEntered = deferred<void>()
  const releaseNavigation = deferred<void>()
  const refreshEntered = deferred<void>()
  const releaseRefresh = deferred<void>()
  try {
    await controller.syncLocation('/tocktutor/Folder/Note.md')
    const before = controller.getSnapshot().message
    remote.openOverride = path => {
      if (path === 'Second.md') {
        navigationEntered.resolve()
        return releaseNavigation.promise.then(() => success({ content: '# Second\n', digest: `sha256:${'e'.repeat(64)}`, generation: firstVault.generation, path, revision: secondRevision }))
      }
      if (path === 'Folder/Note.md') {
        refreshEntered.resolve()
        return releaseRefresh.promise.then(() => { throw new Error('stale active refresh') })
      }
      return success({ content: '# Other\n', digest: `sha256:${'e'.repeat(64)}`, generation: firstVault.generation, path, revision: firstRevision })
    }
    const pending = controller.select('Second.md')
    await navigationEntered.promise
    remote.emit({ action: 'external-change', kind: 'entry', path: 'Folder/Note.md', vault: firstVault })
    await refreshEntered.promise
    releaseRefresh.resolve()
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(controller.getSnapshot().path, 'Folder/Note.md')
    assert.equal(controller.getSnapshot().message, before)
    assert.ok(controller.getSnapshot().warnings.includes('stale active refresh'))
    releaseNavigation.resolve()
    assert.equal(await pending, true)
    assert.equal(controller.getSnapshot().path, 'Second.md')
  } finally {
    releaseRefresh.resolve()
    releaseNavigation.resolve()
    await controller.dispose()
  }
})

test('recent-search cannot resurrect a deletion published by an already pending tree', async () => {
  const remote = new FakeRemote()
  const controller = new WorkbenchRouteController(remote, () => {}, () => new Date(), null)
  const releaseTree = deferred<void>()
  const recentEntered = deferred<void>()
  const releaseRecent = deferred<void>()
  try {
    remote.treePageOverride = async () => success(tree(firstVault, 'Deleted.md'))
    await controller.syncLocation('/tocktutor')
    let requests = 0
    remote.treePageOverride = async () => {
      if (++requests === 1) await releaseTree.promise
      else { recentEntered.resolve(); await releaseRecent.promise }
      return success(tree(firstVault, 'Fresh.md'))
    }
    remote.emit({ action: 'changed', kind: 'tree', vault: firstVault })
    controller.openSearch('')
    await recentEntered.promise
    releaseTree.resolve()
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(controller.getSnapshot().entries.some(entry => entry.path === 'Deleted.md'), false)
    assert.equal(controller.getSnapshot().entries.some(entry => entry.path === 'Fresh.md'), true)
    releaseRecent.resolve()
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(controller.getSnapshot().entries.some(entry => entry.path === 'Deleted.md'), false)
    assert.equal(controller.getSnapshot().searchMatches?.some(entry => entry.path === 'Deleted.md'), false)
    assert.equal(controller.getSnapshot().searchMatches?.some(entry => entry.path === 'Fresh.md'), true)
    assert.equal(controller.getSnapshot().searchOpen, true)
  } finally {
    releaseTree.resolve()
    releaseRecent.resolve()
    await controller.dispose()
  }
})

test('a recent-search page cannot replace a newer background tree publication', async () => {
  const remote = new FakeRemote()
  const controller = new WorkbenchRouteController(remote, () => {}, () => new Date(), null)
  const oldPage = deferred<void>()
  const oldStarted = deferred<void>()
  const newEntry = {
    createdAt: 3,
    kind: 'document' as const,
    modifiedAt: 3,
    path: 'New.md',
    revision: firstRevision,
    size: 8,
  }
  let calls = 0
  try {
    await controller.syncLocation('/tocktutor')
    remote.treePageOverride = async (_request, _signal) => {
      calls += 1
      if (calls === 1) {
        oldStarted.resolve()
        await oldPage.promise
        return success(tree(firstVault))
      }
      const page = tree(firstVault)
      return success({ ...page, entries: [...page.entries, newEntry], scan: { ...page.scan, entries: page.scan.entries + 1 } })
    }
    controller.openSearch('')
    await oldStarted.promise
    remote.emit({ action: 'changed', kind: 'tree', vault: firstVault })
    for (let attempt = 0; attempt < 100 && !controller.getSnapshot().entries.some(entry => entry.path === 'New.md'); attempt += 1) {
      await new Promise(resolve => setImmediate(resolve))
    }
    assert.equal(controller.getSnapshot().entries.some(entry => entry.path === 'New.md'), true)
    oldPage.resolve()
    for (let attempt = 0; attempt < 10; attempt += 1) await new Promise(resolve => setImmediate(resolve))
    assert.equal(controller.getSnapshot().entries.some(entry => entry.path === 'New.md'), true)
    assert.equal(controller.getSnapshot().searchOpen, true)
    controller.setSearchQuery('lesson')
    assert.equal(await controller.runSearch(), true)
    assert.equal(controller.getSnapshot().searchOpen, true)
  } finally {
    oldPage.resolve()
    await controller.dispose()
  }
})

for (const staleResult of ['page', 'error'] as const) test(`background tree pagination keeps the latest refresh and rejects an older ${staleResult}`, async () => {
  const remote = new FakeRemote()
  const controller = new WorkbenchRouteController(remote, () => {}, () => new Date(), null)
  const release = deferred<void>()
  let olderSignal: AbortSignal | undefined
  let calls = 0
  try {
    await controller.syncLocation('/tocktutor/Folder/Note.md')
    remote.treePageOverride = async (request, signal) => {
      calls++
      if (calls === 1) return success({ ...tree(firstVault), complete: false, cursor: 'older-page', truncated: true, truncationReason: 'result-limit' })
      if (request.cursor === 'older-page') {
        olderSignal = signal
        await release.promise
        if (staleResult === 'error') throw new Error('obsolete tree failure')
        return success({ ...tree(firstVault, 'Obsolete.md'), complete: false, cursor: 'must-not-request', truncated: true, truncationReason: 'result-limit' })
      }
      return success(tree(firstVault, 'Latest.md'))
    }
    remote.emit({ kind: 'tree', action: 'changed', vault: firstVault })
    await new Promise(resolve => setImmediate(resolve))
    remote.emit({ kind: 'tree', action: 'changed', vault: firstVault })
    await new Promise(resolve => setImmediate(resolve))
    const latest = controller.getSnapshot()
    assert.ok(latest.entries.some(entry => entry.path === 'Latest.md'))
    assert.equal(olderSignal?.aborted, true)
    release.resolve()
    await new Promise(resolve => setImmediate(resolve))
    assert.deepEqual(controller.getSnapshot(), latest)
    assert.equal(calls, 3, 'superseded pagination must not request its next cursor')
  } finally { release.resolve(); await controller.dispose() }
})

for (const boundary of ['same-vault reload', 'vault switch', 'dispose'] as const) for (const staleResult of ['page', 'error'] as const) test(`${boundary} rejects an old background tree ${staleResult}`, async () => {
  const remote = new FakeRemote()
  const controller = new WorkbenchRouteController(remote, () => {}, () => new Date(), null)
  const release = deferred<void>()
  let signal: AbortSignal | undefined
  try {
    await controller.syncLocation('/tocktutor')
    remote.treePageOverride = async (_request, received) => {
      signal = received
      await release.promise
      if (staleResult === 'error') throw new Error('obsolete tree failure')
      return success(tree(firstVault, 'Obsolete.md'))
    }
    remote.emit({ kind: 'tree', action: 'changed', vault: firstVault })
    remote.treePageOverride = null
    if (boundary === 'dispose') await controller.dispose()
    else {
      if (boundary === 'vault switch') remote.vault = secondVault
      await controller.reload()
    }
    assert.equal(signal?.aborted, true)
    const latest = controller.getSnapshot()
    release.resolve()
    await new Promise(resolve => setImmediate(resolve))
    assert.deepEqual(controller.getSnapshot(), latest)
  } finally { release.resolve(); await controller.dispose() }
})

for (const work of ['search', 'recovery'] as const) test(`background tree notifications preserve pending ${work} and foreground status`, async () => {
  const remote = new FakeRemote()
  const controller = new WorkbenchRouteController(remote, () => {}, () => new Date(), null)
  const release = deferred<void>()
  const entered = deferred<void>()
  let signal: AbortSignal | undefined
  try {
    await controller.syncLocation('/tocktutor/Folder/Note.md')
    const listSnapshots = remote.tocktutorWorkbench.listSnapshots
    remote.tocktutorWorkbench.listSnapshots = async (request, received) => {
      signal = received
      entered.resolve()
      await release.promise
      return listSnapshots(request, received)
    }
    remote.searchOverride = async (_request, received) => {
      signal = received
      entered.resolve()
      await release.promise
      return success({ cursor: null, generation: firstVault.generation, matches: [], query: 'lesson', scan: { bytes: 0, entries: 0, files: 0 }, truncated: false, truncationReason: null, warnings: [] })
    }
    if (work === 'search') controller.openSearch('lesson')
    const pending = work === 'search' ? controller.runSearch() : controller.setRecoveryOpen(true)
    await entered.promise
    const before = controller.getSnapshot()
    remote.treePageOverride = async () => success({ ...tree(firstVault), complete: false, truncated: true, truncationReason: 'depth-limit' })
    remote.emit({ kind: 'tree', action: 'changed', vault: firstVault })
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(signal?.aborted, false, `${work} must retain its own operation`)
    assert.equal(controller.getSnapshot().message, before.message)
    assert.equal(controller.getSnapshot().searchLoading, before.searchLoading)
    release.resolve()
    assert.equal(await pending, work === 'search' ? true : undefined)
  } finally { release.resolve(); await controller.dispose() }
})

for (const result of ['page', 'error'] as const) test(`a current background tree ${result} can settle after navigation without replacing its status`, async () => {
  const remote = new FakeRemote()
  const controller = new WorkbenchRouteController(remote, () => {}, () => new Date(), null)
  const release = deferred<void>()
  let signal: AbortSignal | undefined
  try {
    await controller.syncLocation('/tocktutor/Folder/Note.md')
    remote.treePageOverride = async (_request, received) => {
      signal = received
      await release.promise
      if (result === 'error') throw new Error('tree refresh failed')
      return success({ ...tree(firstVault, 'Fresh.md'), complete: false, truncated: true, truncationReason: 'depth-limit' })
    }
    remote.emit({ kind: 'tree', action: 'changed', vault: firstVault })
    assert.equal(await controller.select('Second.md'), true)
    const selected = controller.getSnapshot()
    release.resolve()
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(signal?.aborted, false)
    assert.equal(controller.getSnapshot().path, selected.path)
    assert.equal(controller.getSnapshot().message, selected.message)
    if (result === 'page') {
      assert.ok(controller.getSnapshot().entries.some(entry => entry.path === 'Fresh.md'))
      assert.ok(controller.getSnapshot().warnings.includes('The vault tree is truncated to a bounded result.'))
    } else assert.ok(controller.getSnapshot().warnings.includes('tree refresh failed'))
  } finally { release.resolve(); await controller.dispose() }
})
