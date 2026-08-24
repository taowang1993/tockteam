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
  type VaultReference,
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

  async openDocument(
    path: string,
    expectedVault: VaultReference,
    signal: AbortSignal,
  ): Promise<OpenDocumentResult> {
    this.calls.push({ method: 'openDocument', parameters: [path, expectedVault, signal] })
    if (this.failure !== null) throw this.failure
    return this.openResult
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
      { invocation: { kind: 'direct' }, method: 'openDocument' },
      { invocation: { kind: 'direct' }, method: 'listTree' },
      { invocation: { kind: 'direct' }, method: 'createDocument' },
      { invocation: { kind: 'direct' }, method: 'saveDocument' },
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
    assert.strictEqual(await state.gateway.openDocument('Folder/Note.md', vault, signal), state.runtime.openResult)
    assert.strictEqual(await state.gateway.listTree({ expectedVault: vault, limit: 20 }, signal), state.runtime.treeResult)
    assert.deepEqual(state.runtime.calls, [
      { method: 'openDocument', parameters: ['Folder/Note.md', vault, signal] },
      { method: 'listTree', parameters: [{ expectedVault: vault, limit: 20 }, signal] },
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
  assert.doesNotMatch(source, /\b(?:save|read|clear)Draft\b|\b(?:inspect|preview|store)Attachment\b|\b(?:move|duplicate)(?:File|Folder)\b/u)
})
