import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import NoteVaultRuntime, { Config as RuntimeConfig } from 'tockbot-note-runtime'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { Context, Service } from '@deepseek-ai/cordis'
import { remoteMethods } from '@deepseek-ai/dsh-typert-protocol'
import * as workbench from '../dist/index.js'
import {
  MAX_TREE_CURSOR_LENGTH,
  MAX_TREE_PAGE_SIZE,
  TockTutorWorkbenchGateway,
  type AttachmentMetadataResult,
  type AttachmentPreviewResult,
  type StoreAttachmentRequest,
  type StoreAttachmentResult,
  type ListTreeRequest,
  type MergeLinkPreviewRequest,
  type MergeLinkPreviewResult,
  type OpenDocumentResult,
  type RenameDocumentRequest,
  type RenameDocumentResult,
  type VaultFacetsRequest,
  type VaultFacetsResult,
  type VaultGraphRequest,
  type VaultGraphResult,
  type VaultLinksRequest,
  type VaultLinksResult,
  type VaultOutlineRequest,
  type VaultOutlineResult,
  type VaultReference,
  type VaultSearchRequest,
  type VaultSearchResult,
  type VaultTreePage,
} from '../dist/host-read.js'

class FakeNoteVault extends Service {
  readonly calls: Array<{ method: string; parameters: unknown[] }> = []
  active = true
  openResult: OpenDocumentResult = {
    content: '# Exact source\n',
    digest: `sha256:${'a'.repeat(64)}`,
    generation: 7,
    path: 'Folder/Note.md',
    revision: `file:${'b'.repeat(64)}`,
  }
  treeResult: VaultTreePage = {
    complete: true,
    cursor: null,
    entries: [
      { kind: 'directory', modifiedAt: 1, path: 'Folder', revision: `dir:${'d'.repeat(64)}` },
      {
        createdAt: 2,
        kind: 'document',
        modifiedAt: 3,
        path: 'Folder/Note.md',
        revision: `file:${'e'.repeat(64)}`,
        size: 15,
      },
    ],
    generation: 7,
    scan: { entries: 2 },
    truncated: false,
    truncationReason: null,
    warnings: [],
  }
  failure: Error | null = null
  constructor(ctx: Context) {
    super(ctx, 'noteVault')
  }

  get state() {
    return this.active
      ? { active: true as const, generation: vault.generation, id: vault.id }
      : { active: false as const, generation: vault.generation }
  }

  createManagedVault(name: string, expectedGeneration: number) {
    this.calls.push({ method: 'createManagedVault', parameters: [name, expectedGeneration] })
    return { active: true as const, generation: expectedGeneration + 1, id: `vault:${'f'.repeat(64)}` }
  }

  activeVaultDisplayPath() {
    this.calls.push({ method: 'activeVaultDisplayPath', parameters: [] })
    return '~/Documents/Research Vault'
  }

  activeVaultName() {
    this.calls.push({ method: 'activeVaultName', parameters: [] })
    return 'Research Vault'
  }

  openSandboxVault(expectedGeneration: number) {
    this.calls.push({ method: 'openSandboxVault', parameters: [expectedGeneration] })
    return { active: true as const, generation: expectedGeneration + 1, id: `vault:${'e'.repeat(64)}` }
  }

  async synchronizeDesktopSelection(signal: AbortSignal) {
    this.calls.push({ method: 'synchronizeDesktopSelection', parameters: [signal] })
    return this.state
  }

  async inspectAttachment(path: string, expectedVault: VaultReference, signal: AbortSignal): Promise<AttachmentMetadataResult> {
    this.calls.push({ method: 'inspectAttachment', parameters: [path, expectedVault, signal] })
    return { generation: expectedVault.generation, mediaKind: 'image', mimeType: 'image/png', path, revision: `file:${'a'.repeat(64)}`, size: 3 }
  }

  async previewAttachment(path: string, expectedVault: VaultReference, signal: AbortSignal): Promise<AttachmentPreviewResult & { data: Uint8Array }> {
    this.calls.push({ method: 'previewAttachment', parameters: [path, expectedVault, signal] })
    return { data: Uint8Array.from([1, 2, 3]), dataBase64: 'AQID', digest: `sha256:${'b'.repeat(64)}`, generation: expectedVault.generation, mediaKind: 'image', mimeType: 'image/png', path, revision: `file:${'a'.repeat(64)}`, size: 3 }
  }

