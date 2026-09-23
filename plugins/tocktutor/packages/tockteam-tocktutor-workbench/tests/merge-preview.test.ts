import assert from 'node:assert/strict'
import test from 'node:test'
import { createVaultInspection } from 'tockbot-note-vault/inspection'
import { previewNoteMerge, type NoteMergePreviewInput } from '../src/merge-preview.ts'
import type { MergeLinkPreviewRequest, MergeLinkPreviewResult } from '../src/types.ts'

function fixture(sourceContent = '# Source\r\n[Image](asset.png)\r\n', destinationContent = '# Dest\r\n', referrer = '[[Notes/Source]]\n') {
  const contents = new Map([
    ['Notes/Source.md', sourceContent],
    ['Archive/Dest.md', destinationContent],
    ['A.md', referrer], ['B.md', '[Source](Notes/Source.md)\n'],
  ])
  const entries = [...contents].sort(([a], [b]) => a.localeCompare(b)).map(([path, content], index) => ({
    path, kind: 'document' as const, createdMs: 1, modifiedMs: 1, size: Buffer.byteLength(content),
    revision: `file:${String(index + 1).repeat(64)}`,
  }))
  const inspection = createVaultInspection({
    async list() { return { entries, cursor: null, complete: true, truncated: false, truncationReason: null, warnings: [] } },
    async read(path) { return { path, content: contents.get(path)!, revision: entries.find(entry => entry.path === path)!.revision } },
  }, { maxReadBytes: 2_000_000, maxSearchFileBytes: 2_000_000, maxSearchBytes: 64 * 1024 * 1024, maxSearchEntries: 100, maxSearchResults: 1 })
  const document = (path: string) => ({ path, content: contents.get(path)!, revision: entries.find(entry => entry.path === path)!.revision, generation: 7, digest: `sha256:${'a'.repeat(64)}` })
  const input = { expectedVault: { id: `vault:${'b'.repeat(64)}`, generation: 7 }, source: document('Notes/Source.md'), destination: document('Archive/Dest.md'), placement: 'append' as const, sourceDisposition: 'trash' as const }
  const requests: MergeLinkPreviewRequest[] = []
  const read = async (request: MergeLinkPreviewRequest, signal: AbortSignal): Promise<MergeLinkPreviewResult> => {
    requests.push({ ...request })
    return { ...await inspection.planMergeLinks(request, signal), generation: 7 }
  }
  return { contents, input, read, requests }
}

test('merge preview drains every page and binds the final rebased content without writing notes', async () => {
  const state = fixture()
  const before = [...state.contents]
  const preview = await previewNoteMerge(state.input, state.read, new AbortController().signal)
  assert.equal(preview.destinationContent, '# Dest\r\n\r\n# Source\r\n[Image](../Notes/asset.png)\r\n')
  assert.equal(preview.sourceContent, null)
  assert.equal(preview.sourceDisposition, 'trash')
  assert.equal(preview.plan.complete, true)
  assert.deepEqual(preview.plan.updates.map(update => update.path), ['A.md', 'B.md'])
  assert.equal(preview.request.mergedContent, preview.destinationContent)
  assert.equal(preview.request.cursor, undefined)
  assert.equal(state.requests.length, 4, 'two pages for each of the initial and rebased candidates')
  assert.notEqual(state.requests[0]!.mergedContent, state.requests.at(-1)!.mergedContent)
  assert.deepEqual([...state.contents], before)
})

test('merge preview preserves explicit source policies and unsafe-retirement warnings', async () => {
  for (const sourceDisposition of ['keep', 'trash', 'link', 'embed'] as const) {
    const state = fixture('# Source\n', '# Dest\n', '[[Missing]]\n')
    const before = [...state.contents]
    const preview = await previewNoteMerge({ ...state.input, sourceDisposition }, state.read, new AbortController().signal)
    assert.equal(preview.sourceDisposition, sourceDisposition)
    assert.equal(preview.request.keepSource, sourceDisposition === 'keep')
    assert.equal(preview.plan.requiresKeepSource, true, 'warnings cannot be dropped or treated as permission to retire the source')
    assert.ok(preview.plan.warnings.length)
    assert.equal(preview.sourceContent, sourceDisposition === 'link' ? '[[../Archive/Dest.md|Archive/Dest]]\n' : sourceDisposition === 'embed' ? '![[../Archive/Dest.md]]\n' : null)
    assert.deepEqual([...state.contents], before)
  }
})

