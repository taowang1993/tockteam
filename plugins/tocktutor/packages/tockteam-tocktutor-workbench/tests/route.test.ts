import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
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
  readonly calls: Array<{ method: string; parameters: unknown[] }> = []
  readonly listeners = new Set<(event: NoteVaultChangeEvent) => void>()
  createOverride: ((request: CreateDocumentRequest) => Promise<{
    ok: true
    value: WriteDocumentResult
  }>) | null = null
  openOverride: ((path: string) => Promise<{ ok: true; value: OpenDocumentResult }>) | null = null
  saveOverride: (() => Promise<{ ok: true; value: WriteDocumentResult }>) | null = null

  readonly tocktutorWorkbench = {
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
    listTree: (request: { expectedVault: VaultReference; cursor?: string | null; limit?: number }, signal?: AbortSignal) => {
      this.calls.push({ method: 'listTree', parameters: [request, signal] })
      return success(tree(request.expectedVault))
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
  const newDialog = renderToStaticMarkup(createElement(TockTutorRouteView, {
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
  assert.match(newDialog, /<dialog[^>]+aria-label="New Note"[^>]+aria-modal="true"/u)
  assert.doesNotMatch(newDialog, /<dialog[^>]+open=""/u)
  assert.match(newDialog, /<input[^>]+aria-label="New Note Path"[^>]+required=""/u)
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
  const captureDialog = renderToStaticMarkup(createElement(TockTutorRouteView, {
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
  assert.match(captureDialog, /<dialog[^>]+aria-label="Quick Capture"[^>]+aria-modal="true"/u)
  assert.doesNotMatch(captureDialog, /<dialog[^>]+open=""/u)
  assert.match(captureDialog, /<input[^>]+aria-label="Capture Title"[^>]+required=""/u)
  assert.match(captureDialog, /<textarea[^>]+aria-label="Capture Text"/u)
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

  const html = renderToStaticMarkup(createElement(TockTutorRouteView, {
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
  assert.match(html, /aria-label="TockTutor Workbench"/u)
  assert.match(html, /<section[^>]+aria-label="TockTutor Title Bar"/u)
  assert.match(html, /<button[^>]+aria-label="Search Notes"/u)
  assert.match(html, /<button[^>]+aria-label="New Note"/u)
  assert.doesNotMatch(html, /TockLauncher/u)
  assert.match(html, /padding-top: 0/u)
  assert.match(html, /\.tocktutor-titlebar\s*\{[^}]*height: var\(--tockteam-titlebar-height, 40px\)/su)
  assert.match(html, /\.tocktutor-titlebar\s*\{[^}]*top: 0/su)
  assert.match(html, /<button[^>]+aria-label="Resize Files Sidebar, 280 Pixels"/u)
  assert.match(html, /title="Drag or Use Left and Right Arrow Keys"/u)
  assert.match(html, /grid-template-columns:280px minmax\(0, 1fr\) auto auto/u)
  assert.match(html, /transition: grid-template-columns 300ms ease-out/u)
  assert.match(html, /\.tocktutor-titlebar svg \{[^}]*height: 18px; width: 18px/u)
  assert.match(html, /<button[^>]+aria-expanded="true"[^>]+aria-label="Toggle Files Sidebar"/u)
  assert.match(html, /<button[^>]+aria-expanded="false"[^>]+aria-label="Toggle Assistant Panel"/u)
  assert.match(html, /class="lucide lucide-panel-left"/u)
  assert.match(html, /class="lucide lucide-panel-right"/u)
  assert.match(html, /\.tocktutor-titlebar-sidebar \.tocktutor-panel-icon \{ margin-left: auto; \}/u)
  assert.match(html, /\.tocktutor-sidebar \{ background: var\(--tockteam-shell-chrome, var\(--tt-panel\)\)/u)
  assert.doesNotMatch(html, /\.tocktutor-sidebar-resize:hover::after[^}]*var\(--tt-accent\)/u)
  const sidebarHeader = html.match(/<header class="tocktutor-sidebar-header">(?<content>.*?)<\/header>/u)?.groups?.content
  assert.ok(sidebarHeader)
  assert.doesNotMatch(sidebarHeader, /M15 3v18/u)
  assert.match(html, /--tt-footer-height: 28px/u)
  assert.match(html, /grid-template-rows: 40px minmax\(0, 1fr\) var\(--tt-footer-height\)/u)
  assert.match(html, /--tt-tab-border: #d1d5db/u)
  assert.match(html, /--tt-tab-curve: 10px/u)
  assert.match(html, /box-shadow: inset 0 0 0 1px var\(--tt-tab-border\)/u)
  assert.match(html, /<aside[^>]+aria-hidden="false"[^>]+aria-label="Files"[^>]+data-open="true"/u)
  assert.match(html, /<aside[^>]+aria-hidden="true"[^>]+aria-label="Assistant Panel"[^>]+class="tocktutor-right-panel tocktutor-right-panel-assistant"[^>]+data-open="false"[^>]+inert=""/u)
  assert.doesNotMatch(html, /aria-label="Close Assistant"/u)
  assert.match(html, /\.tocktutor-right-panel \{[^}]*border-left: 1px solid var\(--tt-border\);[^}]*box-shadow: none;/su)
  assert.match(html, /\.tocktutor-right-panel \{[^}]*transition: width 420ms cubic-bezier\(\.16, 1, \.3, 1\), opacity 300ms/su)
  assert.match(html, /\.tocktutor-right-panel-assistant \{[^}]*border-left: 0;[^}]*overflow: hidden;/su)
  assert.match(html, /\.tocktutor-right-panel-assistant\[data-open=(?:&quot;|")true(?:&quot;|")\] \{ overflow: visible; \}/u)
  assert.match(html, /\.tocktutor-right-panel-assistant (?:&gt;|>) \.tocktutor-assistant-content \{[^}]*border-left: 1px solid color-mix\(in srgb, var\(--tt-text\) 8%, var\(--tt-border\) 92%\);/su)
  assert.match(html, /\.tocktutor-assistant-resize \{[^}]*touch-action: none;[^}]*transform: translateX\(-50%\);[^}]*width: 16px;/su)
  assert.match(html, /\.tocktutor-assistant-resize::before \{[^}]*background: color-mix\(in srgb, var\(--tt-text\) 8%, var\(--tt-panel\)\);[^}]*height: 40px;[^}]*width: 8px;/su)
  assert.match(html, /\.tocktutor-assistant-resize:hover \+ \.tocktutor-assistant-content,[^{]+\{ border-left-color: var\(--tt-accent\); \}/su)
  assert.match(html, /\.tocktutor-right-panel\[data-open=(?:&quot;|")true(?:&quot;|")\][^}]*width: min\(360px, calc\(100vw - 262px\)\)/su)
  assert.match(html, /Assistant Surface/u)
  assert.match(html, /aria-label="Vault Notes"/u)
  assert.match(html, /aria-label="Reading View"/u)
  assert.match(html, /<section[^>]+aria-label="Note Editor"[^>]+role="tabpanel"/u)
  assert.match(html, /<footer[^>]+aria-label="TockTutor Status Bar"/u)
  assert.match(html, /prefers-reduced-motion/u)
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

test('Canvas and Base projections stay inert and save only known Canvas geometry', async () => {
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
  assert.match(html, /aria-label="Canvas View"/u)
  assert.match(html, /Move Plan right/u)

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