  async storeAttachment(request: StoreAttachmentRequest & { data: Uint8Array }, signal: AbortSignal): Promise<StoreAttachmentResult> {
    this.calls.push({ method: 'storeAttachment', parameters: [request, signal] })
    return { digest: `sha256:${'b'.repeat(64)}`, generation: request.expectedVault.generation, mediaKind: 'image', mimeType: 'image/png', path: request.path, revision: `file:${'a'.repeat(64)}`, size: request.data.byteLength, status: 'stored' }
  }

  async openDocument(
    path: string,
    expectedVault: VaultReference,
    signal: AbortSignal,
  ): Promise<OpenDocumentResult> {
    this.calls.push({ method: 'openDocument', parameters: [path, expectedVault, signal] })
    if (this.failure !== null) throw this.failure
    return this.openResult
  }

  async moveFileWithLinkRewrite(request: RenameDocumentRequest, signal: AbortSignal): Promise<RenameDocumentResult> {
    this.calls.push({ method: 'moveFileWithLinkRewrite', parameters: [request, signal] })
    return {
      fromPath: request.fromPath,
      generation: request.expectedVault.generation,
      path: request.toPath,
      rewriteSnapshots: [],
      rewrittenPaths: [],
      revision: `file:${'f'.repeat(64)}`,
      status: 'moved',
    }
  }

  async previewMergeLinks(request: MergeLinkPreviewRequest, signal: AbortSignal): Promise<MergeLinkPreviewResult> {
    this.calls.push({ method: 'previewMergeLinks', parameters: [request, signal] })
    return { generation: request.expectedVault.generation, source: null, destination: null, fingerprint: null,
      complete: false, requiresKeepSource: true, updates: [], cursor: null,
      scan: { bytes: 0, entries: 0, files: 0 }, truncated: true, truncationReason: 'entry-limit', warnings: [] }
  }

  async graph(args: Omit<VaultGraphRequest, 'expectedVault'>, expectedVault: VaultReference, signal: AbortSignal): Promise<VaultGraphResult> {
    this.calls.push({ method: 'graph', parameters: [args, expectedVault, signal] })
    return { complete: true, edges: [], generation: expectedVault.generation, missing: [], nodes: [], orphans: [], path: args.path ?? null, scan: { bytes: 0, entries: 0, files: 0 }, truncated: false, truncationReason: null, warnings: [] }
  }

  async facets(args: Omit<VaultFacetsRequest, 'expectedVault'>, expectedVault: VaultReference, signal: AbortSignal): Promise<VaultFacetsResult> {
    this.calls.push({ method: 'facets', parameters: [args, expectedVault, signal] })
    return { complete: true, cursor: null, generation: expectedVault.generation, properties: [], scan: { bytes: 0, entries: 0, files: 0 }, tags: [], truncated: false, truncationReason: null, warnings: [] }
  }

  async outline(args: Omit<VaultOutlineRequest, 'expectedVault'>, expectedVault: VaultReference, signal: AbortSignal): Promise<VaultOutlineResult> {
    this.calls.push({ method: 'outline', parameters: [args, expectedVault, signal] })
    return { generation: expectedVault.generation, headings: [], path: args.path, truncated: false }
  }

  async links(args: Omit<VaultLinksRequest, 'expectedVault'>, expectedVault: VaultReference, signal: AbortSignal): Promise<VaultLinksResult> {
    this.calls.push({ method: 'links', parameters: [args, expectedVault, signal] })
    return { backlinkDetails: [], backlinks: [], cursor: null, generation: expectedVault.generation, outgoing: [], outgoingDetails: [], path: args.path, scan: { bytes: 0, entries: 0, files: 0 }, tagRelations: [], truncated: false, truncationReason: null, warnings: [] }
  }

  async search(args: Omit<VaultSearchRequest, 'expectedVault'>, expectedVault: VaultReference, signal: AbortSignal): Promise<VaultSearchResult> {
    this.calls.push({ method: 'search', parameters: [args, expectedVault, signal] })
    return {
      cursor: null,
      generation: expectedVault.generation,
      matches: [{ kind: 'content', line: 1, path: 'Folder/Note.md', preview: 'match' }],
      query: args.query,
      scan: { bytes: 15, entries: 2, files: 1 },
      truncated: false,
      truncationReason: null,
      warnings: [],
    }
  }

