import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { Context } from '@deepseek-ai/cordis'
import NoteVaultRuntime, {
  Config as RuntimeConfig,
  type ListTreeRequest,
  type NoteVaultState,
  type OpenDocumentResult,
  type VaultInspectionRuntimeResult,
  type VaultOutlineArgs,
  type VaultOutlineResult,
  type VaultReference,
  type VaultTreePage,
} from 'tockbot-note-runtime'
import {
  PennivoReadAdapter,
  ReadToolError,
  type ReadBinding,
  type RuntimeDocumentReader,
} from '../src/read-tools.ts'

const binding: ReadBinding = {
  vaultId: 'vault:1234567890abcdef',
  vaultGeneration: 7,
  childInstanceId: 'child-1234567890abcdef',
  turnId: 'turn-1234567890abcdef',
}

type Outline = VaultInspectionRuntimeResult<VaultOutlineResult>

function outline(overrides: Partial<Outline> = {}): Outline {
  return {
    generation: binding.vaultGeneration,
    headings: [],
    path: 'notes/a.md',
    truncated: false,
    ...overrides,
  }
}

class FakeOutlineRuntime implements RuntimeDocumentReader {
  state: NoteVaultState = { active: true, id: binding.vaultId, generation: binding.vaultGeneration }
  calls: Array<{ args: VaultOutlineArgs; vault: VaultReference; signal: AbortSignal }> = []
  result: Outline = outline()
  failure: unknown = null
  pending: Promise<Outline> | null = null

  listTree(_request: ListTreeRequest, _signal: AbortSignal): Promise<VaultTreePage> {
    throw new Error('unexpected tree read')
  }

  openDocument(_path: string, _vault: VaultReference, _signal: AbortSignal): Promise<OpenDocumentResult> {
    throw new Error('unexpected document read')
  }

  async outline(args: VaultOutlineArgs, vault: VaultReference, signal: AbortSignal): Promise<Outline> {
    this.calls.push({ args, vault, signal })
    if (this.failure !== null) throw this.failure
    return this.pending ?? this.result
  }
}

function expectCode(error: unknown, code: string): boolean {
  return error instanceof ReadToolError && error.code === code
}

async function getOutline(
  runtime: RuntimeDocumentReader,
  args: unknown,
  current: (candidate: ReadBinding) => boolean = () => true,
  signal = new AbortController().signal,
) {
  const outcome = await new PennivoReadAdapter(runtime, current).execute('get_outline', args, binding, signal)
  assert.equal(outcome.source, null)
  assert.ok(outcome.result.content[0].text.length <= 32_000)
  return {
    outcome,
    payload: JSON.parse(outcome.result.content[0].text) as Record<string, unknown>,
  }
}

test('get_outline maps one relative path to the bounded runtime outline and Pennivo headings', async () => {
  const runtime = new FakeOutlineRuntime()
  runtime.result = outline({
    headings: [
      { level: 1, line: 1, selector: 'Title', text: 'Title' },
      { level: 2, line: 7, selector: 'Details', text: 'Details' },
    ],
  })

  const { outcome, payload } = await getOutline(runtime, { path: 'notes/a.md' })

  assert.deepEqual(runtime.calls.map(call => ({ args: call.args, vault: call.vault })), [{
    args: { path: 'notes/a.md', limit: 200 },
    vault: { id: binding.vaultId, generation: binding.vaultGeneration },
  }])
  assert.deepEqual(payload, {
    path: 'notes/a.md',
    headings: [
      { level: 1, text: 'Title', line: 1 },
      { level: 2, text: 'Details', line: 7 },
    ],
    truncated: false,
  })
  assert.equal(outcome.truncated, false)
  assert.doesNotMatch(JSON.stringify(payload), /selector/u)
})

test('get_outline rejects malformed and unsafe arguments before runtime access', async () => {
  for (const args of [null, {}, { path: '' }, { path: '../a.md' }, { path: '/Users/max/a.md' }, { path: 'a.md', extra: true }]) {
    const runtime = new FakeOutlineRuntime()
    await assert.rejects(getOutline(runtime, args), error => expectCode(error, 'INVALID_ARGUMENTS'))
    assert.equal(runtime.calls.length, 0)
  }
})

