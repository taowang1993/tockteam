import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { Context, Service } from '@deepseek-ai/cordis'
import { remoteMethods } from '@deepseek-ai/dsh-typert-protocol'
import * as workbench from '../dist/index.js'
import {
  MAX_TREE_CURSOR_LENGTH,
  MAX_TREE_PAGE_SIZE,
  TockTutorWorkbenchGateway,
  type ListTreeRequest,
  type OpenDocumentResult,
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
  recent = [
    { id: vault.id, lastOpenedAt: 7 },
    { id: `vault:${'d'.repeat(64)}`, lastOpenedAt: 6 },
  ]

  constructor(ctx: Context) {
    super(ctx, 'noteVault')
  }

  get state() {
    return this.active
      ? { active: true as const, generation: vault.generation, id: vault.id }
      : { active: false as const, generation: vault.generation }
  }

  listRecentVaults() {
    this.calls.push({ method: 'listRecentVaults', parameters: [] })
    return this.recent
  }

  activateRecentVault(id: string, expectedGeneration: number) {
    this.calls.push({ method: 'activateRecentVault', parameters: [id, expectedGeneration] })
    return { active: true as const, generation: expectedGeneration + 1, id }
  }

  removeRecentVault(id: string, expectedGeneration: number) {
    this.calls.push({ method: 'removeRecentVault', parameters: [id, expectedGeneration] })
    this.recent = this.recent.filter(vault => vault.id !== id)
    return this.recent
  }

  openSandboxVault(expectedGeneration: number) {
    this.calls.push({ method: 'openSandboxVault', parameters: [expectedGeneration] })
    return { active: true as const, generation: expectedGeneration + 1, id: `vault:${'e'.repeat(64)}` }
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

test('registers only the accepted read/tree Remote methods and delegates exact records', async () => {
  const state = await loaded()
  try {
    assert.deepEqual(remoteMethods(state.gateway), [
      { invocation: { kind: 'direct' }, method: 'currentVault' },
      { invocation: { kind: 'direct' }, method: 'listRecentVaults' },
      { invocation: { kind: 'direct' }, method: 'activateRecentVault' },
      { invocation: { kind: 'direct' }, method: 'removeRecentVault' },
      { invocation: { kind: 'direct' }, method: 'openSandboxVault' },
      { invocation: { kind: 'direct' }, method: 'openDocument' },
      { invocation: { kind: 'direct' }, method: 'listTree' },
      { invocation: { kind: 'direct' }, method: 'createDocument' },
      { invocation: { kind: 'direct' }, method: 'saveDocument' },
      { invocation: { kind: 'direct' }, method: 'outline' },
      { invocation: { kind: 'direct' }, method: 'links' },
      { invocation: { kind: 'direct' }, method: 'search' },
      { invocation: { kind: 'direct' }, method: 'readDraft' },
      { invocation: { kind: 'direct' }, method: 'saveDraft' },
      { invocation: { kind: 'direct' }, method: 'clearDraft' },
      { invocation: { kind: 'direct' }, method: 'listSnapshots' },
      { invocation: { kind: 'direct' }, method: 'readSnapshot' },
      { invocation: { kind: 'direct' }, method: 'restoreSnapshotAsNew' },
      { invocation: { kind: 'direct' }, method: 'trashEntry' },
      { invocation: { kind: 'direct' }, method: 'listTrash' },
      { invocation: { kind: 'direct' }, method: 'restoreTrash' },
    ])

    const signal = new AbortController().signal
    assert.deepEqual(await state.gateway.currentVault(signal), vault)
    state.runtime.active = false
    assert.equal(await state.gateway.currentVault(signal), null)
    state.runtime.active = true
    assert.deepEqual(await state.gateway.listRecentVaults(signal), { generation: 7, vaults: state.runtime.recent })
    assert.deepEqual(await state.gateway.activateRecentVault({ expectedGeneration: 7, id: state.runtime.recent[1]!.id }, signal), {
      generation: 8,
      id: state.runtime.recent[1]!.id,
    })
    assert.equal((await state.gateway.removeRecentVault({ expectedGeneration: 7, id: state.runtime.recent[1]!.id }, signal)).vaults.length, 1)
    assert.deepEqual(await state.gateway.openSandboxVault({ expectedGeneration: 7 }, signal), {
      generation: 8,
      id: `vault:${'e'.repeat(64)}`,
    })
    assert.strictEqual(await state.gateway.openDocument('Folder/Note.md', vault, signal), state.runtime.openResult)
    assert.strictEqual(await state.gateway.listTree({ expectedVault: vault, limit: 20 }, signal), state.runtime.treeResult)
    assert.equal((await state.gateway.outline({ expectedVault: vault, includeFootnotes: true, path: 'Folder/Note.md' }, signal)).path, 'Folder/Note.md')
    assert.equal((await state.gateway.links({ expectedVault: vault, includeUnlinked: true, path: 'Folder/Note.md' }, signal)).path, 'Folder/Note.md')
    assert.equal((await state.gateway.search({ expectedVault: vault, mode: 'query', query: 'match' }, signal)).matches.length, 1)
    assert.deepEqual(state.runtime.calls, [
      { method: 'listRecentVaults', parameters: [] },
      { method: 'activateRecentVault', parameters: [`vault:${'d'.repeat(64)}`, 7] },
      { method: 'removeRecentVault', parameters: [`vault:${'d'.repeat(64)}`, 7] },
      { method: 'openSandboxVault', parameters: [7] },
      { method: 'openDocument', parameters: ['Folder/Note.md', vault, signal] },
      { method: 'listTree', parameters: [{ expectedVault: vault, limit: 20 }, signal] },
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
    await assert.rejects(
      state.gateway.listTree({ expectedVault: vault, cursor: 'x'.repeat(MAX_TREE_CURSOR_LENGTH + 1) }, signal),
      /cursor/i,
    )
    await assert.rejects(state.gateway.outline({ expectedVault: vault, path: '../escape.md' }, signal), /path/i)
    await assert.rejects(state.gateway.links({ expectedVault: vault, includeUnlinked: 'yes' as unknown as boolean, path: 'Folder/Note.md' }, signal), /Boolean/i)
    await assert.rejects(state.gateway.search({ expectedVault: vault, query: 'x'.repeat(1_001) }, signal), /query/i)
    await assert.rejects(state.gateway.search({ expectedVault: vault, query: 'ok', regex: 'yes' as unknown as boolean }, signal), /Boolean/i)
    await assert.rejects(state.gateway.activateRecentVault({ expectedGeneration: -1, id: vault.id }, signal), /generation/i)
    await assert.rejects(state.gateway.removeRecentVault({ expectedGeneration: 7, id: 'unsafe' }, signal), /recent vault/i)
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
  assert.doesNotMatch(source, /\b(?:inspect|preview|store)Attachment\b|\b(?:move|duplicate)(?:File|Folder)\b/u)
})