  async listTree(request: ListTreeRequest, signal: AbortSignal): Promise<VaultTreePage> {
    this.calls.push({ method: 'listTree', parameters: [request, signal] })
    if (this.failure !== null) throw this.failure
    return this.treeResult
  }
}

async function loaded(): Promise<{
  context: Context
  gateway: TockTutorWorkbenchGateway
  runtime: FakeNoteVault
  workbenchFiber: Awaited<ReturnType<Context['plugin']>>
}> {
  const context = new Context()
  await context.plugin(FakeNoteVault)
  const workbenchFiber = await context.plugin(workbench)
  const gateway = context.get('tocktutorWorkbench')
  const runtime = context.get('noteVault')
  assert.ok(gateway instanceof TockTutorWorkbenchGateway)
  assert.ok(runtime instanceof FakeNoteVault)
  return { context, gateway, runtime, workbenchFiber }
}

const vault = Object.freeze({ generation: 7, id: `vault:${'c'.repeat(64)}` })

test('real runtime missing-file classification survives the Host read transport', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tocktutor-missing-read-'))
  const context = new Context()
  try {
    await writeFile(join(root, 'Present.md'), '# Present\n')
    await symlink(join(root, 'Missing.md'), join(root, 'Broken.md'))
    await context.plugin(NoteVaultRuntime, RuntimeConfig({ vaultRoot: root, stateRoot: null } as never))
    await context.plugin(workbench)
    const runtime = context.get('noteVault'), gateway = context.get('tocktutorWorkbench')
    assert.ok(runtime instanceof NoteVaultRuntime)
    assert.ok(gateway instanceof TockTutorWorkbenchGateway)
    const state = runtime.state
    assert.equal(state.active, true)
    if (!state.active) assert.fail('The fixture vault must be active.')
    const expected = { id: state.id, generation: state.generation }, signal = new AbortController().signal
    assert.equal((await gateway.openDocument('Present.md', expected, signal)).content, '# Present\n')
    for (const path of ['Missing.md', 'Missing Parent/Note.md']) await assert.rejects(gateway.openDocument(path, expected, signal), { code: 'not-found' })
    await assert.rejects(gateway.openDocument('Broken.md', expected, signal), { code: 'unsafe-target' })
  } finally {
    await context.fiber.dispose()
    await rm(root, { recursive: true, force: true })
  }
})

test('generated Remote declarations resolve with declaration checking enabled', () => {
  const declaration = fileURLToPath(new URL('../dist/typert.remote-client.d.ts', import.meta.url))
  const program = ts.createProgram([declaration], {
    noEmit: true, skipLibCheck: false, strict: true, allowImportingTsExtensions: true,
    target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext, jsx: ts.JsxEmit.ReactJSX,
  })
  const diagnostics = ts.getPreEmitDiagnostics(program)
  assert.equal(diagnostics.length, 0, ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCanonicalFileName: file => file, getCurrentDirectory: () => process.cwd(), getNewLine: () => '\n',
  }))
})

test('merge preview transport validates both revisions and forwards only a bounded read-only request', async () => {
  const state = await loaded()
  const request = { expectedVault: vault, sourcePath: 'Source.md', destinationPath: 'Folder/Dest.md',
    expectedSourceRevision: `file:${'a'.repeat(64)}`, expectedDestinationRevision: `file:${'b'.repeat(64)}`,
    mergedContent: '# Dest\n# Source\n', keepSource: false }
  const signal = new AbortController().signal
  try {
    const result = await state.gateway.previewMergeLinks(request, signal)
    assert.equal(result.generation, vault.generation)
    assert.deepEqual(state.runtime.calls, [{ method: 'previewMergeLinks', parameters: [request, signal] }])
    for (const invalid of [
      { expectedSourceRevision: 'invalid' }, { expectedDestinationRevision: 'invalid' },
      { sourcePath: '../Source.md' }, { destinationPath: 'Other.canvas' }, { destinationPath: 'SOURCE.md' },
      { mergedContent: 'x'.repeat(2_000_001) }, { keepSource: 'no' }, { cursor: '' }, { cursor: 'x'.repeat(513) },
      { expectedVault: { ...vault, generation: -1 } },
    ]) {
      await assert.rejects(state.gateway.previewMergeLinks({ ...request, ...invalid } as MergeLinkPreviewRequest, signal))
    }
    await assert.rejects(state.gateway.previewMergeLinks(request, AbortSignal.abort()), { name: 'AbortError' })
    assert.equal(state.runtime.calls.length, 1)
  } finally {
    await state.context.fiber.dispose()
  }
})

