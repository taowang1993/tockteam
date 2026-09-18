import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { Context } from '@deepseek-ai/cordis'
import { READ_TOOLS } from '@pennivo/mcp-server'
import NoteVaultRuntime, { Config as RuntimeConfig } from 'tockbot-note-runtime'
import type {
  ListTreeRequest,
  NoteVaultState,
  OpenDocumentResult,
  VaultReference,
  VaultTreePage,
} from 'tockbot-note-runtime'
import {
  PennivoReadAdapter,
  ReadToolError,
  REVIEWED_PENNIVO_READ_TOOLS,
  type ReadBinding,
  type RuntimeDocumentReader,
} from '../src/read-tools.ts'

const binding: ReadBinding = {
  vaultId: 'vault:1234567890abcdef',
  vaultGeneration: 7,
  childInstanceId: 'child-1234567890abcdef',
  turnId: 'turn-1234567890abcdef',
}

const descriptor: OpenDocumentResult = {
  path: 'folder/note.md',
  content: 'safe note',
  digest: `sha256:${'a'.repeat(64)}`,
  revision: `file:${'b'.repeat(64)}`,
  generation: 7,
}

class FakeRuntime implements RuntimeDocumentReader {
  state: NoteVaultState = { active: true, id: binding.vaultId, generation: binding.vaultGeneration }
  calls: Array<{ path: string; vault: VaultReference; signal: AbortSignal }> = []
  result: OpenDocumentResult = descriptor
  failure: unknown = null
  pending: Promise<OpenDocumentResult> | null = null

  listTree(_request: ListTreeRequest, _signal: AbortSignal): Promise<VaultTreePage> {
    throw new Error('unexpected tree read')
  }

  async openDocument(path: string, vault: VaultReference, signal: AbortSignal): Promise<OpenDocumentResult> {
    this.calls.push({ path, vault, signal })
    if (this.failure !== null) throw this.failure
    return this.pending ?? this.result
  }
}

function expectCode(error: unknown, code: string): boolean {
  return error instanceof ReadToolError && error.code === code
}

test('the accepted runtime supplies bounded reads and recovery listings without exposing roots', async () => {
  const root = await mkdtemp(join(tmpdir(), 'assistant-runtime-read-'))
  const stateRoot = await mkdtemp(join(tmpdir(), 'assistant-runtime-state-'))
  const value = `fixture-${Date.now().toString(36)}`
  await Promise.all([
    writeFile(join(root, 'note.md'), value),
    writeFile(join(root, 'trash.md'), 'trash fixture'),
  ])
  const context = new Context()
  try {
    await context.plugin(NoteVaultRuntime, RuntimeConfig({ stateRoot, vaultRoot: root } as never))
    const runtime = context.get('noteVault') as unknown as NoteVaultRuntime
    const state = runtime.state
    assert.equal(state.active, true)
    if (!state.active) assert.fail('fixture vault must be active')
    const adapter = new PennivoReadAdapter(runtime, () => true)
    const outcome = await adapter.execute('read_file', { path: 'note.md' }, {
      vaultId: state.id,
      vaultGeneration: state.generation,
      childInstanceId: 'child-runtime-integration',
      turnId: 'turn-runtime-integration',
    }, new AbortController().signal)

    assert.equal(outcome.result.content[0].text, value)
    if (outcome.source === null) assert.fail('read_file must retain a source identity')
    assert.equal(outcome.source.path, 'note.md')
    const listed = await adapter.execute('list_files', {}, {
      vaultId: state.id,
      vaultGeneration: state.generation,
      childInstanceId: 'child-runtime-integration',
      turnId: 'turn-runtime-integration',
    }, new AbortController().signal)
    const tree = JSON.parse(listed.result.content[0].text) as { entries: Array<{ path: string }> }
    assert.equal(tree.entries.some(entry => entry.path === 'note.md'), true)

    const expectedVault = { id: state.id, generation: state.generation }
    await runtime.saveDocument({
      content: `${value}-updated`,
      expectedRevision: outcome.source.revision,
      expectedVault,
      path: 'note.md',
    }, new AbortController().signal)
    const snapshots = await adapter.execute('list_snapshots', { path: 'note.md' }, {
      vaultId: state.id,
      vaultGeneration: state.generation,
      childInstanceId: 'child-runtime-integration',
      turnId: 'turn-runtime-integration',
    }, new AbortController().signal)
    const history = JSON.parse(snapshots.result.content[0].text) as { snapshots: unknown[] }
    assert.equal(history.snapshots.length, 1)

    const trashDocument = await runtime.openDocument(
      'trash.md', expectedVault, new AbortController().signal,
    )
    await runtime.trashEntry({
      expectedRevision: trashDocument.revision,
      expectedVault,
      path: 'trash.md',
    }, new AbortController().signal)
    const trash = await adapter.execute('list_trash', {}, {
      vaultId: state.id,
      vaultGeneration: state.generation,
      childInstanceId: 'child-runtime-integration',
      turnId: 'turn-runtime-integration',
    }, new AbortController().signal)
    const deleted = JSON.parse(trash.result.content[0].text) as {
      entries: Array<{ originalPath: string }>
    }
    assert.deepEqual(deleted.entries.map(entry => entry.originalPath), ['trash.md'])
    assert.doesNotMatch(
      JSON.stringify({ outcome, listed, snapshots, trash }),
      new RegExp(root.replaceAll('/', '\\/'), 'u'),
    )
  } finally {
    await context.fiber.dispose()
    await Promise.all([
      rm(root, { recursive: true, force: true }),
      rm(stateRoot, { recursive: true, force: true }),
    ])
  }
})