test('merge preview requires property choices and preserves prepend and selected values', async () => {
  const state = fixture('---\nstatus: source\n---\n# Source\n', '---\nstatus: destination\n---\n# Dest\n')
  const signal = new AbortController().signal
  await assert.rejects(previewNoteMerge(state.input, state.read, signal), /Choose.*status/u)
  assert.equal(state.requests.length, 0)
  const preview = await previewNoteMerge({ ...state.input, placement: 'prepend', propertyChoices: { status: 'source' } }, state.read, signal)
  assert.equal(preview.destinationContent, '---\nstatus: source\n---\n# Source\n\n# Dest\n')
})

test('merge preview snapshots decisions and checks cancellation after a late reply', async () => {
  const state = fixture()
  const input: NoteMergePreviewInput = state.input
  const preview = await previewNoteMerge(input, async (request, signal) => {
    input.sourceDisposition = 'embed'
    input.placement = 'prepend'
    input.source.content = '# A later draft\n'
    return state.read(request, signal)
  }, new AbortController().signal)
  assert.equal(preview.sourceDisposition, 'trash')
  assert.equal(preview.sourceContent, null)
  assert.ok(preview.destinationContent.startsWith('# Dest'))
  const cancelled = fixture(), abort = new AbortController()
  await assert.rejects(previewNoteMerge(cancelled.input, async (request, signal) => {
    const page = await cancelled.read(request, signal)
    abort.abort()
    return page
  }, abort.signal), { name: 'AbortError' })
  assert.equal(cancelled.requests.length, 1)
})

test('merge preview rejects incomplete, stale, duplicate and oversized page results', async () => {
  const faults: Array<(page: MergeLinkPreviewResult, call: number) => MergeLinkPreviewResult> = [
    page => ({ ...page, cursor: null }),
    page => ({ ...page, generation: page.generation + 1 }),
    page => ({ ...page, source: { ...page.source!, revision: `file:${'0'.repeat(64)}` } }),
    (page, call) => call === 2 ? { ...page, fingerprint: `${page.fingerprint}-changed` } : page,
    (page, call) => call === 2 ? { ...page, updates: [{ ...page.updates[0]!, path: 'A.md' }] } : page,
    page => ({ ...page, updates: [{ ...page.updates[0]!, path: 'Notes/Source.md' }] }),
    page => ({ ...page, updates: [{ ...page.updates[0]!, newContent: 'x'.repeat(2_000_001) }] }),
  ]
  for (const fault of faults) {
    const state = fixture()
    let call = 0
    await assert.rejects(previewNoteMerge(state.input, async (request, signal) => fault(await state.read(request, signal), ++call), new AbortController().signal), /Merge preview/u)
  }
})

test('merge preview rejects content that changes again after rebasing', async () => {
  const state = fixture()
  await assert.rejects(previewNoteMerge(state.input, async (request, signal) => {
    const page = await state.read(request, signal)
    const extra = request.mergedContent.includes('Pass One') ? 'Pass Two' : 'Pass One'
    return { ...page, source: { ...page.source!, content: `${page.source!.content}\n${extra}\n` } }
  }, new AbortController().signal), /did not stabilize/u)
  assert.equal(state.requests.length, 4)
})

test('merge preview bounds non-advancing and endless cursors', async () => {
  for (const repeated of [true, false]) {
    const state = fixture()
    let calls = 0
    await assert.rejects(previewNoteMerge(state.input, async (request, signal) => {
      const { cursor: _cursor, ...initial } = request
      const page = await state.read(initial, signal)
      return { ...page, updates: [], cursor: repeated ? 'same' : `page-${++calls}` }
    }, new AbortController().signal), /cursor|page limit/u)
    assert.ok(state.requests.length <= 200)
  }
})