test('merge mutation transport requires exact confirmation and bounded identifiers', async () => {
  const state = await loaded(), signal = new AbortController().signal
  const id = 'merge-00000000-0000-4000-8000-000000000000'
  try {
    for (const method of ['prepareMerge', 'applyMerge', 'recoverMerge', 'listMerges']) Object.assign(state.runtime, { [method]: async (request: unknown, signal: AbortSignal) => {
      state.runtime.calls.push({ method, parameters: [request, signal] }); return { id, generation: 7 }
    } })
    const request = { id, expectedVault: vault, confirmed: true }
    await state.gateway.applyMerge(request, signal)
    await state.gateway.recoverMerge(request, signal)
    await state.gateway.listMerges({ expectedVault: vault }, signal)
    assert.equal(state.runtime.calls.length, 3)
    await assert.rejects(state.gateway.applyMerge({ ...request, confirmed: false }, signal))
    await assert.rejects(state.gateway.applyMerge({ ...request, id: '../x' }, signal))
    await assert.rejects(state.gateway.recoverMerge({ ...request, expectedVault: { ...vault, generation: -1 } }, signal))
    await assert.rejects(state.gateway.applyMerge(request, AbortSignal.abort()), { name: 'AbortError' })
    assert.equal(state.runtime.calls.length, 3)
  } finally { await state.context.fiber.dispose() }
})