test('get_outline bounds valid headings as parseable JSON and preserves truthful truncation', async () => {
  const runtime = new FakeOutlineRuntime()
  runtime.result = outline({
    headings: Array.from({ length: 200 }, (_, index) => ({
      level: 2,
      line: index + 1,
      selector: `section-${index}`,
      text: `${index.toString().padStart(3, '0')} ${'x'.repeat(1_000)}`,
    })),
  })
  const { outcome, payload } = await getOutline(runtime, { path: 'notes/a.md' })
  assert.equal(outcome.truncated, true)
  assert.equal(payload.truncated, true)
  assert.ok((payload.headings as unknown[]).length < 200)
})

test('get_outline rejects malformed runtime headings and unrequested metadata', async () => {
  const malformed: Outline[] = [
    outline({ generation: 8 }),
    outline({ path: '../a.md' }),
    outline({ headings: [{ level: 0, line: 1, selector: 'x', text: 'x' }] }),
    outline({ headings: [{ level: 1, line: 0, selector: 'x', text: 'x' }] }),
    outline({ headings: [{ level: 1, line: 2, selector: 'x', text: 'x' }, { level: 2, line: 1, selector: 'y', text: 'y' }] }),
    outline({ headings: [{ level: 1, line: 1, selector: 'x'.repeat(1_025), text: 'x' }] }),
    outline({ headings: [{ level: 1, line: 1, selector: 'x', text: 'x'.repeat(1_025) }] }),
    { ...outline(), footnotes: [{ ordinal: 1, kind: 'inline', content: 'private', line: 1 }] },
    { ...outline(), queries: [{ ordinal: 1, query: 'private', line: 1, lineEnd: 2, fence: '```query' }] },
  ]
  for (const result of malformed) {
    const runtime = new FakeOutlineRuntime()
    runtime.result = result
    await assert.rejects(getOutline(runtime, { path: 'notes/a.md' }), error => expectCode(error, 'INVALID_RESULT'))
  }
})

test('get_outline sanitizes runtime failure, cancellation, and late binding changes', async () => {
  const failed = new FakeOutlineRuntime()
  failed.failure = new Error('Bearer top-secret /Users/max/private')
  await assert.rejects(
    getOutline(failed, { path: 'notes/a.md' }),
    error => expectCode(error, 'RUNTIME_FAILURE') && !String(error).includes('/Users/max'),
  )
  const aborted = new AbortController()
  aborted.abort('Bearer top-secret /Users/max')
  await assert.rejects(
    getOutline(new FakeOutlineRuntime(), { path: 'notes/a.md' }, () => true, aborted.signal),
    error => expectCode(error, 'ABORTED'),
  )
  const late = new FakeOutlineRuntime()
  let current = true
  let resolve!: (result: Outline) => void
  late.pending = new Promise<Outline>(accept => { resolve = accept })
  const pending = getOutline(late, { path: 'notes/a.md' }, () => current)
  current = false
  resolve(outline({ headings: [{ level: 1, line: 1, selector: 'Title', text: 'Title' }] }))
  await assert.rejects(pending, error => expectCode(error, 'STALE_CONTEXT'))
})

test('get_outline uses the real noteVault outline seam and ignores fenced headings', async () => {
  const root = await mkdtemp(join(tmpdir(), 'assistant-outline-vault-'))
  const stateRoot = await mkdtemp(join(tmpdir(), 'assistant-outline-state-'))
  const context = new Context()
  try {
    await writeFile(join(root, 'outline.md'), '# Visible\n```md\n## Hidden\n```\n## Also Visible\n', 'utf8')
    await context.plugin(NoteVaultRuntime, RuntimeConfig({ stateRoot, vaultRoot: root } as never))
    const runtime = context.get('noteVault') as unknown as NoteVaultRuntime
    const state = runtime.state
    assert.equal(state.active, true)
    if (!state.active) throw new Error('expected active vault')
    const realBinding: ReadBinding = { ...binding, vaultId: state.id, vaultGeneration: state.generation }
    const adapter = new PennivoReadAdapter(runtime, candidate => (
      candidate.vaultId === state.id && candidate.vaultGeneration === state.generation
    ))
    const outcome = await adapter.execute('get_outline', { path: 'outline.md' }, realBinding, new AbortController().signal)
    const text = outcome.result.content[0].text
    assert.match(text, /Visible/u)
    assert.match(text, /Also Visible/u)
    assert.doesNotMatch(text, /Hidden/u)
    assert.doesNotMatch(text, new RegExp(root.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'))
  } finally {
    await context.fiber.dispose()
    await rm(root, { recursive: true, force: true })
    await rm(stateRoot, { recursive: true, force: true })
  }
})