test('the adapter tracks the exact reviewed Pennivo read catalog', () => {
  assert.deepEqual(REVIEWED_PENNIVO_READ_TOOLS, READ_TOOLS)
})

test('read_file returns bounded Pennivo text and keeps descriptor identity Host-private', async () => {
  const runtime = new FakeRuntime()
  runtime.result = {
    ...descriptor,
    content: `note Bearer secret-token /Users/max/private sk_${'q'.repeat(20)}\n${'x'.repeat(40_000)}`,
  }
  const adapter = new PennivoReadAdapter(runtime, () => true)

  const outcome = await adapter.execute('read_file', { path: 'folder/note.md' }, binding, new AbortController().signal)

  assert.deepEqual(runtime.calls.map(call => ({ path: call.path, vault: call.vault })), [{
    path: 'folder/note.md',
    vault: { id: binding.vaultId, generation: binding.vaultGeneration },
  }])
  if (outcome.source === null) assert.fail('read_file must retain a source identity')
  assert.deepEqual(outcome.source, {
    path: descriptor.path,
    digest: descriptor.digest,
    revision: descriptor.revision,
    generation: descriptor.generation,
  })
  assert.equal(outcome.result.content[0]?.type, 'text')
  assert.ok(outcome.result.content[0]!.text.length <= 32_000)
  assert.equal(outcome.truncated, true)
  assert.doesNotMatch(JSON.stringify(outcome.result), /secret-token|\/Users\/max|sk_q/u)
  assert.doesNotMatch(JSON.stringify(outcome.result), /sha256:|file:/u)
})

test('read_file validates a strict bounded relative-path argument before runtime access', async () => {
  const invalid: unknown[] = [
    null,
    {},
    { path: '' },
    { path: '../note.md' },
    { path: '/Users/max/note.md' },
    { path: 'C:\\note.md' },
    { path: 'folder\\note.md' },
    { path: 'note.md\0secret' },
    { path: `${'x'.repeat(4_097)}.md` },
    { path: 'note.md', extra: true },
  ]

  for (const args of invalid) {
    const runtime = new FakeRuntime()
    const adapter = new PennivoReadAdapter(runtime, () => true)
    await assert.rejects(
      adapter.execute('read_file', args, binding, new AbortController().signal),
      error => expectCode(error, 'INVALID_ARGUMENTS'),
    )
    assert.equal(runtime.calls.length, 0)
  }
})