test('registers only the accepted read/tree Remote methods and delegates exact records', async () => {
  const state = await loaded()
  try {
    assert.deepEqual(remoteMethods(state.gateway), [
      { invocation: { kind: 'direct' }, method: 'currentVault' },
      { invocation: { kind: 'direct' }, method: 'createManagedVault' },
      { invocation: { kind: 'direct' }, method: 'openSandboxVault' },
      { invocation: { kind: 'direct' }, method: 'inspectAttachment' },
      { invocation: { kind: 'direct' }, method: 'previewAttachment' },
      { invocation: { kind: 'direct' }, method: 'storeAttachment' },
      { invocation: { kind: 'direct' }, method: 'openDocument' },
      { invocation: { kind: 'direct' }, method: 'listTree' },
      { invocation: { kind: 'direct' }, method: 'createDocument' },
      { invocation: { kind: 'direct' }, method: 'saveDocument' },
      { invocation: { kind: 'direct' }, method: 'renameDocument' },
      { invocation: { kind: 'direct' }, method: 'previewMergeLinks' },
      { invocation: { kind: 'direct' }, method: 'prepareMerge' },
      { invocation: { kind: 'direct' }, method: 'applyMerge' },
      { invocation: { kind: 'direct' }, method: 'listMerges' },
      { invocation: { kind: 'direct' }, method: 'recoverMerge' },
      { invocation: { kind: 'direct' }, method: 'graph' },
      { invocation: { kind: 'direct' }, method: 'facets' },
      { invocation: { kind: 'direct' }, method: 'outline' },
      { invocation: { kind: 'direct' }, method: 'links' },
      { invocation: { kind: 'direct' }, method: 'search' },
      { invocation: { kind: 'direct' }, method: 'readDraft' },
      { invocation: { kind: 'direct' }, method: 'saveDraft' },
      { invocation: { kind: 'direct' }, method: 'clearDraft' },
      { invocation: { kind: 'direct' }, method: 'captureSnapshot' },
      { invocation: { kind: 'direct' }, method: 'clearSnapshots' },
      { invocation: { kind: 'direct' }, method: 'listSnapshots' },
      { invocation: { kind: 'direct' }, method: 'readSnapshot' },
      { invocation: { kind: 'direct' }, method: 'restoreSnapshot' },
      { invocation: { kind: 'direct' }, method: 'restoreSnapshotAsNew' },
      { invocation: { kind: 'direct' }, method: 'trashEntry' },
      { invocation: { kind: 'direct' }, method: 'listTrash' },
      { invocation: { kind: 'direct' }, method: 'restoreTrash' },
    ])

    const signal = new AbortController().signal
    assert.deepEqual(await state.gateway.currentVault(signal), {
      displayPath: '~/Documents/Research Vault',
      generation: 7,
      name: 'Research Vault',
      vault,
    })
    state.runtime.active = false
    assert.deepEqual(await state.gateway.currentVault(signal), { displayPath: null, generation: 7, name: null, vault: null })
    state.runtime.active = true
    assert.deepEqual(await state.gateway.createManagedVault({ expectedGeneration: 7, name: 'Class Notes' }, signal), { generation: 8, id: `vault:${'f'.repeat(64)}` })
    assert.deepEqual(await state.gateway.openSandboxVault({ expectedGeneration: 7 }, signal), {
      generation: 8,
      id: `vault:${'e'.repeat(64)}`,
    })
    assert.equal((await state.gateway.inspectAttachment('Attachments/a.png', vault, signal)).size, 3)
    assert.equal((await state.gateway.previewAttachment('Attachments/a.png', vault, signal)).dataBase64, 'AQID')
    assert.equal((await state.gateway.storeAttachment({ dataBase64: 'AQID', expectedVault: vault, path: 'Attachments/b.png' }, signal)).status, 'stored')
    assert.strictEqual(await state.gateway.openDocument('Folder/Note.md', vault, signal), state.runtime.openResult)
    assert.strictEqual(await state.gateway.listTree({ expectedVault: vault, limit: 20 }, signal), state.runtime.treeResult)
    assert.equal((await state.gateway.renameDocument({ expectedRevision: `file:${'b'.repeat(64)}`, expectedVault: vault, fromPath: 'Folder/Note.md', toPath: 'Folder/Renamed.md' }, signal)).path, 'Folder/Renamed.md')
    assert.equal((await state.gateway.graph({ expectedVault: vault, limit: 100, scope: 'global' }, signal)).complete, true)
    assert.equal((await state.gateway.facets({ expectedVault: vault, limit: 100 }, signal)).complete, true)
    assert.equal((await state.gateway.outline({ expectedVault: vault, includeFootnotes: true, path: 'Folder/Note.md' }, signal)).path, 'Folder/Note.md')
    assert.equal((await state.gateway.links({ expectedVault: vault, includeUnlinked: true, path: 'Folder/Note.md' }, signal)).path, 'Folder/Note.md')
    assert.equal((await state.gateway.search({ expectedVault: vault, mode: 'query', query: 'match' }, signal)).matches.length, 1)
    assert.deepEqual(state.runtime.calls, [
      { method: 'activeVaultName', parameters: [] },
      { method: 'activeVaultDisplayPath', parameters: [] },
      { method: 'synchronizeDesktopSelection', parameters: [signal] },
      { method: 'createManagedVault', parameters: ['Class Notes', 7] },
      { method: 'synchronizeDesktopSelection', parameters: [signal] },
      { method: 'openSandboxVault', parameters: [7] },
      { method: 'synchronizeDesktopSelection', parameters: [signal] },
      { method: 'inspectAttachment', parameters: ['Attachments/a.png', vault, signal] },
      { method: 'previewAttachment', parameters: ['Attachments/a.png', vault, signal] },
      { method: 'storeAttachment', parameters: [{ data: Buffer.from([1, 2, 3]), expectedVault: vault, path: 'Attachments/b.png' }, signal] },
      { method: 'openDocument', parameters: ['Folder/Note.md', vault, signal] },
      { method: 'listTree', parameters: [{ expectedVault: vault, limit: 20 }, signal] },
      { method: 'moveFileWithLinkRewrite', parameters: [{ expectedRevision: `file:${'b'.repeat(64)}`, expectedVault: vault, fromPath: 'Folder/Note.md', toPath: 'Folder/Renamed.md' }, signal] },
      { method: 'graph', parameters: [{ limit: 100, scope: 'global' }, vault, signal] },
      { method: 'facets', parameters: [{ limit: 100 }, vault, signal] },
      { method: 'outline', parameters: [{ includeFootnotes: true, path: 'Folder/Note.md' }, vault, signal] },
      { method: 'links', parameters: [{ includeUnlinked: true, path: 'Folder/Note.md' }, vault, signal] },
      { method: 'search', parameters: [{ mode: 'query', query: 'match' }, vault, signal] },
    ])
  } finally {
    await state.context.fiber.dispose()
  }
})

test('fails closed on browser-controlled path, vault, cursor, and limit values', async () => {
  const state = await loaded()
  try {
    const signal = new AbortController().signal
    const invalidVaults: VaultReference[] = [
      { generation: -1, id: vault.id },
      { generation: 7, id: '' },
      { generation: 7, id: 'not-a-vault-id' },
    ]
    for (const invalidVault of invalidVaults) {
      await assert.rejects(state.gateway.openDocument('Folder/Note.md', invalidVault, signal), /vault reference/i)
    }
    for (const path of ['', '/absolute.md', '../escape.md', 'Folder\\Note.md', 'note.txt']) {
      await assert.rejects(state.gateway.openDocument(path, vault, signal), /document path/i)
    }
    await assert.rejects(state.gateway.renameDocument({ expectedRevision: 'bad', expectedVault: vault, fromPath: 'Folder/Note.md', toPath: '../escape.md' }, signal), /path|revision/i)
    await assert.rejects(state.gateway.previewAttachment('../escape.png', vault, signal), /attachment path/i)
    await assert.rejects(state.gateway.storeAttachment({ dataBase64: '***', expectedVault: vault, path: 'Attachments/a.png' }, signal), /base64/i)
    await assert.rejects(
      state.gateway.listTree({ expectedVault: vault, cursor: 'x'.repeat(MAX_TREE_CURSOR_LENGTH + 1) }, signal),
      /cursor/i,
    )
    await assert.rejects(state.gateway.graph({ depth: 4, expectedVault: vault, scope: 'local' }, signal), /depth/i)
    await assert.rejects(state.gateway.facets({ expectedVault: vault, limit: 1_001 }, signal), /limit/i)
    await assert.rejects(state.gateway.outline({ expectedVault: vault, path: '../escape.md' }, signal), /path/i)
    await assert.rejects(state.gateway.links({ expectedVault: vault, includeUnlinked: 'yes' as unknown as boolean, path: 'Folder/Note.md' }, signal), /Boolean/i)
    await assert.rejects(state.gateway.createManagedVault({ expectedGeneration: 7, name: '../escape' }, signal), /name/i)
    await assert.rejects(state.gateway.search({ expectedVault: vault, query: 'x'.repeat(1_001) }, signal), /query/i)
    await assert.rejects(state.gateway.search({ expectedVault: vault, query: 'ok', regex: 'yes' as unknown as boolean }, signal), /Boolean/i)
    await assert.rejects(state.gateway.openSandboxVault({ expectedGeneration: -1 }, signal), /generation/i)
    for (const limit of [0, MAX_TREE_PAGE_SIZE + 1, 1.5]) {
      await assert.rejects(state.gateway.listTree({ expectedVault: vault, limit }, signal), /limit/i)
    }
    assert.equal(state.runtime.calls.length, 0)
  } finally {
    await state.context.fiber.dispose()
  }
})

test('preserves runtime failures and withdraws the gateway with its owning fiber', async () => {
  const state = await loaded()
  const failure = Object.assign(new Error('stale vault'), { code: 'stale-vault' })
  state.runtime.failure = failure
  await assert.rejects(
    state.gateway.openDocument('Folder/Note.md', vault, new AbortController().signal),
    error => error === failure,
  )

  await state.workbenchFiber.dispose()
  assert.equal(state.context.get('tocktutorWorkbench'), undefined)
  assert.ok(state.context.get('noteVault') instanceof FakeNoteVault)
  await state.context.fiber.dispose()
})

test('keeps the Host gateway free of filesystem authority and unreleased methods', async () => {
  const source = await readFile(new URL('../src/host-read.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /node:|electron|window\.electronAPI|child_process/u)
  assert.doesNotMatch(source, /\b(?:readFile|writeFile|renameSync|unlink|rm|mkdir|lstat)\b/u)
})