test('write, unknown, and not-yet-published read tools fail closed', async () => {
  const runtime = new FakeRuntime()
  const adapter = new PennivoReadAdapter(runtime, () => true)

  for (const tool of ['write_file', 'totally_unknown']) {
    await assert.rejects(
      adapter.execute(tool, { path: 'folder/note.md' }, binding, new AbortController().signal),
      error => expectCode(error, 'TOOL_DENIED'),
    )
  }
  for (const tool of ['list_workspaces']) {
    await assert.rejects(
      adapter.execute(tool, {}, binding, new AbortController().signal),
      error => expectCode(error, 'TOOL_UNAVAILABLE'),
    )
  }
  assert.equal(runtime.calls.length, 0)
})

test('vault, child, turn, and late-result changes fail closed', async () => {
  for (const stale of ['vault-before', 'identity-before', 'late-vault', 'late-child-or-turn']) {
    const runtime = new FakeRuntime()
    let current = true
    let resolve!: (value: OpenDocumentResult) => void
    if (stale === 'vault-before') runtime.state = { active: false, generation: 7 }
    if (stale === 'identity-before') {
      runtime.state = { active: true, id: 'vault:different', generation: 8 }
    }
    if (stale.startsWith('late')) {
      runtime.pending = new Promise<OpenDocumentResult>(accept => { resolve = accept })
    }
    const adapter = new PennivoReadAdapter(runtime, candidate => (
      current
      && candidate.childInstanceId === binding.childInstanceId
      && candidate.turnId === binding.turnId
    ))
    const read = adapter.execute('read_file', { path: 'folder/note.md' }, binding, new AbortController().signal)
    if (stale === 'late-vault') {
      runtime.state = { active: true, id: binding.vaultId, generation: 8 }
      resolve(descriptor)
    } else if (stale === 'late-child-or-turn') {
      current = false
      resolve(descriptor)
    }
    await assert.rejects(read, error => expectCode(error, 'STALE_CONTEXT'))
  }
})

test('abort and runtime errors are typed without leaking raw details', async () => {
  const runtime = new FakeRuntime()
  const adapter = new PennivoReadAdapter(runtime, () => true)
  const aborted = new AbortController()
  aborted.abort(`Bearer private /Users/max sk_${'z'.repeat(20)}`)
  await assert.rejects(
    adapter.execute('read_file', { path: 'folder/note.md' }, binding, aborted.signal),
    error => expectCode(error, 'ABORTED') && !String(error).includes('/Users/max'),
  )

  for (const [failure, code] of [
    [Object.assign(new Error('Bearer private /Users/max'), {
      name: 'NoteVaultError',
      code: 'unsafe-target',
    }), 'READ_DENIED'],
    [new Error(`sk_${'z'.repeat(20)} /private/tmp/vault`), 'RUNTIME_FAILURE'],
  ] as const) {
    runtime.failure = failure
    await assert.rejects(
      adapter.execute('read_file', { path: 'folder/note.md' }, binding, new AbortController().signal),
      error => expectCode(error, code)
        && !String(error).includes('/Users/max')
        && !String(error).includes('/private/tmp')
        && !String(error).includes('sk_'),
    )
  }
})

test('malformed runtime results fail closed instead of crossing the model boundary', async () => {
  const malformed: OpenDocumentResult[] = [
    { ...descriptor, path: '../outside.md' },
    { ...descriptor, digest: 'sha256:nope' },
    { ...descriptor, revision: '/Users/max/revision' },
    { ...descriptor, generation: 8 },
    { ...descriptor, content: 'x'.repeat(2_097_153) },
  ]
  for (const result of malformed) {
    const runtime = new FakeRuntime()
    runtime.result = result
    const adapter = new PennivoReadAdapter(runtime, () => true)
    await assert.rejects(
      adapter.execute('read_file', { path: 'folder/note.md' }, binding, new AbortController().signal),
      error => expectCode(error, 'INVALID_RESULT'),
    )
  }
})
